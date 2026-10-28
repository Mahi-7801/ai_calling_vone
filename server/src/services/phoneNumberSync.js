const { query, queryAll, insert, isDuplicateKeyError } = require('../config/db');
const { sanitizePhone } = require('../utils/helpers');

// phone_numbers.number carries a GLOBAL unique key (schema: UNIQUE KEY uq_number),
// so a number can only ever belong to one organization. Two consequences that
// used to produce "Duplicate entry '+91...' for key 'uq_number'":
//
//  1. Existence checks were scoped by organization_id. A number owned by
//     another org passed the "does not exist yet" guard and then blew up on the
//     global key.
//  2. Every sync path did check-then-insert, so two concurrent requests (or the
//     same number appearing twice in one carrier response) both passed the
//     guard before either committed.
//
// The fix is to make the whole operation idempotent: dedupe the batch in
// memory, check existence globally on a digits-only key, and let MySQL arbitrate
// with ON DUPLICATE KEY UPDATE so a lost race is a no-op instead of a throw.

const CHUNK_SIZE = 200;

function digitsOf(number) {
  return String(number || '').replace(/\D/g, '');
}

// Carrier payloads are inconsistent ("+91 80653 54620", "918065354620", ...).
// Storing the E.164 form keeps one physical number from becoming two rows.
function toCanonicalNumber(raw) {
  if (raw === undefined || raw === null) return null;
  const cleaned = sanitizePhone(raw);
  return cleaned || null;
}

async function loadKnownNumbers(numbers) {
  const known = new Map();
  const digits = [...new Set(numbers.map(digitsOf).filter(Boolean))];
  if (digits.length === 0) return known;

  for (let i = 0; i < digits.length; i += CHUNK_SIZE) {
    const chunk = digits.slice(i, i + CHUNK_SIZE);
    const rows = await queryAll(
      `SELECT id, organization_id, number, status, employee_id
         FROM phone_numbers
        WHERE REPLACE(number, '+', '') IN (${chunk.map(() => '?').join(',')})`,
      chunk
    );
    for (const row of rows) known.set(digitsOf(row.number), row);
  }
  return known;
}

async function firstOrganizationId() {
  const org = await query('SELECT id FROM organizations ORDER BY id LIMIT 1');
  return org[0]?.id || null;
}

// Returns { added, skipped, conflicts, scanned } instead of throwing, so a
// carrier hiccup can never take down the page that lists phone numbers.
async function syncCarrierNumbers({ provider, organizationId = null, assignToFirstOrg = false } = {}) {
  const result = { added: 0, skipped: 0, conflicts: [], scanned: 0 };

  let carrierNumbers = [];
  try {
    carrierNumbers = (await provider.listPhoneNumbers()) || [];
  } catch (err) {
    result.error = err.message;
    return result;
  }
  if (!Array.isArray(carrierNumbers) || carrierNumbers.length === 0) return result;

  // Dedupe the batch first: the carrier happily returns the same number twice
  // (trial + active rows) and the in-memory guard is cheaper than the DB one.
  const batch = new Map();
  for (const item of carrierNumbers) {
    const number = toCanonicalNumber(item.number ?? item.phone_number ?? item.e164);
    if (number && !batch.has(number)) batch.set(number, item);
  }
  result.scanned = carrierNumbers.length;
  if (batch.size === 0) return result;

  const targetOrgId =
    organizationId || (assignToFirstOrg ? await firstOrganizationId() : null);
  if (!targetOrgId) {
    result.skipped = batch.size;
    return result;
  }

  const known = await loadKnownNumbers([...batch.keys()]);

  for (const [number, item] of batch) {
    const existing = known.get(digitsOf(number));
    if (existing) {
      // Already stored. If it is parked in a different org, surface it instead
      // of silently pretending the sync succeeded for the caller.
      if (Number(existing.organization_id) !== Number(targetOrgId)) {
        result.conflicts.push({ number: existing.number, organization_id: existing.organization_id });
      }
      result.skipped++;
      continue;
    }

    try {
      // ON DUPLICATE KEY UPDATE is the real guard: if a concurrent sync won the
      // race between our SELECT and this INSERT, MySQL/MariaDB updates in place
      // instead of raising ER_DUP_ENTRY.
      //
      // The "added" tally comes from the pre-check above, not from
      // affectedRows: MariaDB reports affectedRows = 1 for a duplicate-key
      // update exactly as it does for a real insert, so the driver value
      // cannot tell the two apart.
      const r = await insert(
        `INSERT INTO phone_numbers (organization_id, number, provider, country, type, status, monthly_cost)
         VALUES (?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), status = IF(status = 'released', 'active', status)`,
        [
          targetOrgId,
          number,
          'vobiz',
          item.country || 'IN',
          item.type || 'local',
          'active',
          Number(item.monthly_cost) || 0,
        ]
      );
      result.added++;
      known.set(digitsOf(number), { id: r.insertId, organization_id: targetOrgId, number });
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      result.skipped++;
    }
  }

  return result;
}

module.exports = { syncCarrierNumbers, toCanonicalNumber, digitsOf };

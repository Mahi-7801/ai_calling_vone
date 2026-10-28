const crypto = require('crypto');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function generateId(prefix) {
  return `${prefix}-${crypto.randomBytes(12).toString('hex')}`;
}

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function safeJson(value, fallback) {
  try {
    if (typeof value === 'string') return JSON.parse(value);
    return value ?? fallback;
  } catch {
    return fallback || value;
  }
}

function parseBool(value, fallback = false) {
  if (value === true || value === 1 || value === '1' || value === 'true' || value === 'on') return true;
  if (value === false || value === 0 || value === '0' || value === 'false' || value === 'off') return false;
  return fallback;
}

function sanitizePhone(phone) {
  if (!phone) return '';
  let p = String(phone).trim().replace(/[^\d+]/g, '');
  if (p.startsWith('0') && p.length === 11) p = p.slice(1);
  if (!p.startsWith('+') && p.length === 10) p = `+91${p}`;
  if (!p.startsWith('+') && p.length === 12 && p.startsWith('91')) p = `+${p}`;
  return p;
}

function toCanonicalNumber(raw) {
  if (raw === undefined || raw === null) return null;
  const cleaned = sanitizePhone(raw);
  return cleaned || null;
}

function isValidPhone(phone) {
  return /^\+?\d{10,15}$/.test(String(phone || '').replace(/[^\d+]/g, ''));
}

function maskNumber(number) {
  if (!number) return '';
  const digits = String(number).replace(/\D/g, '');
  if (digits.length < 6) return number;
  return digits.slice(0, -4).replace(/./g, '•') + digits.slice(-4);
}

function isoDate() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

// `calls.created_at` is filled by MySQL's CURRENT_TIMESTAMP, i.e. the *server's*
// local time (IST = UTC+5:30). Writing call timestamps from Node's toISOString()
// put them 5h30m behind created_at, so "seconds from lead created to call
// answered" came out negative. Pass this sentinel instead of isoDate() for any
// column that is later diffed against created_at, and the update helpers inline
// MySQL's NOW() so both sides come from the same clock.
const SQL_NOW = Symbol('SQL_NOW');

function buildSetClause(fields) {
  const sets = [];
  const params = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v === SQL_NOW) {
      sets.push(`${k} = NOW()`);
    } else {
      sets.push(`${k} = ?`);
      params.push(v);
    }
  }
  return { sets, params };
}

function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

module.exports = {
  asyncHandler,
  generateId,
  randomToken,
  hashToken,
  safeJson,
  parseBool,
  sanitizePhone,
  toCanonicalNumber,
  isValidPhone,
  maskNumber,
  isoDate,
  daysAgo,
  SQL_NOW,
  buildSetClause,
};
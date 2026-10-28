const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse');
const { query, queryOne, insert, update } = require('../config/db');
const { asyncHandler, sanitizePhone, isValidPhone, safeJson } = require('../utils/helpers');
const { AppError } = require('../utils/errors');
const { requireOrg } = require('../middleware/auth');
const { ensureOrgOwned } = require('../middleware/tenant');
const { audit } = require('../services/activity');

const router = express.Router();
router.use(requireOrg);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const FIELD_MAP = {
  name: ['name', 'customer_name', 'first_name', 'fullname', 'lead_name'],
  phone: ['phone', 'mobile', 'phone_number', 'number', 'tel', 'whatsapp'],
  company: ['company', 'business', 'organization', 'firm'],
  purpose: ['purpose', 'reason', 'interest'],
  location: ['location', 'city', 'area', 'district'],
  email: ['email', 'mail', 'email_id'],
  custom_message: ['custom_message', 'message', 'note', 'notes'],
};

const COLUMN_OPTIONS = ['name', 'phone', 'company', 'purpose', 'location', 'email', 'custom_message'];

function mapRow(input, mapping) {
  const lead = {};
  for (const field of COLUMN_OPTIONS) {
    const col = mapping?.[field] || '';
    if (col && input[col] !== undefined && input[col] !== null) lead[field] = String(input[col]).trim();
  }
  lead.phone = sanitizePhone(lead.phone || input.phone || input.mobile || input.number || '');
  return lead;
}

router.get('/', asyncHandler(async (req, res) => {
  const outpero = require('../services/outperoService');
  if (outpero.isConfigured()) {
    const leads = await outpero.listLeads();
    return res.json({ success: true, leads: leads.map((l) => ({
      id: l.id,
      organization_id: req.user.organization_id,
      name: l.name || null,
      phone: l.phone || l.phone_number || '',
      employee_id: l.employee_id || null,
      status: l.status || 'new',
      outcome: l.outcome || null,
      created_at: l.created_at,
      updated_at: l.updated_at || l.created_at,
    })) });
  }
  const orgId = req.user.organization_id;
  const { q, status, outcome, employee_id, campaign_id, limit = 50, offset = 0 } = req.query;
  const where = ['leads.organization_id = ?'];
  const params = [orgId];
  if (q) { where.push('(leads.name LIKE ? OR leads.phone LIKE ? OR leads.company LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (status) { where.push('leads.status = ?'); params.push(status); }
  if (outcome) { where.push('leads.outcome = ?'); params.push(outcome); }
  if (employee_id) { where.push('leads.employee_id = ?'); params.push(parseInt(employee_id, 10)); }
  if (campaign_id) { where.push('leads.campaign_id = ?'); params.push(parseInt(campaign_id, 10)); }
  const whereSql = where.join(' AND ');
  const rows = await query(
    `SELECT leads.*, c.name AS campaign_name, e.name AS employee_name,
       (SELECT COUNT(*) FROM calls cc WHERE cc.lead_id = leads.id) AS total_calls
     FROM leads
     LEFT JOIN campaigns c ON c.id = leads.campaign_id
     LEFT JOIN ai_employees e ON e.id = leads.employee_id
     WHERE ${whereSql}
     ORDER BY leads.created_at DESC
     LIMIT ${parseInt(limit, 10)} OFFSET ${parseInt(offset, 10)}`,
    params
  );
  const rowsAll = await query(`SELECT COUNT(*) AS c FROM leads WHERE ${whereSql}`, params);
  // Grouped with the same filter set as the rows/total, otherwise the badge
  // counts describe the whole org while the table shows one filtered page.
  const count = await query(
    `SELECT status, COUNT(*) AS c FROM leads WHERE ${whereSql} GROUP BY status`, params
  );
  const formattedRows = rows.map((r) => ({
    ...r,
    total_calls: parseInt(r.total_calls || 0, 10),
  }));
  const totalCount = parseInt(rowsAll[0]?.c || 0, 10);
  const countsByStatus = count.map((row) => ({
    status: row.status,
    c: parseInt(row.c || 0, 10),
  }));
  res.json({ success: true, leads: formattedRows, total: totalCount, counts: { byStatus: countsByStatus } });
}));

router.post('/', asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const { name, phone, company, purpose, location, email, custom_message, campaign_id, employee_id } = req.body;
  const cleanPhone = sanitizePhone(phone);
  if (!isValidPhone(cleanPhone)) throw new AppError('A valid phone number is required', 400, 'VALIDATION');
  const existing = await queryOne('SELECT * FROM leads WHERE organization_id = ? AND phone = ?', [orgId, cleanPhone]);
  if (existing) {
    await update('UPDATE leads SET name = ?, company = COALESCE(?, company), purpose = COALESCE(?, purpose), location = COALESCE(?, location), email = COALESCE(?, email) WHERE id = ?',
      [name || existing.name, company || null, purpose || null, location || null, email || null, existing.id]);
    // Re-read so the caller gets the row as it now stands, not the pre-update copy.
    const lead = await queryOne('SELECT * FROM leads WHERE id = ?', [existing.id]);
    return res.json({ success: true, lead, updated: true });
  }
  const r = await insert(
    'INSERT INTO leads (organization_id, name, phone, company, purpose, location, email, custom_message, campaign_id, employee_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [orgId, name || 'Lead', cleanPhone, company || null, purpose || null, location || null, email || null, custom_message || null, campaign_id || null, employee_id || null]
  );
  const lead = await queryOne('SELECT * FROM leads WHERE id = ?', [r.insertId]);
  await audit(req, 'lead.create', 'lead', r.insertId, { phone: cleanPhone });
  res.status(201).json({ success: true, lead });
}));

router.post('/import', upload.single('file'), asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  let rows = [];
  if (req.file) {
    const text = req.file.buffer.toString('utf8');
    rows = await parseCSV(text);
  } else if (req.body.csv_text) {
    rows = await parseCSV(String(req.body.csv_text));
  } else if (req.body.contacts) {
    rows = Array.isArray(req.body.contacts) ? req.body.contacts : safeJson(req.body.contacts, []);
  } else {
    throw new AppError('CSV file, csv_text, or contacts array is required', 400, 'VALIDATION');
  }

  const mapping = safeJson(req.body.mapping, null) || {};
  const employee_id = parseInt(req.body.employee_id, 10) || null;

  let imported = 0;
  let skipped = 0;
  for (const raw of rows) {
    const lead = mapRow(raw, mapping);
    if (!lead.phone && raw.phone) lead.phone = sanitizePhone(raw.phone);
    if (!lead.name && raw.name) lead.name = String(raw.name).trim();
    if (!lead.company && raw.company) lead.company = String(raw.company).trim();
    if (!lead.purpose && raw.purpose) lead.purpose = String(raw.purpose).trim();
    if (!lead.location && raw.location) lead.location = String(raw.location).trim();
    if (!lead.email && raw.email) lead.email = String(raw.email).trim();
    if (!lead.custom_message && raw.custom_message) lead.custom_message = String(raw.custom_message).trim();

    if (!isValidPhone(lead.phone)) { skipped++; continue; }
    const existing = await queryOne('SELECT id FROM leads WHERE organization_id = ? AND phone = ?', [orgId, lead.phone]);
    if (existing) {
      await update(
        'UPDATE leads SET name = COALESCE(?, name), company = COALESCE(?, company), purpose = COALESCE(?, purpose), location = COALESCE(?, location), email = COALESCE(?, email) WHERE id = ?',
        [lead.name || null, lead.company || null, lead.purpose || null, lead.location || null, lead.email || null, existing.id]
      );
      skipped++;
      continue;
    }
    await insert(
      'INSERT INTO leads (organization_id, name, phone, company, purpose, location, email, custom_message, employee_id) VALUES (?,?,?,?,?,?,?,?,?)',
      [orgId, lead.name || 'Lead', lead.phone, lead.company || null, lead.purpose || null, lead.location || null, lead.email || null, lead.custom_message || null, employee_id]
    );
    imported++;
  }
  await audit(req, 'lead.import', 'lead', null, { imported, skipped });
  res.status(201).json({ success: true, imported, skipped, total: rows.length });
}));

async function parseCSV(text) {
  const result = await new Promise((resolve, reject) => {
    const out = [];
    parse(text, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true, bom: true })
      .on('data', (r) => out.push(r))
      .on('end', () => resolve(out))
      .on('error', reject);
  });
  return result;
}

router.post('/preview', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('CSV file is required', 400, 'VALIDATION');
  const text = req.file.buffer.toString('utf8');
  const rows = await parseCSV(text);
  const headers = Object.keys(rows[0] || {});
  res.json({ success: true, headers, preview: rows.slice(0, 8), total: rows.length });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const leadId = parseInt(req.params.id, 10);
  if (isNaN(leadId) || leadId <= 0) {
    throw new AppError('Invalid lead ID', 400, 'INVALID_ID');
  }
  const lead = await queryOne('SELECT * FROM leads WHERE id = ? AND organization_id = ?', [leadId, req.user.organization_id]);
  if (!lead) throw new AppError('Lead not found', 404, 'NOT_FOUND');
  const contacts = await query('SELECT * FROM lead_contacts WHERE lead_id = ?', [lead.id]);
  const calls = await query('SELECT * FROM calls WHERE lead_id = ? ORDER BY created_at DESC', [lead.id]);
  res.json({ success: true, lead: { ...lead, contacts, calls } });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const leadId = parseInt(req.params.id, 10);
  await ensureOrgOwned('leads', leadId, req.user.organization_id);
  const allow = ['name', 'phone', 'company', 'purpose', 'location', 'email', 'custom_message', 'status', 'outcome', 'interest', 'next_followup', 'employee_id'];
  const sets = [];
  const params = [];
  for (const k of allow) {
    if (req.body[k] !== undefined) { sets.push(`${k} = ?`); params.push(req.body[k]); }
  }
  if (!sets.length) throw new AppError('Nothing to update', 400, 'VALIDATION');
  await insert(`UPDATE leads SET ${sets.join(', ')} WHERE id = ?`, [...params, leadId]);
  await audit(req, 'lead.update', 'lead', leadId);
  const lead = await queryOne('SELECT * FROM leads WHERE id = ?', [leadId]);
  res.json({ success: true, lead });
}));

router.post('/bulk-delete', asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map((id) => parseInt(id, 10)).filter(Boolean) : [];
  if (ids.length === 0) throw new AppError('No lead IDs provided', 400, 'VALIDATION');
  const placeholders = ids.map(() => '?').join(',');
  // Dissociate any calls referencing these leads and remove campaign mappings
  await update(`UPDATE calls SET lead_id = NULL WHERE lead_id IN (${placeholders})`, ids).catch(() => {});
  await update(`DELETE FROM campaign_leads WHERE lead_id IN (${placeholders})`, ids).catch(() => {});
  await update(`DELETE FROM leads WHERE organization_id = ? AND id IN (${placeholders})`, [orgId, ...ids]);
  await audit(req, 'lead.bulk_delete', 'lead', null, { count: ids.length });
  res.json({ success: true, count: ids.length });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const leadId = parseInt(req.params.id, 10);
  await ensureOrgOwned('leads', leadId, req.user.organization_id);
  // Dissociate any calls referencing this lead and remove campaign mappings
  await update('UPDATE calls SET lead_id = NULL WHERE lead_id = ?', [leadId]).catch(() => {});
  await update('DELETE FROM campaign_leads WHERE lead_id = ?', [leadId]).catch(() => {});
  await update('DELETE FROM leads WHERE id = ?', [leadId]);
  res.json({ success: true });
}));

module.exports = router;
const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse');
const { query, queryOne, insert, update, isDuplicateKeyError } = require('../config/db');
const { asyncHandler, isValidPhone, sanitizePhone, safeJson } = require('../utils/helpers');
const { AppError } = require('../utils/errors');
const { requireOrg } = require('../middleware/auth');
const { ensureOrgOwned } = require('../middleware/tenant');
const { startCampaign, pauseCampaign } = require('../services/campaignService');
const { audit } = require('../services/activity');
const realtime = require('../services/realtime');

const router = express.Router();
router.use(requireOrg);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const FIELD_MAP = {
  name: ['name', 'customer_name', 'first_name', 'fullname'],
  phone: ['phone', 'mobile', 'phone_number', 'number', 'tel'],
  company: ['company', 'business', 'organization'],
  purpose: ['purpose', 'reason'],
  location: ['location', 'city', 'area'],
  email: ['email', 'mail'],
  custom_message: ['custom_message', 'message', 'note'],
};

async function parseCSV(text) {
  return new Promise((resolve, reject) => {
    const out = [];
    parse(text, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true, bom: true })
      .on('data', (r) => out.push(r))
      .on('end', () => resolve(out))
      .on('error', reject);
  });
}

function mapFields(raw, mapping) {
  const lead = {};
  for (const [field, aliases] of Object.entries(FIELD_MAP)) {
    const col = mapping?.[field];
    if (col && raw[col] !== undefined) lead[field] = String(raw[col]).trim();
    else if (!col) {
      const hit = aliases.map((a) => raw[a]).find((v) => v !== undefined && v !== '');
      if (hit !== undefined) lead[field] = String(hit).trim();
    }
  }
  lead.phone = sanitizePhone(lead.phone || '');
  return lead;
}

router.get('/', asyncHandler(async (req, res) => {
  const outpero = require('../services/outperoService');
  if (outpero.isConfigured()) {
    const campaigns = await outpero.listCampaigns();
    return res.json({ success: true, campaigns: campaigns.map((c) => ({
      id: c.id,
      organization_id: req.user.organization_id,
      name: c.name,
      employee_id: c.employee_id,
      status: c.status || 'draft',
      total_leads: c.total_leads || 0,
      pending_leads: c.pending_leads || 0,
      processed_leads: c.processed_leads || 0,
      completed_leads: c.completed_leads || 0,
      failed_leads: c.failed_leads || 0,
      created_at: c.created_at,
      employee_name: c.employee_name || null,
    })) });
  }
  const campaigns = await query(
    `SELECT c.*, e.name AS employee_name, e.role AS employee_role
     FROM campaigns c
     LEFT JOIN ai_employees e ON e.id = c.employee_id
     WHERE c.organization_id = ?
     ORDER BY c.created_at DESC`,
    [req.user.organization_id]
  );
  for (const c of campaigns) {
    c.schedule = safeJson(c.schedule, null);
    c.call_rules = safeJson(c.call_rules, null);
  }
  res.json({ success: true, campaigns });
}));

router.post('/', upload.single('file'), asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const body = req.body.body ? (typeof req.body.body === 'string' ? safeJson(req.body.body, {}) : safeJson(req.body.body, {})) : { ...req.body };
  for (const k of ['call_rules', 'schedule', 'mapping']) {
    if (body[k] && typeof body[k] === 'string') body[k] = safeJson(body[k], {});
  }
  if (!body.name) throw new AppError('Campaign name is required', 400, 'VALIDATION');
  if (!body.employee_id) throw new AppError('Select an AI employee', 400, 'VALIDATION');
  const emp = await queryOne('SELECT * FROM ai_employees WHERE id = ? AND organization_id = ?', [parseInt(body.employee_id, 10), orgId]);
  if (!emp) throw new AppError('Employee not found', 404, 'NOT_FOUND');

  const isScheduled = body.schedule && (body.schedule.mode === 'later' || body.schedule.mode === 'scheduled');
  const initialStatus = isScheduled ? 'scheduled' : 'pending';

  const r = await insert(
    'INSERT INTO campaigns (organization_id, name, employee_id, status, call_rules, schedule, concurrency) VALUES (?,?,?,?,?,?,?)',
    [orgId, body.name, emp.id, initialStatus, JSON.stringify(body.call_rules || {}), JSON.stringify(body.schedule || {}), body.concurrency || 3]
  );
  const campaignId = r.insertId;

  let imported = 0;
  let skipped = 0;
  let rows = [];
  const mapping = body.mapping || null;

  if (req.file) {
    const text = req.file.buffer.toString('utf8');
    rows = await parseCSV(text);
  } else if (body.contacts) {
    rows = Array.isArray(body.contacts) ? body.contacts : (typeof body.contacts === 'string' ? safeJson(body.contacts, []) : []);
  }

  for (const raw of rows) {
    const lead = mapFields(raw, mapping);
    if (!lead.phone && raw.phone) lead.phone = sanitizePhone(raw.phone);
    if (!lead.name && raw.name) lead.name = String(raw.name).trim();
    if (!lead.company && raw.company) lead.company = String(raw.company).trim();
    if (!lead.purpose && raw.purpose) lead.purpose = String(raw.purpose).trim();
    if (!lead.location && raw.location) lead.location = String(raw.location).trim();
    if (!lead.email && raw.email) lead.email = String(raw.email).trim();
    if (!lead.custom_message && raw.custom_message) lead.custom_message = String(raw.custom_message).trim();

    if (!isValidPhone(lead.phone)) { skipped++; continue; }
    const existing = await queryOne('SELECT id FROM leads WHERE organization_id = ? AND phone = ?', [orgId, lead.phone]);
    let leadId;
    if (existing) {
      leadId = existing.id;
      await update(
        'UPDATE leads SET name = COALESCE(?, name), company = COALESCE(?, company), purpose = COALESCE(?, purpose), location = COALESCE(?, location), email = COALESCE(?, email), custom_message = COALESCE(?, custom_message) WHERE id = ?',
        [lead.name || null, lead.company || null, lead.purpose || null, lead.location || null, lead.email || null, lead.custom_message || null, leadId]
      );
    } else {
      const lr = await insert(
        'INSERT INTO leads (organization_id, name, phone, company, purpose, location, email, custom_message) VALUES (?,?,?,?,?,?,?,?)',
        [orgId, lead.name || 'Lead', lead.phone, lead.company || null, lead.purpose || null, lead.location || null, lead.email || null, lead.custom_message || null]
      );
      leadId = lr.insertId;
    }
    const inCampaign = await queryOne('SELECT id FROM campaign_leads WHERE campaign_id = ? AND lead_id = ?', [campaignId, leadId]);
    if (inCampaign) continue;
    // uq_cl makes this INSERT racy: the same lead can appear twice in one CSV,
    // or two imports can overlap. The SELECT above is not atomic, so tolerate a
    // lost race instead of failing the whole import.
    try {
      await insert('INSERT INTO campaign_leads (campaign_id, lead_id) VALUES (?,?)', [campaignId, leadId]);
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      continue;
    }
    await update('UPDATE leads SET campaign_id = ?, employee_id = ? WHERE id = ?', [campaignId, emp.id, leadId]);
    imported++;
  }

  await update('UPDATE campaigns SET total_leads = ?, pending_leads = ? WHERE id = ?', [imported, imported, campaignId]);
  await audit(req, 'campaign.create', 'campaign', campaignId, { imported, skipped });

  if ((body.launchImmediately === true || body.launchImmediately === 'true') && (!body.schedule || body.schedule.mode !== 'later')) {
    await startCampaign(orgId, campaignId).catch((err) => console.error('Auto launch failed:', err.message));
  }

  const campaign = await queryOne('SELECT * FROM campaigns WHERE id = ?', [campaignId]);
  res.status(201).json({ success: true, campaign: { ...campaign, imported, skipped } });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const cid = parseInt(req.params.id, 10);
  if (isNaN(cid) || cid <= 0) {
    throw new AppError('Invalid campaign ID', 400, 'INVALID_ID');
  }
  const campaign = await queryOne(
    `SELECT c.*, e.name AS employee_name, e.role AS employee_role FROM campaigns c
     LEFT JOIN ai_employees e ON e.id = c.employee_id
     WHERE c.id = ? AND c.organization_id = ?`, [cid, req.user.organization_id]);
  if (!campaign) throw new AppError('Campaign not found', 404, 'NOT_FOUND');
  campaign.schedule = safeJson(campaign.schedule, null);
  campaign.call_rules = safeJson(campaign.call_rules, null);
  const leads = await query(
    `SELECT cl.status AS cl_status, cl.attempt_count, l.*, e.name AS employee_name
     FROM campaign_leads cl JOIN leads l ON l.id = cl.lead_id
     LEFT JOIN ai_employees e ON e.id = l.employee_id
     WHERE cl.campaign_id = ? AND l.organization_id = ?
     ORDER BY cl.id DESC LIMIT 200`,
    [cid, req.user.organization_id]);
  res.json({ success: true, campaign: { ...campaign, leads } });
}));

router.post('/:id/start', asyncHandler(async (req, res) => {
  const cid = parseInt(req.params.id, 10);
  const campaign = await startCampaign(req.user.organization_id, cid);
  await audit(req, 'campaign.start', 'campaign', cid);
  res.json({ success: true, campaign });
}));

router.post('/:id/pause', asyncHandler(async (req, res) => {
  const cid = parseInt(req.params.id, 10);
  const campaign = await pauseCampaign(req.user.organization_id, cid);
  await audit(req, 'campaign.pause', 'campaign', cid);
  res.json({ success: true, campaign });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const cid = parseInt(req.params.id, 10);
  await ensureOrgOwned('campaigns', cid, req.user.organization_id);

  // 1. Dissociate any calls referencing this campaign so call logs are preserved and FK constraint is satisfied
  await update('UPDATE calls SET campaign_id = NULL WHERE campaign_id = ?', [cid]).catch(() => {});

  // 2. Remove all campaign leads mapping records
  await update('DELETE FROM campaign_leads WHERE campaign_id = ?', [cid]);

  // 3. Delete the campaign record
  await update('DELETE FROM campaigns WHERE id = ?', [cid]);

  // 4. Audit deletion
  await audit(req, 'campaign.delete', 'campaign', cid).catch(() => {});

  res.json({ success: true });
}));

module.exports = router;
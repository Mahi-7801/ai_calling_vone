const express = require('express');
const bcrypt = require('bcryptjs');
const { query, queryOne, insert, update } = require('../config/db');
const { asyncHandler, randomToken, hashToken } = require('../utils/helpers');
const { AppError } = require('../utils/errors');
const { requireOrg } = require('../middleware/auth');
const { audit } = require('../services/activity');

const router = express.Router();
router.use(requireOrg);

async function getSettings(orgId) {
  const rows = await query('SELECT * FROM settings WHERE organization_id = ?', [orgId]);
  const out = {};
  for (const r of rows) out[r.section] = JSON.parse(r.data);
  return out;
}

router.get('/', asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const [settings, profile, org, keys] = await Promise.all([
    getSettings(orgId),
    queryOne('SELECT id, name, email, phone, avatar_url FROM users WHERE id = ?', [req.user.id]),
    queryOne('SELECT * FROM organizations WHERE id = ?', [orgId]),
    query('SELECT id, name, key_prefix, is_active, expires_at, created_at, last_used_at FROM api_keys WHERE organization_id = ? ORDER BY created_at DESC', [orgId]),
  ]);
  res.json({ success: true, settings, profile, organization: org, apiKeys: keys });
}));

router.get('/defaults', asyncHandler(async (req, res) => {
  const settings = await getSettings(req.user.organization_id);
  const employees = await query('SELECT id, name, status FROM ai_employees WHERE organization_id = ?', [req.user.organization_id]);
  res.json({ success: true, settings, employees });
}));

// settings has UNIQUE KEY uq_setting (organization_id, section). Doing
// SELECT-then-INSERT is not atomic, so two concurrent saves for the same section
// (double-click, two tabs) race and the loser hits ER_DUP_ENTRY. ON DUPLICATE
// KEY UPDATE makes the write idempotent in a single statement.
async function upsertSetting(orgId, section, data) {
  await insert(
    'INSERT INTO settings (organization_id, section, data) VALUES (?,?,?) ON DUPLICATE KEY UPDATE data = VALUES(data)',
    [orgId, section, JSON.stringify(data)]
  );
}

router.put('/:section', asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const { section } = req.params;
  const allowed = ['profile', 'company', 'ai_defaults', 'calling', 'notifications', 'webhooks', 'api_keys', 'security', 'billing'];
  if (!allowed.includes(section)) throw new AppError('Unknown settings section', 400, 'VALIDATION');

  if (section === 'profile') {
    const { name, phone, avatar_url } = req.body;
    await insert('UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone), avatar_url = COALESCE(?, avatar_url) WHERE id = ?',
      [name || null, phone || null, avatar_url || null, req.user.id]);
  } else if (section === 'company') {
    const { name, business_type, calling_purpose, preferred_language } = req.body;
    const sets = []; const params = [];
    for (const k of ['name', 'business_type', 'calling_purpose', 'preferred_language']) {
      if (req.body[k] !== undefined) { sets.push(`${k} = ?`); params.push(req.body[k]); }
    }
    if (sets.length) await insert(`UPDATE organizations SET ${sets.join(', ')} WHERE id = ?`, [...params, orgId]);
  } else if (section === 'security') {
    const { current_password, new_password } = req.body;
    if (new_password) {
      if (!current_password) throw new AppError('Current password required', 400, 'VALIDATION');
      const user = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
      const ok = await bcrypt.compare(current_password, user.password_hash);
      if (!ok) throw new AppError('Current password is incorrect', 400, 'INVALID_PASSWORD');
      const hash = await bcrypt.hash(new_password, 10);
      await insert('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
    }
  } else if (section === 'api_keys') {
    const { action } = req.body;
    if (action === 'create') {
      const token = `tk_${randomToken(24)}`;
      const r = await insert(
        'INSERT INTO api_keys (organization_id, name, key_prefix, key_hash) VALUES (?,?,?,?)',
        [orgId, req.body.name || 'API Key', token.slice(0, 8), hashToken(token)]
      );
      await audit(req, 'apikey.create', 'api_key', r.insertId);
      return res.json({ success: true, apiKey: { id: r.insertId, name: req.body.name || 'API Key', value: token } });
    }
    if (action === 'revoke') {
      await insert('DELETE FROM api_keys WHERE id = ? AND organization_id = ?', [parseInt(req.body.id, 10), orgId]);
      return res.json({ success: true });
    }
  }

  const { data } = req.body;
  if (data) await upsertSetting(orgId, section, data);

  await audit(req, `settings.${section}.update`);
  const settings = await getSettings(orgId);
  res.json({ success: true, settings });
}));

module.exports = router;
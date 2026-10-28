const express = require('express');
const crypto = require('crypto');
const { query, queryOne, insert, update } = require('../config/db');
const { asyncHandler, randomToken } = require('../utils/helpers');
const { AppError } = require('../utils/errors');
const { requireOrg } = require('../middleware/auth');
const { ensureOrgOwned } = require('../middleware/tenant');
const { audit } = require('../services/activity');

const config = require('../config/env');
const walletService = require('../services/walletService');

const router = express.Router();

/**
 * POST /api/webhooks/razorpay
 * Public webhook endpoint for automated Razorpay payment capture and wallet crediting
 */
router.post('/razorpay', asyncHandler(async (req, res) => {
  const rawBody = req.rawBody || JSON.stringify(req.body || {});
  const signature = req.get('x-razorpay-signature');
  const secret = config.providers.payment.webhookSecret || config.providers.payment.secret;

  if (secret && signature) {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const bufA = Buffer.from(expected, 'utf8');
    const bufB = Buffer.from(signature, 'utf8');
    if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
      throw new AppError('Invalid webhook signature', 400, 'INVALID_SIGNATURE');
    }
  }

  const event = req.body?.event;
  const entity = req.body?.payload?.payment?.entity || {};
  const CREDITING_EVENTS = new Set(['payment.captured', 'order.paid']);
  if (!CREDITING_EVENTS.has(event)) {
    return res.json({ success: true, received: true, event, credited: false });
  }

  const paymentId = entity.id || req.body?.payload?.order?.entity?.payment_id;
  const orderId = entity.order_id || req.body?.payload?.order?.entity?.id;

  if (!paymentId || !orderId) {
    return res.json({ success: true, received: true, credited: false, reason: 'missing identifiers' });
  }

  const order = await queryOne('SELECT * FROM razorpay_orders WHERE order_id = $1', [orderId]);
  if (!order) {
    return res.json({ success: true, received: true, credited: false, reason: 'no matching order' });
  }

  const result = await walletService.verifyAndCreditDeposit({
    orgId: order.organization_id,
    userId: order.user_id,
    orderId,
    paymentId,
    signature: signature || null,
    webhookPayload: req.body,
  });

  res.json({ success: true, received: true, event, credited: result.credited });
}));

router.use(requireOrg);

const EVENTS = ['call.started', 'call.connected', 'call.completed', 'call.failed', 'lead.created', 'lead.updated', 'campaign.completed'];

router.get('/', asyncHandler(async (req, res) => {
  const webhooks = await query('SELECT * FROM webhooks WHERE organization_id = ? ORDER BY created_at DESC', [req.user.organization_id]);
  const deliveries = await query(
    `SELECT wd.*, w.url FROM webhook_deliveries wd JOIN webhooks w ON w.id = wd.webhook_id
     WHERE w.organization_id = ? ORDER BY wd.id DESC LIMIT 50`, [req.user.organization_id]);
  res.json({ success: true, webhooks: webhooks.map((w) => ({ ...w, events: JSON.parse(w.events || '[]') })), deliveries });
}));

router.post('/', asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const { url, events, secret } = req.body;
  if (!url) throw new AppError('Webhook URL is required', 400, 'VALIDATION');
  const r = await insert(
    'INSERT INTO webhooks (organization_id, url, secret, events, is_active) VALUES (?,?,?,?,1)',
    [orgId, url, secret || randomToken(16), JSON.stringify(events || EVENTS)]
  );
  await audit(req, 'webhook.create', 'webhook', r.insertId, { url });
  const row = await queryOne('SELECT * FROM webhooks WHERE id = ?', [r.insertId]);
  res.status(201).json({ success: true, webhook: { ...row, events: JSON.parse(row.events) } });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await ensureOrgOwned('webhooks', id, req.user.organization_id);
  const { url, events, secret, is_active } = req.body;
  const sets = []; const params = [];
  if (url) { sets.push('url = ?'); params.push(url); }
  if (events) { sets.push('events = ?'); params.push(JSON.stringify(events)); }
  if (secret) { sets.push('secret = ?'); params.push(secret); }
  if (is_active !== undefined) { sets.push('is_active = ?'); params.push(is_active ? 1 : 0); }
  if (!sets.length) throw new AppError('Nothing to update', 400, 'VALIDATION');
  await insert(`UPDATE webhooks SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  res.json({ success: true });
}));

router.post('/test', asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const { url } = req.body;
  const delivery = await insert(
    'INSERT INTO webhook_deliveries (webhook_id, event, payload, status, attempts) VALUES (?,?,?,?,0)',
    [0, 'test.ping', JSON.stringify({ ping: true, at: new Date().toISOString() })]
  );
  const body = { event: 'test.ping', data: { ok: true } };
  let ok = false;
  let response = '';
  try {
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000),
    });
    response = `HTTP ${r.status}`;
    ok = r.ok;
  } catch (err) {
    response = err.message;
  }
  await update('UPDATE webhook_deliveries SET status = ?, response = ? WHERE id = ?', [ok ? 'delivered' : 'failed', response, delivery.insertId]);
  res.json({ success: true, ok, response });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await ensureOrgOwned('webhooks', id, req.user.organization_id);
  await update('DELETE FROM webhooks WHERE id = ?', [id]);
  res.json({ success: true });
}));

module.exports = router;
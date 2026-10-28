const crypto = require('crypto');
const config = require('../config/env');

async function dispatch(orgId, event, payload) {
  const { query } = require('../config/db');
  const { insert } = require('../config/db');
  const webhooks = await query(
    'SELECT * FROM webhooks WHERE organization_id = ? AND is_active = 1 AND JSON_CONTAINS(events, CAST(? AS JSON))',
    [orgId, JSON.stringify(event)]
  );
  if (!webhooks.length) return;

  for (const wh of webhooks) {
    const deliveryId = await insert(
      'INSERT INTO webhook_deliveries (webhook_id, event, payload, status, attempts) VALUES (?,?,?,?,0)',
      [wh.id, event, JSON.stringify(payload)]
    );
    fireWebhook(wh, deliveryId, event, payload);
  }
}

async function fireWebhook(wh, deliveryId, event, payload) {
  const { insert } = require('../config/db');
  const body = {
    id: crypto.randomUUID(),
    event,
    created_at: new Date().toISOString(),
    data: payload,
  };
  const signature = crypto.createHmac('sha256', wh.secret || 'secret').update(JSON.stringify(body)).digest('hex');
  let ok = false;
  let response = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(wh.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': signature },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      response = `HTTP ${res.status} ${await res.text()}`;
      ok = res.status >= 200 && res.status < 300;
      await insert(
        'UPDATE webhook_deliveries SET status = ?, attempts = ?, response = ? WHERE id = ?',
        [ok ? 'delivered' : 'failed', attempt, response, deliveryId]
      );
      if (ok) return;
    } catch (err) {
      response = `attempt ${attempt}: ${err.message}`;
      await insert(
        'UPDATE webhook_deliveries SET status = "failed", attempts = ?, response = ? WHERE id = ?',
        [attempt, response, deliveryId]
      );
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

module.exports = { dispatch };
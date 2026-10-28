const express = require('express');
const config = require('../config/env');
const { query, queryOne, insert, update } = require('../config/db');
const { generateId } = require('../utils/helpers');
const { AppError } = require('../utils/errors');
const { asyncHandler } = require('../utils/helpers');
const { requireOrg } = require('../middleware/auth');
const { getWallet, purchaseCredits } = require('../services/credits');
const { getPaymentProvider } = require('../providers');
const { audit } = require('../services/activity');
const realtime = require('../services/realtime');

const router = express.Router();
/**
 * Razorpay webhook - the authoritative completion signal.
 *
 * Checkout verification can be lost if the browser closes between payment and
 * redirect. Razorpay retries this for up to 24h, so credits land even then.
 * Unauthenticated by JWT: the webhook is identified by its signature instead.
 */
router.post('/webhook/razorpay', asyncHandler(async (req, res) => {
  const rawBody = req.rawBody || JSON.stringify(req.body || {});
  const signature = req.get('x-razorpay-signature');
  const provider = getPaymentProvider();

  if (typeof provider.verifyWebhookSignature !== 'function') {
    throw new AppError('Provider does not support webhook verification', 400, 'WEBHOOK_UNSUPPORTED');
  }
  if (!config.providers.payment.webhookSecret) {
    throw new AppError('PAYMENT_WEBHOOK_SECRET is not configured; refusing to trust an unverifiable webhook', 500, 'WEBHOOK_NOT_CONFIGURED');
  }
  if (!provider.verifyWebhookSignature(rawBody, signature)) {
    throw new AppError('Invalid webhook signature', 400, 'WEBHOOK_SIGNATURE_INVALID');
  }

  const event = req.body?.event;
  const entity = req.body?.payload?.payment?.entity || {};

  // Only capture-style events grant credits; authorised/failed/refunded must not.
  const CREDITING_EVENTS = new Set(['payment.captured', 'order.paid']);
  if (!CREDITING_EVENTS.has(event)) {
    return res.json({ success: true, received: true, event, credited: false });
  }

  const razorpayPaymentId = entity.id || req.body?.payload?.order?.entity?.payment_id;
  const razorpayOrderId = req.body?.payload?.order?.entity?.id;
  if (!razorpayPaymentId) return res.json({ success: true, received: true, credited: false });

  const payment = await queryOne(
    'SELECT * FROM payments WHERE reference = ? OR metadata LIKE ? ORDER BY id DESC LIMIT 1',
    [razorpayOrderId || razorpayPaymentId, `%"razorpayPaymentId":"${razorpayPaymentId}"%`]
  );
  if (!payment) return res.json({ success: true, received: true, credited: false, reason: 'no matching order' });

  const result = await grantCreditsForPayment({
    payment: { ...payment, reference: razorpayPaymentId },
    orgId: payment.organization_id,
    credits: null,
    req: null,
  });

  res.json({ success: true, received: true, event, credited: !result.alreadyPaid });
}));

router.use(requireOrg);

async function readPricing() {
  const row = await queryOne("SELECT data FROM admin_settings WHERE section = 'pricing'");
  if (row) return JSON.parse(row.data);
  return {
    creditPerMinute: 2,
    packages: [
      { key: 'starter', name: 'Starter', price: 999, credits: 500 },
      { key: 'growth', name: 'Growth', price: 2999, credits: 2000 },
      { key: 'business', name: 'Business', price: 7999, credits: 6000 },
      { key: 'enterprise', name: 'Enterprise', price: 19999, credits: 20000 },
    ],
  };
}

router.get('/packages', asyncHandler(async (_req, res) => {
  res.json({ success: true, pricing: await readPricing() });
}));

router.get('/', asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const [wallet, transactions, subscription, payments] = await Promise.all([
    getWallet(orgId),
    query('SELECT * FROM credit_transactions WHERE organization_id = ? ORDER BY created_at DESC LIMIT 100', [orgId]),
    queryOne('SELECT * FROM subscriptions WHERE organization_id = ? ORDER BY created_at DESC LIMIT 1', [orgId]),
    query('SELECT * FROM payments WHERE organization_id = ? ORDER BY created_at DESC LIMIT 50', [orgId]),
  ]);
  const usage = await queryOne(
    `SELECT COUNT(*) AS calls, IFNULL(ROUND(SUM(duration)/60,1),0) AS minutes,
            IFNULL(SUM(credits_used),0) AS credits_consumed
     FROM calls WHERE organization_id = ? AND status = 'completed'`,
    [orgId]
  );
  res.json({ success: true, billing: { wallet, transactions, subscription, payments, usage, pricing: await readPricing() } });
}));

router.post('/create-order', asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const { packageKey, amount, credits } = req.body;
  const pricing = await readPricing();
  const pkg = pricing.packages.find((p) => p.key === packageKey);
  const payAmount = amount || pkg?.price || 0;
  const payCredits = credits || pkg?.credits || 0;
  const paymentProvider = getPaymentProvider();
  const order = await paymentProvider.createOrder({
    orgId, amount: payAmount, currency: 'INR', description: `Credit purchase - ${payCredits} credits`,
  });
  const r = await insert(
    'INSERT INTO payments (organization_id, amount, currency, status, provider, reference, metadata) VALUES (?,?,?,?,?,?,?)',
    [orgId, payAmount, 'INR', 'pending', order.provider, order.orderId, JSON.stringify({ packageKey, credits: payCredits })]
  );
  res.json({ success: true, order: { ...order, paymentId: r.insertId, credits: payCredits } });
}));

/**
 * Grant credits for a verified payment exactly once.
 *
 * Extracted so both the checkout return path and the webhook can call it; two
 * copies of this is how a purchase ends up crediting twice or not at all.
 */
async function grantCreditsForPayment({ payment, orgId, credits, req }) {
  if (payment.status === 'paid') {
    const wallet = await getWallet(orgId);
    return { walletBalance: wallet.balance, alreadyPaid: true };
  }

  const amount = Number(payment.amount);
  const metadata = typeof payment.metadata === 'string'
    ? JSON.parse(payment.metadata || '{}')
    : payment.metadata || {};
  const creditCount = credits || metadata.credits || Math.round(amount / 2);

  await update('UPDATE payments SET status = "paid" WHERE id = ?', [payment.id]);
  const balance = await purchaseCredits(orgId, creditCount, payment.reference);
  if (req) await audit(req, 'billing.purchase', 'payment', payment.id, { amount, credits: creditCount });
  realtime.emit(orgId, 'credits.updated', { balance });
  return { walletBalance: balance, creditsAdded: creditCount };
}

router.post('/verify-payment', asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const { orderId, paymentRecordId, credits: requestedCredits } = req.body;
  // `paymentId` here is Razorpay's own payment id from the checkout handler.
  // It used to be the MySQL primary key, which meant nothing was ever actually
  // signed and verification could not succeed.
  const { paymentId, signature } = req.body;

  const payment = await queryOne('SELECT * FROM payments WHERE id = ? AND organization_id = ?', [paymentRecordId, orgId]);
  if (!payment) throw new AppError('Payment not found', 404, 'NOT_FOUND');

  // The stored razorpay_order_id must match what the checkout returned, or a
  // signature harvested from one purchase could be replayed against another.
  if (orderId && payment.reference && orderId !== payment.reference) {
    throw new AppError('Order does not match this payment record', 400, 'ORDER_MISMATCH');
  }

  const paymentProvider = getPaymentProvider();
  const verified = await paymentProvider.verifyPayment({ orderId, paymentId, signature });
  if (!verified.verified) {
    throw new AppError(`Payment verification failed: ${verified.reason || 'unknown reason'}`, 400, 'PAYMENT_FAILED');
  }

  await update('UPDATE payments SET reference = ? WHERE id = ?', [paymentId, payment.id]);
  const result = await grantCreditsForPayment({
    payment: { ...payment, reference: paymentId },
    orgId,
    credits: requestedCredits,
    req,
  });

  res.json({ success: true, ...result });
}));

module.exports = router;
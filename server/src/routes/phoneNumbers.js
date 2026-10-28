const express = require('express');
const { query, queryOne, insert, update, isDuplicateKeyError } = require('../config/db');
const { asyncHandler } = require('../utils/helpers');
const { AppError } = require('../utils/errors');
const { requireOrg, requireAdmin } = require('../middleware/auth');
const { ensureOrgOwned } = require('../middleware/tenant');
const { getTelephonyProvider, getPaymentProvider } = require('../providers');
const { audit } = require('../services/activity');
const { syncCarrierNumbers, toCanonicalNumber } = require('../services/phoneNumberSync');
const { provisionInboundForNumber, getInboundStatus } = require('../services/inboundProvisioning');
const config = require('../config/env');

// Razorpay is the only gateway that can be verified here: it returns a
// signature we recompute against our own secret. Anything else is rejected
// rather than trusted, because a number provisioned without a verified
// payment is a real carrier cost that nobody paid for.
const VERIFIABLE_PAYMENT_METHODS = new Set(['razorpay']);

const router = express.Router();
router.use(requireOrg);

// The carrier sync runs on every GET of this route, so an unchanged condition
// would otherwise reprint the same warning on every page load. Log a given
// message once, then only again when it changes or after `repeatAfterMs`.
const lastLogged = new Map();
function logOnce(key, message, repeatAfterMs = 5 * 60 * 1000) {
  const now = Date.now();
  const prev = lastLogged.get(key);
  if (prev && prev.message === message && now - prev.at < repeatAfterMs) return;
  lastLogged.set(key, { message, at: now });
  console.warn(message);
}

router.get('/', asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const { VoBizProvider } = require('../providers/telephony/vobiz');
  const vobiz = new VoBizProvider();

  // 1. Fetch live active carrier numbers from VoBiz API keys. The sync is
  //    idempotent and never throws on a duplicate (uq_number is global).
  const sync = await syncCarrierNumbers({ provider: vobiz, organizationId: orgId });
  if (sync.error) {
    logOnce(
      'carrier-sync-error',
      `Live VoBiz carrier sync unavailable: ${sync.error}`
    );
  } else if (sync.conflicts.length) {
    // One VoBiz account is shared by every org, but phone_numbers.number is
    // globally unique, so a number can only ever be owned by one org. That is a
    // real constraint, not a transient error - say it once per distinct set
    // instead of on every page load.
    logOnce(
      'carrier-conflicts',
      `[phone] ${sync.conflicts.length} carrier number(s) are owned by another organization and ` +
        `cannot be assigned here (phone_numbers.number is globally unique): ` +
        sync.conflicts.map((c) => `${c.number} -> org ${c.organization_id}`).join(', '),
      10 * 60 * 1000
    );
  }

  // 2. Mock seed numbers used to be deleted here on every list load. That
  //    statement had no organization_id predicate, so it removed other
  //    tenants' rows and any legitimate number containing that digit run. It is
  //    a one-off migration concern, so it belongs in a migration script, not on
  //    the read path of a live page.

  // 3. Return real carrier numbers
  const rows = await query(
    `SELECT pn.*, e.name AS employee_name FROM phone_numbers pn
     LEFT JOIN ai_employees e ON e.id = pn.employee_id
     WHERE pn.organization_id = ?
     ORDER BY pn.created_at DESC`,
    [orgId]
  );
  res.json({ success: true, numbers: rows, carrier: 'VoBiz', authId: vobiz.authId });
}));

router.get('/vobiz/inventory', asyncHandler(async (req, res) => {
  const { VoBizProvider } = require('../providers/telephony/vobiz');
  const vobiz = new VoBizProvider();
  const { country = 'IN', region = '', type = 'local', q = '', limit = 20, page = 1 } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 20);

  try {
    const [invResult, readiness] = await Promise.all([
      vobiz.getNumbersInventory({ country, region, type, q, limit: limitNum, page: pageNum }),
      // A probe that could not reach the carrier tells us nothing about whether
      // purchasing works, so it reports "not ready". Claiming readiness on a
      // failed probe invites a purchase the carrier will reject.
      vobiz.checkAdminPurchasingReadiness().catch(() => ({ isReady: false, carrier: 'VoBiz' })),
    ]);

    const items = Array.isArray(invResult) ? invResult : (invResult?.items || []);
    const total = typeof invResult?.total === 'number' ? invResult.total : items.length;

    const existing = await query('SELECT number FROM phone_numbers WHERE organization_id = ?', [req.user.organization_id]);
    const existingSet = new Set(existing.map((e) => e.number));

    const list = items.map((it) => ({
      ...it,
      is_owned: existingSet.has(it.e164),
    }));

    res.json({
      success: true,
      carrier: 'VoBiz India PSTN',
      accountId: vobiz.authId,
      total,
      page: invResult.page || 1,
      per_page: invResult.per_page || list.length,
      numbers: list,
      can_purchase: readiness.isReady,
      is_live_api: true,
    });
  } catch (err) {
    console.error('[phoneNumbers] Carrier live inventory API error:', err.message);
    res.status(502).json({
      success: false,
      error: {
        message: `Carrier API Error: ${err.message}`,
        carrier: 'VoBiz',
        code: 'CARRIER_API_ERROR',
      },
      carrier: 'VoBiz',
      accountId: vobiz.authId,
      total: 0,
      numbers: [],
      can_purchase: false,
      is_live_api: true,
    });
  }
}));

router.post('/create-order', asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const userId = req.user.id;
  const { e164, monthly_fee = 500, setup_fee = 100, user_message, note, message } = req.body;
  if (!e164) throw new AppError('Phone number is required to create order', 400, 'VALIDATION');

  const numberOrderService = require('../services/numberOrderService');
  const providerStatus = await numberOrderService.getProviderBalanceStatus();
  const requiredWholesaleBalance = parseFloat(setup_fee) || 100;

  if (providerStatus.reported_balance < requiredWholesaleBalance) {
    const custNote = user_message || note || message || null;
    const cleanNum = toCanonicalNumber(e164) || e164;
    const [org, user] = await Promise.all([
      queryOne('SELECT name FROM organizations WHERE id = $1', [orgId]).catch(() => null),
      queryOne('SELECT name, email, phone FROM users WHERE id = $1', [userId]).catch(() => null),
    ]);
    const orgName = org?.name || `Org #${orgId}`;
    const userDisplay = user?.name ? `${user.name} (${user.email || user.phone})` : (user?.email || `User #${userId}`);
    const alertMessage = `Customer ${userDisplay} from ${orgName} requested number ${cleanNum}. Wholesale Setup Cost: ₹${requiredWholesaleBalance}, but live admin VoBiz balance is ₹${providerStatus.reported_balance_inr}.${custNote ? ` Customer Note: "${custNote}"` : ''}`;

    try {
      await query(
        `INSERT INTO number_orders (
           order_id, organization_id, user_id, phone_number, provider, number_type, region,
           setup_fee_paise, monthly_fee_paise, markup_paise, total_charged_paise, provider_cost_paise,
           status, error_message, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())`,
        [
          `numord_${Date.now()}_alert`,
          orgId,
          userId,
          cleanNum,
          'vobiz',
          'local',
          null,
          Math.round(requiredWholesaleBalance * 100),
          50000,
          10000,
          Math.round(requiredWholesaleBalance * 100) + 10000,
          Math.round(requiredWholesaleBalance * 100),
          'PENDING_ADMIN_TOPUP',
          alertMessage,
        ]
      );
    } catch (e) {
      console.warn('[create-order] Could not save order alert log:', e.message);
    }

    try {
      await query(
        `INSERT INTO notifications (organization_id, user_id, type, title, message)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          1,
          null,
          'warning',
          `⚠️ Carrier Balance Alert: Top-up Required for ${cleanNum}`,
          alertMessage,
        ]
      );
    } catch (e) {
      console.warn('[create-order] Could not save notification:', e.message);
    }

    try {
      const realtime = require('../services/realtime');
      realtime.emit(1, 'admin.carrier_low_balance', {
        phone: cleanNum,
        orgId,
        orgName,
        userDisplay,
        userMessage: custNote,
        requiredAmount: requiredWholesaleBalance,
        currentBalance: providerStatus.reported_balance,
      });
    } catch (e) {
      // ignore
    }

    throw new AppError(
      `Carrier Account Low Balance (₹${providerStatus.reported_balance_inr} available, ₹${requiredWholesaleBalance} required). We have notified the platform administrator to top up the carrier account.${custNote ? ' Your note has been delivered to admin.' : ''} Please check back shortly.`,
      400,
      'ADMIN_CARRIER_LOW_BALANCE'
    );
  }

  const totalCost = (parseFloat(monthly_fee) || 0) + (parseFloat(setup_fee) || 0);
  const paymentProvider = getPaymentProvider();
  const order = await paymentProvider.createOrder({
    amount: totalCost,
    currency: 'INR',
    orgId,
    description: `Phone Number Purchase (${e164})`,
  });

  res.json({
    success: true,
    order: {
      orderId: order.orderId,
      keyId: order.keyId || require('../config/env').providers.payment.keyId,
      amount: order.amount,
      currency: order.currency || 'INR',
    },
  });
}));

router.post('/vobiz/buy', asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const userId = req.user.id;
  const {
    e164,
    monthly_fee = 500,
    setup_fee = 100,
    type = 'local',
    country = 'IN',
    region = 'India',
    employee_id,
    order_id,
    payment_id,
    signature,
    payment_method = 'razorpay',
  } = req.body;

  if (!e164) throw new AppError('Phone number is required to purchase', 400, 'VALIDATION');

  const cleanNum = toCanonicalNumber(e164);
  if (!cleanNum) throw new AppError('Phone number is not a valid E.164 number', 400, 'VALIDATION');

  // uq_number is global: a number already stored for ANY organization cannot be
  // bought again, so check every org here instead of raising ER_DUP_ENTRY later.
  const existing = await queryOne('SELECT id, organization_id FROM phone_numbers WHERE number = ?', [cleanNum]);
  if (existing) {
    const mine = Number(existing.organization_id) === Number(orgId);
    throw new AppError(
      mine ? 'Number already configured in your organization' : 'Number already configured in another organization',
      409,
      'NUMBER_EXISTS'
    );
  }

  const { VoBizProvider } = require('../providers/telephony/vobiz');
  const vobiz = new VoBizProvider();

  // 1. Verify Admin Carrier Balance Readiness
  const readiness = await vobiz.checkAdminPurchasingReadiness();
  if (!readiness.isReady) {
    throw new AppError(
      'Carrier provisioning is temporarily paused for gateway reconciliation. Please contact support.',
      503,
      'CARRIER_BALANCE_UNAVAILABLE'
    );
  }

  // 2. Payment must be a gateway payment this server can actually verify.
  //    The old code ran verification only `if (order_id && payment_id &&
  //    signature)`, so every other payment_method - including ones fabricated
  //    client-side - skipped it entirely and fell through to provisioning with
  //    a "paid" row written for money that was never collected. Fail closed.
  if (!VERIFIABLE_PAYMENT_METHODS.has(payment_method)) {
    throw new AppError(
      `Payment method "${payment_method}" cannot be verified by this server, so no number is provisioned. ` +
        `Use one of: ${[...VERIFIABLE_PAYMENT_METHODS].join(', ')}.`,
      400,
      'UNVERIFIABLE_PAYMENT_METHOD'
    );
  }
  if (!order_id || !payment_id || !signature) {
    throw new AppError(
      'A verified gateway payment is required: order_id, payment_id and signature must all be present.',
      400,
      'PAYMENT_DETAILS_MISSING'
    );
  }
  // getPaymentProvider() falls back to MockPaymentProvider, which approves every
  // payment without checking anything. Require the real provider to be the one
  // that was selected, otherwise verification is theatre.
  if (
    config.providers.payment.provider !== 'razorpay' ||
    !config.providers.payment.keyId ||
    !config.providers.payment.secret
  ) {
    throw new AppError(
      'Payments are not configured on this server (PAYMENT_PROVIDER, PAYMENT_KEY_ID, PAYMENT_SECRET). ' +
        'Number purchase is disabled rather than taken unverified.',
      503,
      'PAYMENT_NOT_CONFIGURED'
    );
  }

  const paymentProvider = getPaymentProvider();
  const verified = await paymentProvider.verifyPayment({ orderId: order_id, paymentId: payment_id, signature });
  if (!verified || !verified.verified) {
    throw new AppError(
      `Razorpay payment verification failed${verified?.reason ? `: ${verified.reason}` : ''}`,
      400,
      'PAYMENT_VERIFICATION_FAILED'
    );
  }

  const totalCost = (parseFloat(monthly_fee) || 0) + (parseFloat(setup_fee) || 0);

  // A valid signature only proves *some* payment completed, so the captured
  // amount has to cover what is about to be provisioned. Otherwise a cheap
  // order plus self-declared fees buys a number nobody paid for.
  if (typeof verified.amount === 'number' && verified.amount + 1e-6 < totalCost) {
    throw new AppError(
      `Payment of ${verified.amount} does not cover the ${totalCost} due for this number.`,
      400,
      'PAYMENT_AMOUNT_MISMATCH'
    );
  }

  // 3. Record the verified payment. The reference is the gateway payment id,
  //    never a locally generated string: a fabricated reference made a real
  //    charge indistinguishable from an invented one. The row is always
  //    written so a provision can never exist without a payment trail.
  const txnReference = payment_id;
  await insert(
    'INSERT INTO payments (organization_id, amount, currency, provider, reference, status, metadata) VALUES (?,?,?,?,?,?,?)',
    [orgId, totalCost, 'INR', payment_method, txnReference, 'paid', JSON.stringify({ description: `Phone Number Purchase (${cleanNum})`, order_id })]
  );

  // 4. Execute Carrier Purchase
  const vobizResult = await vobiz.purchaseNumberFromInventory({ e164: cleanNum, currency: 'INR' });

  // 5. Provision Number to Tenant. The duplicate check above is not atomic, so
  //    the carrier sync (or a second buyer) can still win the race in between.
  //    Translate that specific DB error into the same 409 the check produces.
  let r;
  try {
    r = await insert(
      'INSERT INTO phone_numbers (organization_id, number, provider, country, region, type, employee_id, status, monthly_cost) VALUES (?,?,?,?,?,?,?,?,?)',
      [orgId, cleanNum, 'vobiz', country, region || null, type, employee_id || null, 'active', parseFloat(monthly_fee) || 0]
    );
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new AppError('Number was just configured by another request', 409, 'NUMBER_EXISTS');
    }
    throw err;
  }

  // 6. Log in phone_number_purchases Audit Table
  await insert(
    `INSERT INTO phone_number_purchases
     (organization_id, user_id, number, provider, country, region, monthly_cost, setup_fee, amount_paid, currency, payment_id, carrier_result, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      orgId,
      userId,
      cleanNum,
      'vobiz',
      country,
      region,
      parseFloat(monthly_fee) || 0,
      parseFloat(setup_fee) || 0,
      totalCost,
      'INR',
      txnReference,
      JSON.stringify(vobizResult),
      'completed',
    ]
  );

  await audit(req, 'phone.purchase_vobiz', 'phone_number', r.insertId, {
    number: cleanNum,
    monthly_fee,
    setup_fee,
    amount_paid: totalCost,
    payment_id: txnReference,
    vobizResult,
  });

  // Wire inbound calling for the number we just bought. Best effort: the number
  // is already paid for and usable for outbound, so a failure here is reported
  // but must not roll the purchase back.
  const inbound = await provisionInboundForNumber(cleanNum);
  if (!inbound.ok) {
    console.warn(`[phone-numbers] Inbound not wired for ${cleanNum}: ${inbound.reason} - ${inbound.message}`);
  }

  const row = await queryOne(
    `SELECT pn.*, pn.number AS phone_number, e.name AS employee_name FROM phone_numbers pn
     LEFT JOIN ai_employees e ON e.id = pn.employee_id WHERE pn.id = ?`,
    [r.insertId]
  );

  res.status(201).json({
    success: true,
    message: `Number ${cleanNum} successfully purchased and configured!`,
    number: row,
    carrier_result: vobizResult,
    payment_id: txnReference,
    inbound,
  });
}));

/**
 * Platform-funded allocation (admin "Quick Allocate").
 *
 * This exists because a real support workflow needs to hand a number to a
 * tenant without the tenant paying - but it must be an explicit, role-gated,
 * audited path rather than a `payment_method` value the customer could send.
 * `/vobiz/buy` now rejects anything that is not a verified gateway payment, so
 * this route is the only payment-free provisioning path and it is admin-only.
 *
 * The cost is recorded as `platform_funded`, never as a `paid` customer
 * payment, so finance can distinguish the two.
 */
router.post('/vobiz/allocate', requireAdmin, asyncHandler(async (req, res) => {
  const { VoBizProvider } = require('../providers/telephony/vobiz');
  const vobiz = new VoBizProvider();
  const orgId = parseInt(req.body.organization_id, 10);
  if (!orgId) throw new AppError('organization_id is required', 400, 'VALIDATION');

  const cleanNum = toCanonicalNumber(req.body.e164 || req.body.number);
  if (!cleanNum) throw new AppError('A valid E.164 number is required', 400, 'VALIDATION');

  const monthlyFee = parseFloat(req.body.monthly_fee) || 0;
  const setupFee = parseFloat(req.body.setup_fee) || 0;
  const totalCost = monthlyFee + setupFee;

  const org = await queryOne('SELECT id, name FROM organizations WHERE id = ?', [orgId]);
  if (!org) throw new AppError('Organization not found', 404, 'NOT_FOUND');

  const existing = await queryOne('SELECT id FROM phone_numbers WHERE number = ?', [cleanNum]);
  if (existing) throw new AppError('This number is already assigned', 409, 'NUMBER_EXISTS');

  const vobizResult = await vobiz.purchaseNumberFromInventory({ e164: cleanNum, currency: 'INR' });

  const r = await insert(
    'INSERT INTO phone_numbers (organization_id, number, provider, country, region, type, employee_id, status, monthly_cost) VALUES (?,?,?,?,?,?,?,?,?)',
    [orgId, cleanNum, 'vobiz', req.body.country || 'IN', req.body.region || null, req.body.type || 'local', req.body.employee_id || null, 'active', monthlyFee]
  );

  // Not a customer payment: platform-funded cost, attributed to the admin.
  await insert(
    'INSERT INTO payments (organization_id, amount, currency, provider, reference, status, metadata) VALUES (?,?,?,?,?,?,?)',
    [orgId, totalCost, 'INR', 'platform', `alloc_${r.insertId}_${Date.now()}`, 'platform_funded',
      JSON.stringify({ description: `Admin allocation (${cleanNum}) to ${org.name}`, reason: req.body.reason || null })]
  );

  await insert(
    `INSERT INTO phone_number_purchases
     (organization_id, user_id, number, provider, country, region, monthly_cost, setup_fee, amount_paid, currency, payment_id, carrier_result, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [orgId, req.user.id, cleanNum, 'vobiz', req.body.country || 'IN', req.body.region || null,
      monthlyFee, setupFee, totalCost, 'INR', `alloc_${r.insertId}`, JSON.stringify(vobizResult), 'completed']
  );

  await audit(req, 'phone.admin_allocate', 'phone_number', r.insertId, {
    number: cleanNum, toOrganization: orgId, amount: totalCost, reason: req.body.reason || null,
  });

  const row = await queryOne(
    `SELECT pn.*, e.name AS employee_name FROM phone_numbers pn
     LEFT JOIN ai_employees e ON e.id = pn.employee_id WHERE pn.id = ?`,
    [r.insertId]
  );
  res.status(201).json({ success: true, number: row, carrier_result: vobizResult });
}));

router.get('/vobiz/available', asyncHandler(async (req, res) => {
  const { VoBizProvider } = require('../providers/telephony/vobiz');
  const vobiz = new VoBizProvider();
  const info = vobiz.getAccountInfo();
  const available = await vobiz.listPhoneNumbers();

  // Check which ones are already configured in org
  const existing = await query('SELECT number FROM phone_numbers WHERE organization_id = ?', [req.user.organization_id]);
  const configuredSet = new Set(existing.map((e) => e.number));

  const list = available.map((n) => ({
    ...n,
    is_added: configuredSet.has(n.number),
  }));

  res.json({
    success: true,
    carrier: 'VoBiz',
    // The provider refuses to exist without credentials, so this is always the
    // configured account. The old `|| 'MA_0JG73TST'` fallback advertised a
    // different account than the one actually being queried.
    accountId: info.authId,
    configured: info.configured,
    numbers: list,
  });
}));

router.post('/vobiz/sync', asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const { VoBizProvider } = require('../providers/telephony/vobiz');
  const vobiz = new VoBizProvider();
  const sync = await syncCarrierNumbers({ provider: vobiz, organizationId: orgId });

  const rows = await query(
    `SELECT pn.*, e.name AS employee_name FROM phone_numbers pn
     LEFT JOIN ai_employees e ON e.id = pn.employee_id
     WHERE pn.organization_id = ? ORDER BY pn.created_at DESC`,
    [orgId]
  );
  await audit(req, 'phone.sync_vobiz', 'carrier', null, {
    added: sync.added,
    skipped: sync.skipped,
    conflicts: sync.conflicts.length,
  });
  res.json({
    success: !sync.error,
    added: sync.added,
    skipped: sync.skipped,
    conflicts: sync.conflicts,
    carrier: 'VoBiz',
    numbers: rows,
    ...(sync.error ? { message: sync.error } : {}),
  });
}));

router.post('/sync', asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const { VoBizProvider } = require('../providers/telephony/vobiz');
  const telephony = new VoBizProvider();
  const sync = await syncCarrierNumbers({ provider: telephony, organizationId: orgId });

  const rows = await query(
    `SELECT pn.*, e.name AS employee_name FROM phone_numbers pn
     LEFT JOIN ai_employees e ON e.id = pn.employee_id
     WHERE pn.organization_id = ? ORDER BY pn.created_at DESC`,
    [orgId]
  );
  res.json({
    success: !sync.error,
    added: sync.added,
    skipped: sync.skipped,
    conflicts: sync.conflicts,
    numbers: rows,
    ...(sync.error ? { message: sync.error } : {}),
  });
}));

router.post('/', asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const { provider = 'vobiz', country = 'IN', type = 'local', employee_id } = req.body;
  if (!req.body.number) throw new AppError('Phone number is required', 400, 'VALIDATION');

  const number = toCanonicalNumber(req.body.number);
  if (!number) throw new AppError('Phone number is not a valid E.164 number', 400, 'VALIDATION');

  const existing = await queryOne('SELECT id, organization_id FROM phone_numbers WHERE number = ?', [number]);
  if (existing) {
    throw new AppError(
      Number(existing.organization_id) === Number(orgId)
        ? 'Number already configured'
        : 'Number already configured in another organization',
      409,
      'NUMBER_EXISTS'
    );
  }

  let r;
  try {
    r = await insert(
      'INSERT INTO phone_numbers (organization_id, number, provider, country, type, employee_id, status, monthly_cost) VALUES (?,?,?,?,?,?,?,?)',
      [orgId, number, provider, country, type, employee_id || null, 'active', parseFloat(req.body.monthly_cost) || 0]
    );
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new AppError('Number was just configured by another request', 409, 'NUMBER_EXISTS');
    }
    throw err;
  }
  await audit(req, 'phone.create', 'phone_number', r.insertId, { number });
  const row = await queryOne('SELECT * FROM phone_numbers WHERE id = ?', [r.insertId]);
  res.status(201).json({ success: true, number: row });
}));

router.post('/:id/assign', asyncHandler(async (req, res) => {
  const pnId = parseInt(req.params.id, 10);
  await ensureOrgOwned('phone_numbers', pnId, req.user.organization_id);
  const { employee_id } = req.body;
  if (employee_id) {
    const emp = await queryOne('SELECT * FROM ai_employees WHERE id = ? AND organization_id = ?', [employee_id, req.user.organization_id]);
    if (!emp) throw new AppError('Employee not found', 404, 'NOT_FOUND');
  }
  await insert('UPDATE phone_numbers SET employee_id = ? WHERE id = ?', [employee_id || null, pnId]);
  await audit(req, 'phone.assign', 'phone_number', pnId, { employee_id: employee_id || null });
  const row = await queryOne('SELECT * FROM phone_numbers WHERE id = ?', [pnId]);

  // Re-assert inbound routing. Assignment is what decides which employee answers
  // an inbound call, and retrying here repairs numbers wired before a tunnel was
  // available.
  const inbound = row?.number ? await provisionInboundForNumber(row.number) : null;
  if (inbound && !inbound.ok) {
    console.warn(`[phone-numbers] Inbound not wired for ${row.number}: ${inbound.reason} - ${inbound.message}`);
  }

  res.json({ success: true, number: row, inbound });
}));

/**
 * What inbound state this server is in, so the UI can tell the operator that a
 * tunnel URL is missing instead of showing an inbound tab that can never light up.
 */
router.get('/inbound-status', asyncHandler(async (req, res) => {
  const rows = await query(
    'SELECT id, number, status FROM phone_numbers WHERE organization_id = ? ORDER BY created_at DESC',
    [req.user.organization_id]
  );
  const status = await getInboundStatus(null);
  res.json({ success: true, ...status, numbers: rows });
}));

/** Re-register every number this org owns for inbound. */
router.post('/inbound-provision', asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT id, number FROM phone_numbers WHERE organization_id = ? AND status != "released"`,
    [req.user.organization_id]
  );
  const results = [];
  for (const row of rows) {
    results.push({ number: row.number, ...(await provisionInboundForNumber(row.number)) });
  }
  const failed = results.filter((r) => !r.ok);
  res.json({
    success: failed.length === 0,
    attempted: results.length,
    provisioned: results.length - failed.length,
    results,
  });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const pnId = parseInt(req.params.id, 10);
  await ensureOrgOwned('phone_numbers', pnId, req.user.organization_id);
  const allow = ['status', 'monthly_cost', 'country', 'type'];
  const sets = []; const params = [];
  for (const k of allow) if (req.body[k] !== undefined) { sets.push(`${k} = ?`); params.push(req.body[k]); }
  if (!sets.length) throw new AppError('Nothing to update', 400, 'VALIDATION');
  await insert(`UPDATE phone_numbers SET ${sets.join(', ')} WHERE id = ?`, [...params, pnId]);
  res.json({ success: true });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const pnId = parseInt(req.params.id, 10);
  const pn = await ensureOrgOwned('phone_numbers', pnId, req.user.organization_id);

  // Release the number at the carrier first. The documented call is
  // DELETE /Account/{auth_id}/numbers/{e164}?immediate=. Deleting only the local
  // row left the carrier still renting the number and still billing for it,
  // and phoneNumberSync re-imported it on the next page load - so the number
  // appeared to come back on its own while the tenant kept paying.
  let carrierRelease = null;
  if (pn?.number) {
    try {
      const { getTelephonyProvider } = require('../providers');
      carrierRelease = await getTelephonyProvider('vobiz').releaseNumber(pn.number, {
        immediate: String(req.query.immediate || '').toLowerCase() === 'true',
      });
    } catch (err) {
      // Refuse to orphan the local row when the carrier still holds the number:
      // deleting it here would hide a number that is still being charged for.
      throw new AppError(
        `The number was not released at the carrier, so it was not deleted here: ${err.message}`,
        502,
        err.providerCode || 'VOBIZ_RELEASE_FAILED'
      );
    }
  }

  await update('DELETE FROM phone_numbers WHERE id = ?', [pnId]);
  res.json({
    success: true,
    carrierRelease: carrierRelease
      ? {
          status: carrierRelease.status,
          releaseFee: carrierRelease.releaseFee,
          cooldownEndsAt: carrierRelease.cooldownEndsAt,
          note: carrierRelease.note,
        }
      : null,
  });
}));

module.exports = router;
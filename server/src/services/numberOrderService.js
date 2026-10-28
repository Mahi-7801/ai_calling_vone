const { query, queryOne, update } = require('../config/db');
const { VoBizProvider } = require('../providers/telephony/vobiz');
const { AppError } = require('../utils/errors');
const { generateId, toCanonicalNumber } = require('../utils/helpers');
const { provisionInboundForNumber } = require('./inboundProvisioning');
const walletService = require('./walletService');
const { audit } = require('./activity');

const vobiz = new VoBizProvider();

/**
 * Get available phone numbers with platform markup applied
 */
async function getAvailableNumbers({ country = 'IN', region = '', type = 'local', q = '', page = 1, limit = 20, orgId = null }) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 20);

  const markupInr = parseFloat(await walletService.getFinancialSetting('phone_markup_inr', '100')) || 100;

  const [invResult, readiness] = await Promise.all([
    vobiz.getNumbersInventory({ country, region, type, q, page: pageNum, limit: limitNum }),
    vobiz.checkAdminPurchasingReadiness().catch(() => ({ isReady: false, carrier: 'VoBiz' })),
  ]);

  const items = Array.isArray(invResult) ? invResult : (invResult?.items || []);
  const total = typeof invResult?.total === 'number' ? invResult.total : items.length;

  // Check which numbers are already owned
  let existingSet = new Set();
  if (orgId) {
    const existing = await query('SELECT number FROM phone_numbers WHERE organization_id = $1', [orgId]);
    existingSet = new Set(existing.map((e) => e.number));
  }

  const list = items.map((it) => {
    const rawSetup = typeof it.setup_fee === 'number' ? it.setup_fee : 100;
    const rawMonthly = typeof it.monthly_fee === 'number' ? it.monthly_fee : 500;
    const customerSetupFee = rawSetup + markupInr;

    return {
      id: it.id || it.e164,
      e164: it.e164,
      type: it.type || type,
      country: it.country || 'IN',
      region: it.region || null,
      features: it.features || 'Voice',
      series: it.series || null,
      provider_setup_fee: rawSetup,
      provider_monthly_fee: rawMonthly,
      platform_markup: markupInr,
      setup_fee: customerSetupFee, // Amount customer is charged at purchase
      monthly_fee: rawMonthly,     // Monthly recurring charge
      total_due_now: customerSetupFee,
      currency: it.currency || 'INR',
      is_owned: existingSet.has(it.e164),
    };
  });

  return {
    success: true,
    carrier: 'VoBiz India PSTN',
    authId: vobiz.authId,
    total,
    page: invResult.page || pageNum,
    per_page: invResult.per_page || limitNum,
    numbers: list,
    can_purchase: readiness.isReady,
    platform_markup_inr: markupInr,
  };
}

/**
 * Get Provider Balance Status & Financial Readiness
 */
async function getProviderBalanceStatus() {
  const safetyReserveInr = parseFloat(await walletService.getFinancialSetting('provider_safety_reserve_inr', '50')) || 50;

  let balanceData;
  let isLive = true;
  try {
    balanceData = await vobiz.getBalance();
  } catch (err) {
    console.warn('[numberOrderService] Failed to query live VoBiz balance:', err.message);
    isLive = false;
    balanceData = {
      configured: true,
      balance: null,
      availableBalance: null,
      currency: 'INR',
      status: 'unavailable',
      balanceError: err.message,
    };
  }

  const reportedBalance = balanceData?.balance !== null && balanceData?.balance !== undefined
    ? Number(balanceData.balance)
    : 0;

  // Record balance snapshot if live data was received
  if (isLive && balanceData?.balance !== null) {
    try {
      await query(
        `INSERT INTO provider_balance_snapshots 
         (provider, reported_balance, available_balance, currency, is_live, raw_response)
         VALUES ('vobiz', $1, $2, $3, $4, $5)`,
        [
          reportedBalance,
          reportedBalance - safetyReserveInr,
          balanceData.currency || 'INR',
          true,
          JSON.stringify(balanceData),
        ]
      );
    } catch (e) {
      console.warn('[snapshot] Failed to save snapshot:', e.message);
    }
  }

  const lastSnapshot = await queryOne(
    `SELECT * FROM provider_balance_snapshots ORDER BY created_at DESC LIMIT 1`
  );

  const effectiveReported = isLive ? reportedBalance : Number(lastSnapshot?.reported_balance || 0);
  const effectiveAvailable = Math.max(0, effectiveReported - safetyReserveInr);

  return {
    provider: 'vobiz',
    authId: vobiz.authId,
    is_live: isLive,
    reported_balance: effectiveReported,
    reported_balance_inr: effectiveReported.toFixed(2),
    safety_reserve_inr: safetyReserveInr.toFixed(2),
    available_purchasing_capacity_inr: effectiveAvailable.toFixed(2),
    currency: balanceData.currency || 'INR',
    status: balanceData.status || 'active',
    last_verified_at: isLive ? new Date().toISOString() : (lastSnapshot?.created_at || null),
    is_low_balance: effectiveReported <= safetyReserveInr,
    account_name: balanceData.accountName || null,
    company: balanceData.company || null,
    active_numbers_count: balanceData.activeNumbersCount || 0,
    primary_number: balanceData.primaryNumber || null,
  };
}

/**
 * Purchase a Phone Number using Wallet Balance (Automated State Machine)
 * States: CREATED -> FUNDS_RESERVED -> PROVIDER_PURCHASE_PENDING -> PURCHASE_CONFIRMED -> COMPLETED
 */
async function purchaseNumberWithWallet({ orgId, userId, e164, employeeId = null, userMessage = null }) {
  if (!e164) {
    throw new AppError('Phone number is required to purchase', 400, 'VALIDATION');
  }

  const cleanNum = toCanonicalNumber(e164);
  if (!cleanNum) {
    throw new AppError('Phone number is not a valid E.164 number', 400, 'INVALID_NUMBER');
  }

  // 1. Check if number is already owned by any organization
  const existing = await queryOne('SELECT id, organization_id FROM phone_numbers WHERE number = $1', [cleanNum]);
  if (existing) {
    const mine = Number(existing.organization_id) === Number(orgId);
    throw new AppError(
      mine ? 'This phone number is already configured in your account.' : 'This phone number has already been allocated.',
      409,
      'NUMBER_ALREADY_EXISTS'
    );
  }

  // 2. Fetch live number details & verify availability
  const inventory = await vobiz.getNumbersInventory({ country: 'IN', q: cleanNum.replace(/[^\d]/g, '').slice(-10), limit: 5 });
  const items = Array.isArray(inventory?.items) ? inventory.items : [];
  const item = items.find((it) => it.e164 === cleanNum) || items[0];

  const providerSetupFee = typeof item?.setup_fee === 'number' ? item.setup_fee : 100;
  const providerMonthlyFee = typeof item?.monthly_fee === 'number' ? item.monthly_fee : 500;
  const markupInr = parseFloat(await walletService.getFinancialSetting('phone_markup_inr', '100')) || 100;

  const customerSetupFee = providerSetupFee + markupInr;

  const setupFeePaise = Math.round(providerSetupFee * 100);
  const monthlyFeePaise = Math.round(providerMonthlyFee * 100);
  const markupPaise = Math.round(markupInr * 100);
  const providerCostPaise = setupFeePaise;
  const totalChargedPaise = setupFeePaise + markupPaise;

  // 3. Provider balance & safety check
  const providerStatus = await getProviderBalanceStatus();
  const allowLowBalance = (await walletService.getFinancialSetting('allow_low_balance_orders', 'false')) === 'true';

  if (!allowLowBalance && providerStatus.reported_balance < (providerSetupFee || 100)) {
    console.warn(`[purchase] Admin VoBiz balance (₹${providerStatus.reported_balance}) is lower than wholesale setup fee (₹${providerSetupFee}).`);

    // Fetch user and organization details
    const [org, user] = await Promise.all([
      queryOne('SELECT name FROM organizations WHERE id = $1', [orgId]).catch(() => null),
      queryOne('SELECT name, email, phone FROM users WHERE id = $1', [userId]).catch(() => null),
    ]);

    const orgName = org?.name || `Org #${orgId}`;
    const userDisplay = user?.name ? `${user.name} (${user.email || user.phone})` : (user?.email || `User #${userId}`);
    const alertMessage = `Customer ${userDisplay} from ${orgName} requested phone number ${cleanNum}. Wholesale Setup Cost: ₹${providerSetupFee}, but live admin VoBiz balance is only ₹${providerStatus.reported_balance_inr}.${userMessage ? ` Customer Note: "${userMessage}"` : ''}`;

    // 1. Record in number_orders as PENDING_ADMIN_TOPUP so it immediately shows on Admin Panel -> Number Orders tab
    try {
      await query(
        `INSERT INTO number_orders (
           order_id, organization_id, user_id, phone_number, provider, number_type, region,
           setup_fee_paise, monthly_fee_paise, markup_paise, total_charged_paise, provider_cost_paise,
           status, error_message, assigned_employee_id, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())`,
        [
          `numord_${Date.now()}_alert`,
          orgId,
          userId,
          cleanNum,
          'vobiz',
          item?.type || 'local',
          item?.region || null,
          setupFeePaise,
          monthlyFeePaise,
          markupPaise,
          totalChargedPaise,
          providerCostPaise,
          'PENDING_ADMIN_TOPUP',
          alertMessage,
          employeeId ? parseInt(employeeId, 10) : null,
        ]
      );
    } catch (e) {
      console.warn('[purchase] Could not save order alert log:', e.message);
    }

    // 2. Insert notification into admin alerts queue
    try {
      await query(
        `INSERT INTO notifications (organization_id, user_id, type, title, message)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          1, // Administrator organization
          null,
          'warning',
          `⚠️ Carrier Balance Alert: Top-up Required for ${cleanNum}`,
          alertMessage,
        ]
      );
    } catch (e) {
      console.warn('[purchase] Could not save notification:', e.message);
    }

    // 3. Emit live websocket telemetry to admin
    try {
      const realtime = require('./realtime');
      realtime.emit(1, 'admin.carrier_low_balance', {
        phone: cleanNum,
        orgId,
        orgName,
        userDisplay,
        userMessage,
        requiredAmount: providerSetupFee,
        availableAmount: providerStatus.reported_balance,
      });
    } catch {
      // ignore
    }

    // 4. Return clean, descriptive alert back to the customer
    throw new AppError(
      `Carrier Account Notice: The wholesale trunk currently has insufficient balance (Available: ₹${providerStatus.reported_balance_inr}, Required: ₹${providerSetupFee}). An alert has been delivered to the admin panel.${userMessage ? ` Your message ("${userMessage}") was delivered to the admin.` : ''} Please contact support or check back shortly.`,
      400,
      'ADMIN_CARRIER_LOW_BALANCE'
    );
  }

  const orderId = `numord_${Date.now()}_${generateId(6)}`;

  // 4. STATE: FUNDS_RESERVED
  console.log(`[purchase] Step 1: Reserving funds (₹${(totalChargedPaise/100).toFixed(2)}) for ${cleanNum}...`);
  await walletService.reserveFundsForNumberOrder({
    orgId,
    userId,
    orderId,
    phone: cleanNum,
    setupFeePaise,
    monthlyFeePaise,
    markupPaise,
    providerCostPaise,
    numberType: item?.type || 'local',
    region: item?.region || null,
    carrierItemId: item?.id || null,
    employeeId: employeeId ? parseInt(employeeId, 10) : null,
  });

  // 5. STATE: PROVIDER_PURCHASE_PENDING
  await update('UPDATE number_orders SET status = $1, updated_at = NOW() WHERE order_id = $2', [
    'PROVIDER_PURCHASE_PENDING',
    orderId,
  ]);

  // 6. STATE: Execute Real VoBiz Carrier Purchase
  console.log(`[purchase] Step 2: Executing real VoBiz purchase for ${cleanNum}...`);
  let vobizResult;
  try {
    vobizResult = await vobiz.purchaseNumberFromInventory({ e164: cleanNum, currency: 'INR' });
    console.log(`[purchase] Step 3: VoBiz returned success for ${cleanNum}:`, vobizResult);
  } catch (err) {
    console.error(`[purchase] VoBiz purchase failed for ${cleanNum}:`, err.message);
    // Release reservation exactly once on provider rejection
    await walletService.releaseNumberReservation({
      orderId,
      reason: `VoBiz rejected purchase: ${err.message}`,
    });

    throw new AppError(
      `Carrier could not allocate number (${cleanNum}): ${err.message}. Reserved wallet funds have been released back to your balance.`,
      502,
      'CARRIER_PURCHASE_FAILED'
    );
  }

  // 7. STATE: PURCHASE_CONFIRMED & COMPLETED
  console.log(`[purchase] Step 4: Finalizing wallet deduction for order ${orderId}...`);
  const finalization = await walletService.finalizeNumberPurchase({
    orderId,
    carrierOrderId: vobizResult.carrierOrderId || null,
    carrierResult: vobizResult,
  });

  // 8. Wire Inbound Calling Webhook automatically
  try {
    const inbound = await provisionInboundForNumber(cleanNum);
    console.log(`[purchase] Inbound webhook wired for ${cleanNum}:`, inbound);
  } catch (inboundErr) {
    console.warn(`[purchase] Inbound webhook configuration notice for ${cleanNum}:`, inboundErr.message);
  }

  // Record audit
  await audit({ user: { id: userId, organization_id: orgId } }, 'phone.wallet_purchase', 'phone_number', finalization.phoneId, {
    orderId,
    number: cleanNum,
    chargedInr: finalization.totalChargedInr,
    balanceAfterInr: finalization.balanceAfterInr,
    carrierResult: vobizResult,
  });

  const fullNumberRow = await queryOne(
    `SELECT pn.*, e.name AS employee_name 
     FROM phone_numbers pn
     LEFT JOIN ai_employees e ON e.id = pn.employee_id
     WHERE pn.number = $1`,
    [cleanNum]
  );

  return {
    success: true,
    orderId,
    number: fullNumberRow,
    totalChargedInr: finalization.totalChargedInr,
    balanceAfterInr: finalization.balanceAfterInr,
    message: `Phone number ${cleanNum} successfully purchased and activated!`,
  };
}

/**
 * Get user's purchased numbers
 */
async function getMyNumbers(orgId) {
  const rows = await query(
    `SELECT pn.*, e.name AS employee_name 
     FROM phone_numbers pn
     LEFT JOIN ai_employees e ON e.id = pn.employee_id
     WHERE pn.organization_id = $1
     ORDER BY pn.created_at DESC`,
    [orgId]
  );
  return rows;
}

/**
 * Get user's number orders
 */
async function getMyNumberOrders(orgId, { limit = 20, offset = 0 } = {}) {
  const limitNum = Math.max(1, parseInt(limit, 10) || 20);
  const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

  const rows = await query(
    `SELECT * FROM number_orders 
     WHERE organization_id = $1 
     ORDER BY created_at DESC 
     LIMIT ${limitNum} OFFSET ${offsetNum}`,
    [orgId]
  );

  const countRow = await queryOne('SELECT COUNT(*) AS c FROM number_orders WHERE organization_id = $1', [orgId]);

  return {
    orders: rows.map((r) => ({
      ...r,
      order_ref: r.order_id,
      setup_fee_inr: (Number(r.setup_fee_paise) / 100).toFixed(2),
      monthly_fee_inr: (Number(r.monthly_fee_paise) / 100).toFixed(2),
      markup_inr: (Number(r.markup_paise) / 100).toFixed(2),
      total_charged_inr: (Number(r.total_charged_paise) / 100).toFixed(2),
      provider_cost_inr: (Number(r.provider_cost_paise) / 100).toFixed(2),
    })),
    total: parseInt(countRow?.c || 0, 10),
  };
}

module.exports = {
  getAvailableNumbers,
  getProviderBalanceStatus,
  purchaseNumberWithWallet,
  getMyNumbers,
  getMyNumberOrders,
};

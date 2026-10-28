const { query, queryOne, insert, update, withTransaction } = require('../config/db');
const { getPaymentProvider } = require('../providers');
const { AppError } = require('../utils/errors');
const { generateId } = require('../utils/helpers');
const { audit } = require('./activity');

/**
 * Platform Financial Settings Helper
 */
async function getFinancialSetting(key, defaultValue) {
  try {
    const row = await queryOne('SELECT value FROM platform_financial_settings WHERE key = $1', [key]);
    return row ? row.value : defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Get or automatically initialize wallet for organization
 */
async function getWallet(orgId, userId = null) {
  let wallet = await queryOne('SELECT * FROM wallets WHERE organization_id = $1', [orgId]);
  if (!wallet) {
    // Initialize wallet
    const cw = await queryOne('SELECT balance FROM credit_wallets WHERE organization_id = $1', [orgId]);
    const initialPaise = cw ? Math.round(Number(cw.balance || 0) * 100) : 0;

    await query(
      `INSERT INTO wallets (organization_id, user_id, balance_paise, reserved_paise, currency)
       VALUES ($1, $2, $3, 0, 'INR')
       ON CONFLICT (organization_id) DO NOTHING`,
      [orgId, userId, initialPaise]
    );
    wallet = await queryOne('SELECT * FROM wallets WHERE organization_id = $1', [orgId]);
  }

  const balancePaise = Number(wallet?.balance_paise || 0);
  const reservedPaise = Number(wallet?.reserved_paise || 0);
  const availablePaise = Math.max(0, balancePaise - reservedPaise);

  return {
    id: wallet.id,
    organization_id: orgId,
    user_id: wallet.user_id || userId,
    balance_paise: balancePaise,
    reserved_paise: reservedPaise,
    available_paise: availablePaise,
    balance_inr: (balancePaise / 100).toFixed(2),
    reserved_inr: (reservedPaise / 100).toFixed(2),
    available_inr: (availablePaise / 100).toFixed(2),
    currency: wallet.currency || 'INR',
    updated_at: wallet.updated_at,
  };
}

/**
 * Get paginated wallet transactions ledger
 */
async function getTransactions(orgId, { limit = 20, offset = 0, type = null } = {}) {
  const params = [orgId];
  let where = 'organization_id = $1';

  if (type) {
    params.push(type);
    where += ` AND type = $${params.length}`;
  }

  const limitNum = Math.max(1, parseInt(limit, 10) || 20);
  const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

  const rows = await query(
    `SELECT * FROM wallet_transactions 
     WHERE ${where}
     ORDER BY created_at DESC 
     LIMIT ${limitNum} OFFSET ${offsetNum}`,
    params
  );

  const countRow = await queryOne(`SELECT COUNT(*) AS c FROM wallet_transactions WHERE ${where}`, params);
  const total = parseInt(countRow?.c || 0, 10);

  return {
    transactions: rows.map((r) => ({
      ...r,
      amount_inr: (Number(r.amount_paise) / 100).toFixed(2),
      balance_after_inr: (Number(r.balance_after_paise) / 100).toFixed(2),
    })),
    total,
  };
}

/**
 * Create a Razorpay Deposit Order
 */
async function createDepositOrder({ orgId, userId, amountInr }) {
  const minDepositInr = parseFloat(await getFinancialSetting('min_deposit_inr', '100')) || 100;
  const maxDepositInr = parseFloat(await getFinancialSetting('max_deposit_inr', '100000')) || 100000;

  const parsedInr = parseFloat(amountInr);
  if (isNaN(parsedInr) || parsedInr < minDepositInr || parsedInr > maxDepositInr) {
    throw new AppError(
      `Deposit amount must be between ₹${minDepositInr} and ₹${maxDepositInr}`,
      400,
      'INVALID_DEPOSIT_AMOUNT'
    );
  }

  const amountPaise = Math.round(parsedInr * 100);
  const paymentProvider = getPaymentProvider();

  const receipt = `dep_${orgId}_${Date.now()}`.slice(0, 40);
  const order = await paymentProvider.createOrder({
    amount: parsedInr,
    currency: 'INR',
    orgId,
    description: `Wallet Deposit (₹${parsedInr})`,
  });

  await query(
    `INSERT INTO razorpay_orders 
     (order_id, organization_id, user_id, amount_paise, currency, status, receipt)
     VALUES ($1, $2, $3, $4, 'INR', 'created', $5)
     ON CONFLICT (order_id) DO NOTHING`,
    [order.orderId, orgId, userId, amountPaise, receipt]
  );

  return {
    orderId: order.orderId,
    keyId: order.keyId,
    amount: parsedInr,
    amountPaise,
    currency: 'INR',
  };
}

/**
 * Verify Razorpay payment and credit the user's wallet with append-only ledger transaction
 */
async function verifyAndCreditDeposit({ orgId, userId, orderId, paymentId, signature, webhookPayload = null }) {
  if (!orderId || !paymentId) {
    throw new AppError('orderId and paymentId are required', 400, 'VALIDATION');
  }

  // 1. Check if already credited in wallet_transactions to prevent replay
  const alreadyProcessed = await queryOne(
    `SELECT id FROM wallet_transactions WHERE reference = $1 AND type = 'deposit'`,
    [paymentId]
  );
  if (alreadyProcessed) {
    const w = await getWallet(orgId, userId);
    return { success: true, credited: false, message: 'Deposit already processed', wallet: w };
  }

  // 2. Cryptographic signature verification
  const paymentProvider = getPaymentProvider();
  const verification = await paymentProvider.verifyPayment({ orderId, paymentId, signature });
  if (!verification || !verification.verified) {
    throw new AppError(
      `Payment signature verification failed${verification?.reason ? `: ${verification.reason}` : ''}`,
      400,
      'PAYMENT_VERIFICATION_FAILED'
    );
  }

  // Find order
  const order = await queryOne('SELECT * FROM razorpay_orders WHERE order_id = $1', [orderId]);
  const amountPaise = order?.amount_paise ? Number(order.amount_paise) : Math.round((verification.amount || 0) * 100);
  if (!amountPaise || amountPaise <= 0) {
    throw new AppError('Invalid order payment amount', 400, 'INVALID_AMOUNT');
  }

  const amountInr = (amountPaise / 100).toFixed(2);

  // 3. Atomically update wallet and insert ledger record
  const result = await withTransaction(async (tx) => {
    // Ensure wallet exists & lock row
    await tx.query(
      `INSERT INTO wallets (organization_id, user_id, balance_paise, reserved_paise, currency)
       VALUES ($1, $2, 0, 0, 'INR')
       ON CONFLICT (organization_id) DO NOTHING`,
      [orgId, userId]
    );

    const walletRows = await tx.query('SELECT * FROM wallets WHERE organization_id = $1 FOR UPDATE', [orgId]);
    const wallet = walletRows[0];

    // Double check duplicate inside lock
    const dupCheck = await tx.query(
      `SELECT id FROM wallet_transactions WHERE reference = $1`,
      [paymentId]
    );
    if (dupCheck.length > 0) {
      return { duplicate: true };
    }

    const newBalancePaise = Number(wallet.balance_paise) + amountPaise;

    await tx.query(
      `UPDATE wallets 
       SET balance_paise = $1, updated_at = NOW() 
       WHERE id = $2`,
      [newBalancePaise, wallet.id]
    );

    // Append-only ledger record
    await tx.query(
      `INSERT INTO wallet_transactions 
       (wallet_id, organization_id, user_id, amount_paise, type, status, reference, balance_after_paise, description, metadata)
       VALUES ($1, $2, $3, $4, 'deposit', 'completed', $5, $6, $7, $8)`,
      [
        wallet.id,
        orgId,
        userId,
        amountPaise,
        paymentId,
        newBalancePaise,
        `Razorpay Deposit (Order: ${orderId})`,
        JSON.stringify({ orderId, paymentId, method: verification.method || 'razorpay' }),
      ]
    );

    // Update razorpay_orders status
    await tx.query(
      `UPDATE razorpay_orders 
       SET status = 'paid', payment_id = $1, signature = $2, webhook_payload = $3, updated_at = NOW() 
       WHERE order_id = $4`,
      [paymentId, signature || null, webhookPayload ? JSON.stringify(webhookPayload) : null, orderId]
    );

    // Sync credit_wallets
    await tx.query(
      `UPDATE credit_wallets 
       SET balance = balance + $1, lifetime_purchased = lifetime_purchased + $1, updated_at = NOW() 
       WHERE organization_id = $2`,
      [parseFloat(amountInr), orgId]
    );

    // Record in global payments table
    await tx.query(
      `INSERT INTO payments (organization_id, amount, currency, status, provider, reference, metadata)
       VALUES ($1, $2, 'INR', 'paid', 'razorpay', $3, $4)`,
      [orgId, parseFloat(amountInr), paymentId, JSON.stringify({ orderId, type: 'wallet_deposit' })]
    );

    return { duplicate: false, newBalancePaise };
  });

  const updatedWallet = await getWallet(orgId, userId);
  return {
    success: true,
    credited: !result.duplicate,
    amount_inr: amountInr,
    wallet: updatedWallet,
  };
}

/**
 * Reserve wallet funds for phone number purchase state machine
 */
async function reserveFundsForNumberOrder({
  orgId,
  userId,
  orderId,
  phone,
  setupFeePaise,
  monthlyFeePaise,
  markupPaise,
  providerCostPaise,
  numberType = 'local',
  region = null,
  carrierItemId = null,
  employeeId = null,
}) {
  const totalChargedPaise = setupFeePaise + markupPaise;

  return await withTransaction(async (tx) => {
    // Ensure wallet exists & lock row
    await tx.query(
      `INSERT INTO wallets (organization_id, user_id, balance_paise, reserved_paise, currency)
       VALUES ($1, $2, 0, 0, 'INR')
       ON CONFLICT (organization_id) DO NOTHING`,
      [orgId, userId]
    );

    const walletRows = await tx.query('SELECT * FROM wallets WHERE organization_id = $1 FOR UPDATE', [orgId]);
    const wallet = walletRows[0];

    const currentBalance = Number(wallet.balance_paise || 0);
    const currentReserved = Number(wallet.reserved_paise || 0);
    const available = currentBalance - currentReserved;

    if (available < totalChargedPaise) {
      throw new AppError(
        `Insufficient available wallet balance. Required: ₹${(totalChargedPaise / 100).toFixed(2)}, Available: ₹${(available / 100).toFixed(2)}`,
        400,
        'INSUFFICIENT_WALLET_FUNDS'
      );
    }

    const newReserved = currentReserved + totalChargedPaise;
    await tx.query(
      'UPDATE wallets SET reserved_paise = $1, updated_at = NOW() WHERE id = $2',
      [newReserved, wallet.id]
    );

    // Insert number_order in FUNDS_RESERVED state
    await tx.query(
      `INSERT INTO number_orders 
       (order_id, organization_id, user_id, phone_number, provider, carrier_item_id, number_type, region,
        setup_fee_paise, monthly_fee_paise, markup_paise, total_charged_paise, provider_cost_paise,
        status, assigned_employee_id)
       VALUES ($1, $2, $3, $4, 'vobiz', $5, $6, $7, $8, $9, $10, $11, $12, 'FUNDS_RESERVED', $13)`,
      [
        orderId,
        orgId,
        userId,
        phone,
        carrierItemId,
        numberType,
        region,
        setupFeePaise,
        monthlyFeePaise,
        markupPaise,
        totalChargedPaise,
        providerCostPaise,
        employeeId || null,
      ]
    );

    // Append-only ledger reservation entry
    await tx.query(
      `INSERT INTO wallet_transactions 
       (wallet_id, organization_id, user_id, amount_paise, type, status, reference, balance_after_paise, description, metadata)
       VALUES ($1, $2, $3, $4, 'purchase_reservation', 'completed', $5, $6, $7, $8)`,
      [
        wallet.id,
        orgId,
        userId,
        -totalChargedPaise,
        `res_${orderId}`,
        currentBalance,
        `Funds reserved for phone number ${phone}`,
        JSON.stringify({ orderId, phone, totalChargedPaise }),
      ]
    );

    return {
      orderId,
      totalChargedPaise,
      totalChargedInr: (totalChargedPaise / 100).toFixed(2),
      reservedPaise: newReserved,
    };
  });
}

/**
 * Finalize wallet deduction and save purchased number in database
 */
async function finalizeNumberPurchase({
  orderId,
  carrierOrderId = null,
  carrierResult = null,
}) {
  return await withTransaction(async (tx) => {
    const orderRows = await tx.query('SELECT * FROM number_orders WHERE order_id = $1 FOR UPDATE', [orderId]);
    if (!orderRows.length) {
      throw new AppError(`Number order ${orderId} not found`, 404, 'ORDER_NOT_FOUND');
    }
    const order = orderRows[0];
    if (order.status === 'COMPLETED') {
      return order; // Already completed
    }

    const orgId = order.organization_id;
    const walletRows = await tx.query('SELECT * FROM wallets WHERE organization_id = $1 FOR UPDATE', [orgId]);
    const wallet = walletRows[0];

    const totalChargedPaise = Number(order.total_charged_paise);
    const newBalancePaise = Math.max(0, Number(wallet.balance_paise) - totalChargedPaise);
    const newReservedPaise = Math.max(0, Number(wallet.reserved_paise) - totalChargedPaise);

    await tx.query(
      'UPDATE wallets SET balance_paise = $1, reserved_paise = $2, updated_at = NOW() WHERE id = $3',
      [newBalancePaise, newReservedPaise, wallet.id]
    );

    // Update order status to COMPLETED
    await tx.query(
      `UPDATE number_orders 
       SET status = 'COMPLETED', carrier_order_id = $1, carrier_result = $2, updated_at = NOW() 
       WHERE id = $3`,
      [carrierOrderId, carrierResult ? JSON.stringify(carrierResult) : null, order.id]
    );

    // Ledger deduction record
    await tx.query(
      `INSERT INTO wallet_transactions 
       (wallet_id, organization_id, user_id, amount_paise, type, status, reference, balance_after_paise, description, metadata)
       VALUES ($1, $2, $3, $4, 'purchase_deduction', 'completed', $5, $6, $7, $8)`,
      [
        wallet.id,
        orgId,
        order.user_id,
        -totalChargedPaise,
        orderId,
        newBalancePaise,
        `Purchased phone number ${order.phone_number}`,
        JSON.stringify({ orderId, phone: order.phone_number, carrierOrderId }),
      ]
    );

    // Sync credit_wallets
    const chargedInr = totalChargedPaise / 100;
    await tx.query(
      `UPDATE credit_wallets 
       SET balance = GREATEST(0, balance - $1), lifetime_used = lifetime_used + $1, updated_at = NOW() 
       WHERE organization_id = $2`,
      [chargedInr, orgId]
    );

    // Save into phone_numbers table
    const monthlyCostInr = Number(order.monthly_fee_paise) / 100;
    const phoneRes = await tx.query(
      `INSERT INTO phone_numbers 
       (organization_id, number, provider, country, region, type, status, monthly_cost, employee_id)
       VALUES ($1, $2, 'vobiz', 'IN', $3, $4, 'active', $5, $6)
       ON CONFLICT (number) DO UPDATE SET 
         organization_id = EXCLUDED.organization_id, 
         status = 'active', 
         monthly_cost = EXCLUDED.monthly_cost,
         employee_id = COALESCE(EXCLUDED.employee_id, phone_numbers.employee_id)
       RETURNING id`,
      [orgId, order.phone_number, order.region || null, order.number_type || 'local', monthlyCostInr, order.assigned_employee_id || null]
    );

    const phoneId = phoneRes[0]?.id;

    // Save into phone_number_purchases
    await tx.query(
      `INSERT INTO phone_number_purchases
       (organization_id, user_id, number, provider, country, region, monthly_cost, setup_fee, amount_paid, currency, payment_id, carrier_result, status)
       VALUES ($1, $2, $3, 'vobiz', 'IN', $4, $5, $6, $7, 'INR', $8, $9, 'completed')`,
      [
        orgId,
        order.user_id,
        order.phone_number,
        order.region || null,
        monthlyCostInr,
        Number(order.setup_fee_paise) / 100,
        chargedInr,
        orderId,
        carrierResult ? JSON.stringify(carrierResult) : null,
      ]
    );

    return {
      orderId,
      phoneId,
      phoneNumber: order.phone_number,
      totalChargedInr: chargedInr.toFixed(2),
      balanceAfterInr: (newBalancePaise / 100).toFixed(2),
    };
  });
}

/**
 * Release reserved funds if purchase fails or is rejected
 */
async function releaseNumberReservation({ orderId, reason = 'Provider purchase failed' }) {
  return await withTransaction(async (tx) => {
    const orderRows = await tx.query('SELECT * FROM number_orders WHERE order_id = $1 FOR UPDATE', [orderId]);
    if (!orderRows.length) return null;
    const order = orderRows[0];
    if (order.status === 'FAILED' || order.status === 'REFUNDED') {
      return order; // Already released
    }

    const orgId = order.organization_id;
    const walletRows = await tx.query('SELECT * FROM wallets WHERE organization_id = $1 FOR UPDATE', [orgId]);
    if (!walletRows.length) return null;
    const wallet = walletRows[0];

    const totalChargedPaise = Number(order.total_charged_paise);
    const newReservedPaise = Math.max(0, Number(wallet.reserved_paise) - totalChargedPaise);

    await tx.query(
      'UPDATE wallets SET reserved_paise = $1, updated_at = NOW() WHERE id = $2',
      [newReservedPaise, wallet.id]
    );

    await tx.query(
      `UPDATE number_orders 
       SET status = 'FAILED', error_message = $1, updated_at = NOW() 
       WHERE id = $2`,
      [reason, order.id]
    );

    // Append-only reservation release record
    await tx.query(
      `INSERT INTO wallet_transactions 
       (wallet_id, organization_id, user_id, amount_paise, type, status, reference, balance_after_paise, description, metadata)
       VALUES ($1, $2, $3, $4, 'reservation_release', 'completed', $5, $6, $7, $8)`,
      [
        wallet.id,
        orgId,
        order.user_id,
        totalChargedPaise,
        `rel_${orderId}`,
        Number(wallet.balance_paise),
        `Reservation released for ${order.phone_number}: ${reason}`,
        JSON.stringify({ orderId, reason }),
      ]
    );

    return {
      orderId,
      status: 'FAILED',
      reason,
      reservedPaise: newReservedPaise,
    };
  });
}

/**
 * Admin Wallet Adjustment
 */
async function adminAdjustWallet({ orgId, adminUserId, amountInr, type = 'credit', reason = 'Admin adjustment' }) {
  const parsedInr = parseFloat(amountInr);
  if (isNaN(parsedInr) || parsedInr === 0) {
    throw new AppError('Adjustment amount must be a non-zero number', 400, 'INVALID_AMOUNT');
  }

  const deltaPaise = Math.round(Math.abs(parsedInr) * 100) * (type === 'credit' ? 1 : -1);

  return await withTransaction(async (tx) => {
    await tx.query(
      `INSERT INTO wallets (organization_id, balance_paise, reserved_paise, currency)
       VALUES ($1, 0, 0, 'INR')
       ON CONFLICT (organization_id) DO NOTHING`,
      [orgId]
    );

    const walletRows = await tx.query('SELECT * FROM wallets WHERE organization_id = $1 FOR UPDATE', [orgId]);
    const wallet = walletRows[0];

    const currentBalance = Number(wallet.balance_paise);
    const newBalance = currentBalance + deltaPaise;
    if (newBalance < 0) {
      throw new AppError('Adjustment would result in negative wallet balance', 400, 'NEGATIVE_BALANCE');
    }

    await tx.query(
      'UPDATE wallets SET balance_paise = $1, updated_at = NOW() WHERE id = $2',
      [newBalance, wallet.id]
    );

    const ref = `adj_${orgId}_${Date.now()}`;
    await tx.query(
      `INSERT INTO wallet_transactions 
       (wallet_id, organization_id, user_id, amount_paise, type, status, reference, balance_after_paise, description, metadata)
       VALUES ($1, $2, $3, $4, 'admin_adjustment', 'completed', $5, $6, $7, $8)`,
      [
        wallet.id,
        orgId,
        adminUserId,
        deltaPaise,
        ref,
        newBalance,
        `Admin adjustment: ${reason}`,
        JSON.stringify({ adminUserId, reason, deltaPaise }),
      ]
    );

    // Sync credit_wallets
    await tx.query(
      `UPDATE credit_wallets 
       SET balance = balance + $1, updated_at = NOW() 
       WHERE organization_id = $2`,
      [deltaPaise / 100, orgId]
    );

    return {
      organization_id: orgId,
      delta_inr: (deltaPaise / 100).toFixed(2),
      new_balance_inr: (newBalance / 100).toFixed(2),
      reference: ref,
    };
  });
}

module.exports = {
  getWallet,
  getTransactions,
  createDepositOrder,
  verifyAndCreditDeposit,
  reserveFundsForNumberOrder,
  finalizeNumberPurchase,
  releaseNumberReservation,
  adminAdjustWallet,
  getFinancialSetting,
};

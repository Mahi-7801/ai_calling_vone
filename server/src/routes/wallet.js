const express = require('express');
const { requireOrg } = require('../middleware/auth');
const { asyncHandler } = require('../utils/helpers');
const { AppError } = require('../utils/errors');
const walletService = require('../services/walletService');

const router = express.Router();
router.use(requireOrg);

/**
 * GET /api/wallet
 * Returns current wallet balance and reserve amounts for the user's organization
 */
router.get('/', asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const userId = req.user.id;
  const wallet = await walletService.getWallet(orgId, userId);
  res.json({ success: true, wallet });
}));

/**
 * GET /api/wallet/transactions
 * Returns append-only financial ledger transactions
 */
router.get('/transactions', asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const { limit = 20, offset = 0, type } = req.query;
  const result = await walletService.getTransactions(orgId, { limit, offset, type });
  res.json({ success: true, ...result });
}));

/**
 * POST /api/wallet/create-order
 * Creates a Razorpay order for depositing money into the user's wallet
 */
router.post('/create-order', asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const userId = req.user.id;
  const amount = req.body.amount || req.body.amount_inr;

  if (!amount) {
    throw new AppError('Deposit amount is required', 400, 'VALIDATION');
  }

  const order = await walletService.createDepositOrder({
    orgId,
    userId,
    amountInr: amount,
  });

  res.json({ success: true, order });
}));

/**
 * POST /api/wallet/verify
 * Cryptographically verifies Razorpay payment and credits user's wallet
 */
router.post('/verify', asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const userId = req.user.id;
  const { order_id, payment_id, signature } = req.body;

  if (!order_id || !payment_id) {
    throw new AppError('order_id and payment_id are required', 400, 'VALIDATION');
  }

  const result = await walletService.verifyAndCreditDeposit({
    orgId,
    userId,
    orderId: order_id,
    paymentId: payment_id,
    signature: signature || null,
  });

  res.json(result);
}));

module.exports = router;

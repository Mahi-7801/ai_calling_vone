const express = require('express');
const { requireOrg } = require('../middleware/auth');
const { asyncHandler } = require('../utils/helpers');
const { AppError } = require('../utils/errors');
const numberOrderService = require('../services/numberOrderService');

const router = express.Router();
router.use(requireOrg);

/**
 * GET /api/numbers/available
 * Retrieves live phone number inventory from VoBiz with platform markup applied
 */
router.get('/available', asyncHandler(async (req, res) => {
  const { country = 'IN', region = '', type = 'local', q = '', page = 1, limit = 20 } = req.query;
  const orgId = req.user.organization_id;

  const result = await numberOrderService.getAvailableNumbers({
    country,
    region,
    type,
    q,
    page,
    limit,
    orgId,
  });

  res.json(result);
}));

/**
 * POST /api/numbers/purchase
 * Automatically buys a phone number using the user's wallet balance
 * State Machine: CREATED -> FUNDS_RESERVED -> PROVIDER_PURCHASE_PENDING -> PURCHASE_CONFIRMED -> COMPLETED
 */
router.post('/purchase', asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const userId = req.user.id;
  const { e164, phone, phone_number, employee_id, user_message, note, message } = req.body;

  const targetNumber = e164 || phone || phone_number;
  if (!targetNumber) {
    throw new AppError('Phone number (e164) is required to purchase', 400, 'VALIDATION');
  }

  const result = await numberOrderService.purchaseNumberWithWallet({
    orgId,
    userId,
    e164: targetNumber,
    employeeId: employee_id || null,
    userMessage: user_message || note || message || null,
  });

  res.status(201).json(result);
}));

/**
 * GET /api/numbers/my
 * Returns phone numbers owned by the authenticated user's organization
 */
router.get('/my', asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const numbers = await numberOrderService.getMyNumbers(orgId);
  res.json({ success: true, numbers });
}));

/**
 * GET /api/numbers/orders
 * Returns number purchase orders history
 */
router.get('/orders', asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const { limit = 20, offset = 0 } = req.query;
  const result = await numberOrderService.getMyNumberOrders(orgId, { limit, offset });
  res.json({ success: true, ...result });
}));

module.exports = router;

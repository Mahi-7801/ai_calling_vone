const { generateId } = require('../../utils/helpers');

class MockPaymentProvider {
  async createOrder({ amount, currency = 'INR', orgId, description }) {
    const orderId = generateId('pay');
    return {
      orderId,
      provider: 'mock',
      amount,
      currency,
      status: 'created',
      description,
      merchant: 'telugu-ai-calling',
      // in mock mode this is a public-only token; real providers never expose secrets
    };
  }

  async verifyPayment({ orderId, paymentId }) {
    return { verified: true, reference: paymentId || generateId('payref'), orderId };
  }
}

module.exports = { MockPaymentProvider };
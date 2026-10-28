const config = require('../../config/env');
const { AppError } = require('../../utils/errors');

class StripeProvider {
  constructor() {
    this.secretKey = config.providers.payment.secret;
    this.publishableKey = config.providers.payment.keyId;
    this.baseUrl = 'https://api.stripe.com/v1';
  }

  #getAuthHeader() {
    return `Bearer ${this.secretKey}`;
  }

  async createOrder({ amount, currency = 'INR', orgId, description }) {
    if (!this.secretKey) {
      throw new AppError('Stripe secret key not configured', 500, 'STRIPE_NOT_CONFIGURED');
    }

    const form = new URLSearchParams();
    form.append('amount', Math.round(Number(amount) * 100).toString());
    form.append('currency', currency.toLowerCase());
    form.append('description', description || 'Credit Wallet Topup');
    form.append('metadata[orgId]', String(orgId));

    const res = await fetch(`${this.baseUrl}/payment_intents`, {
      method: 'POST',
      headers: {
        Authorization: this.#getAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
      throw new AppError(`Stripe Error: ${err.error?.message || res.statusText}`, 502, 'STRIPE_ERROR');
    }

    const data = await res.json();
    return {
      orderId: data.id,
      clientSecret: data.client_secret,
      publishableKey: this.publishableKey,
      amount: data.amount / 100,
      currency: data.currency,
      provider: 'stripe',
      status: data.status,
    };
  }

  async verifyPayment({ orderId, paymentId }) {
    if (!this.secretKey) throw new AppError('Stripe secret not configured', 500, 'STRIPE_NOT_CONFIGURED');
    const intentId = paymentId || orderId;
    const res = await fetch(`${this.baseUrl}/payment_intents/${intentId}`, {
      headers: { Authorization: this.#getAuthHeader() },
    });
    if (!res.ok) return { verified: false };
    const data = await res.json();
    return {
      verified: data.status === 'succeeded',
      reference: data.id,
      orderId: data.id,
    };
  }
}

module.exports = { StripeProvider };

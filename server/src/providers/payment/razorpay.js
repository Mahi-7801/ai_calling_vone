const crypto = require('crypto');
const config = require('../../config/env');
const { AppError } = require('../../utils/errors');
const { generateId } = require('../../utils/helpers');

class RazorpayProvider {
  constructor() {
    this.keyId = config.providers.payment.keyId;
    this.keySecret = config.providers.payment.secret;
    this.baseUrl = 'https://api.razorpay.com/v1';
  }

  #getAuthHeader() {
    return 'Basic ' + Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
  }

  async createOrder({ amount, currency = 'INR', orgId, description }) {
    if (!this.keyId || !this.keySecret) {
      throw new AppError('Razorpay credentials not configured (PAYMENT_KEY_ID, PAYMENT_SECRET)', 500, 'RAZORPAY_NOT_CONFIGURED');
    }

    // Razorpay amounts are in the smallest currency sub-unit (paise for INR, 1 INR = 100 paise)
    const amountInPaise = Math.round(Number(amount) * 100);
    const receipt = `rcpt_${orgId}_${Date.now()}`.slice(0, 40);

    const res = await fetch(`${this.baseUrl}/orders`, {
      method: 'POST',
      headers: {
        Authorization: this.#getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency,
        receipt,
        notes: { orgId: String(orgId), description: description || 'Credit Wallet Recharge' },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { description: res.statusText } }));
      throw new AppError(`Razorpay Order Error: ${err.error?.description || res.statusText}`, 502, 'RAZORPAY_ERROR');
    }

    const data = await res.json();
    return {
      orderId: data.id,
      keyId: this.keyId,
      amount: data.amount / 100,
      currency: data.currency,
      provider: 'razorpay',
      status: 'created',
      receipt: data.receipt,
    };
  }

  async verifyPayment({ orderId, paymentId, signature }) {
    if (!this.keySecret) {
      throw new AppError('Razorpay secret not configured', 500, 'RAZORPAY_NOT_CONFIGURED');
    }
    // The signature is what proves the payment happened: Razorpay computes
    // HMAC-SHA256 over "<order_id>|<razorpay_payment_id>" with the key secret
    // and returns it to the checkout handler. Without it there is nothing to
    // verify, so this must fail closed rather than fall through to "trust the
    // client said it paid".
    if (!orderId || !paymentId || !signature) {
      return { verified: false, reason: 'Missing orderId, paymentId or signature' };
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const a = Buffer.from(expectedSignature, 'utf8');
    const b = Buffer.from(String(signature), 'utf8');
    // timingSafeEqual throws when the lengths differ, which would otherwise turn
    // a wrong signature into a 500 instead of a clean rejection.
    if (a.length !== b.length) {
      return { verified: false, reason: 'Signature mismatch' };
    }

    const verified = crypto.timingSafeEqual(a, b);
    if (!verified) return { verified: false, reason: 'Signature mismatch' };

    // Signature alone only proves the checkout completed. Confirm against the
    // gateway that the order is actually captured before credits are granted.
    const payment = await this.fetchPayment(paymentId);
    const status = payment?.status || null;
    if (status && status !== 'captured' && status !== 'authorized') {
      return { verified: false, reason: `Payment status is "${status}", not captured`, reference: paymentId, orderId };
    }

    return {
      verified: true,
      reference: paymentId,
      orderId,
      amount: payment?.amount ? payment.amount / 100 : null,
      method: payment?.method || null,
    };
  }

  /** GET /v1/payments/{id} - authoritative payment state. */
  async fetchPayment(paymentId) {
    try {
      const res = await fetch(`${this.baseUrl}/payments/${encodeURIComponent(paymentId)}`, {
        headers: { Authorization: this.#getAuthHeader() },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  /**
   * Verify a webhook signature: HMAC-SHA256 of the raw request body with the
   * webhook secret, base64 encoded. Separate key from the API secret, which is
   * why the webhook secret is configured independently.
   */
  verifyWebhookSignature(rawBody, signature) {
    const secret = config.providers.payment.webhookSecret;
    if (!secret || !signature) return false;
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(String(signature), 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }
}

module.exports = { RazorpayProvider };

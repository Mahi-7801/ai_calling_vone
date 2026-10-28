const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { VoBizProvider } = require('./telephony/vobiz');
const { TwilioProvider } = require('./telephony/twilio');
const { MockTelephonyProvider } = require('./telephony/mock');
const { SarvamProvider } = require('./voice/sarvam');
const { CartesiaProvider } = require('./voice/cartesia');
const { DeepgramProvider } = require('./voice/deepgram');
const { MockVoiceProvider } = require('./voice/mock');
const { LLMProvider } = require('./ai/llm');
const { GroqProvider } = require('./ai/groq');
const { GeminiProvider } = require('./ai/gemini');
const { MockAIProvider } = require('./ai/mock');
const { RazorpayProvider } = require('./payment/razorpay');
const { StripeProvider } = require('./payment/stripe');
const { MockPaymentProvider } = require('./payment/mock');

let cache = {};

function getSTTProvider(name = null) {
  const chosen = name || (config.providers.deepgram.apiKey ? 'deepgram' : (config.providers.sarvam.apiKey ? 'sarvam' : 'mock'));
  const cacheKey = `stt_${chosen}`;
  if (!cache[cacheKey]) {
    if (chosen === 'deepgram' && config.providers.deepgram.apiKey) {
      cache[cacheKey] = new DeepgramProvider();
    } else if (chosen === 'sarvam' && config.providers.sarvam.apiKey) {
      cache[cacheKey] = new SarvamProvider();
    } else if (config.providers.deepgram.apiKey) {
      cache[cacheKey] = new DeepgramProvider();
    } else {
      cache[cacheKey] = new SarvamProvider();
    }
  }
  return cache[cacheKey];
}


function getTelephonyProvider(name = null) {
  const chosen = name || config.telephonyProvider || (config.providers.twilio.accountSid ? 'twilio' : (config.providers.vobiz.authId ? 'vobiz' : 'mock'));
  if (!cache[chosen]) {
    if (config.mockMode && !config.providers.twilio.accountSid && !config.providers.vobiz.authId) {
      cache[chosen] = new MockTelephonyProvider();
    } else if (chosen === 'twilio' && config.providers.twilio.accountSid && config.providers.twilio.authToken) {
      cache[chosen] = new TwilioProvider();
    } else if (chosen === 'vobiz' && config.providers.vobiz.authId && config.providers.vobiz.authToken) {
      cache[chosen] = new VoBizProvider();
    } else if (config.providers.twilio.accountSid && config.providers.twilio.authToken) {
      cache[chosen] = new TwilioProvider();
    } else if (config.providers.vobiz.authId && config.providers.vobiz.authToken) {
      cache[chosen] = new VoBizProvider();
    } else {
      cache[chosen] = new MockTelephonyProvider();
    }
  }
  return cache[chosen];
}

function getVoiceProvider(name = null) {
  const key = name || (config.providers.sarvam.apiKey ? 'sarvam' : (config.providers.cartesia.apiKey ? 'cartesia' : 'mock'));
  if (!cache[key]) {
    if (config.mockMode && key !== 'sarvam' && key !== 'cartesia') {
      cache[key] = new MockVoiceProvider();
    } else if (key === 'sarvam' && config.providers.sarvam.apiKey) {
      cache[key] = new SarvamProvider();
    } else if (key === 'cartesia' && config.providers.cartesia.apiKey) {
      cache[key] = new CartesiaProvider();
    } else if (config.providers.sarvam.apiKey) {
      cache[key] = new SarvamProvider();
    } else if (config.providers.cartesia.apiKey) {
      cache[key] = new CartesiaProvider();
    } else {
      cache[key] = new MockVoiceProvider();
    }
  }
  return cache[key];
}

function getAIProvider(preferred = null) {
  if (preferred === 'gemini' || (!preferred && !process.env.GROQ_API_KEY && (process.env.GEMINI_API_KEY || config.providers?.gemini?.apiKey))) {
    if (!cache.gemini) cache.gemini = new GeminiProvider();
    return cache.gemini;
  }
  if (preferred === 'groq' || (!preferred && (process.env.GROQ_API_KEY || config.providers.llm.baseUrl?.includes('groq')))) {
    if (!cache.groq) cache.groq = new GroqProvider();
    return cache.groq;
  }
  if (!cache.ai) {
    const hasKey = !!(config.providers.llm.apiKey);
    cache.ai = (!config.mockMode && hasKey) || hasKey ? new LLMProvider() : new MockAIProvider();
  }
  return cache.ai;
}

function getPaymentProvider() {
  if (!cache.payment) {
    const p = config.providers.payment.provider;
    if (p === 'razorpay' && config.providers.payment.keyId && config.providers.payment.secret) {
      cache.payment = new RazorpayProvider();
    } else if (p === 'stripe' && config.providers.payment.secret) {
      cache.payment = new StripeProvider();
    } else {
      cache.payment = new MockPaymentProvider();
    }
  }
  return cache.payment;
}

/**
 * Pick the provider that can actually serve a given voice id.
 * Sarvam clones (svc-<uuid>) only exist on Sarvam.
 * Cartesia voices use UUID format.
 * If employee has voice_provider set, honor it.
 * Otherwise auto-detect based on voice ID format and available API keys.
 */
function resolveVoiceProvider(voiceId, declaredProvider = null) {
  const { isClonedVoiceId } = require('./voice/sarvam');
  
  // If employee explicitly declared a provider, use it
  if (declaredProvider) return getVoiceProvider(declaredProvider);
  
  // If voice ID is Sarvam cloned format, must use Sarvam
  const { isClonedVoiceId: isSarvamClone } = require('./voice/sarvam');
  if (isSarvamClone(voiceId)) return getVoiceProvider('sarvam');
  
  // If voice ID is Cartesia UUID format, use Cartesia
  const { isCartesiaVoiceId } = require('./voice/cartesia');
  if (isCartesiaVoiceId(voiceId)) return getVoiceProvider('cartesia');
  
  // Auto-detect based on available API keys
  const cfg = require('../config/env');
  if (cfg.providers.cartesia.apiKey) return getVoiceProvider('cartesia');
  if (cfg.providers.sarvam.apiKey) return getVoiceProvider('sarvam');
  
  return getVoiceProvider(null);
}

async function generateLiveKitToken({ room, identity, name = null }) {
  const { apiKey, apiSecret } = config.providers.livekit;
  if (!apiKey || !apiSecret) return null;

  try {
    const { AccessToken } = require('livekit-server-sdk');
    const at = new AccessToken(apiKey, apiSecret, {
      identity: identity || `user-${Date.now()}`,
      name: name || identity || 'Caller',
      ttl: '24h',
    });
    at.addGrant({
      room: room || 'ai-calling-demo',
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    return await at.toJwt();
  } catch (err) {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: apiKey,
      sub: identity || `user-${Date.now()}`,
      name: name || identity,
      video: {
        room: room || 'ai-calling-demo',
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      },
      nbf: now - 5,
      exp: now + (24 * 3600),
    };
    return jwt.sign(payload, apiSecret, { algorithm: 'HS256' });
  }
}

/**
 * The voice catalogue for the picker.
 *
 * CartesiaProvider.getVoices() and SarvamProvider.getVoices() are async, so
 * they are awaited here. Returning them unawaited handed callers a Promise and
 * every consumer that iterated the result got nothing.
 */
async function listConfigurableVoices() {
  const mock = new MockVoiceProvider().getVoices();
  const [sarvam, cartesia] = await Promise.all([
    new SarvamProvider().getVoices().catch(() => []),
    new CartesiaProvider().getVoices().catch(() => []),
  ]);
  return { mock, sarvam, cartesia };
}

module.exports = {
  getTelephonyProvider,
  getVoiceProvider,
  resolveVoiceProvider,
  getSTTProvider,
  DeepgramProvider,
  getAIProvider,
  getPaymentProvider,
  generateLiveKitToken,
  listConfigurableVoices,
};
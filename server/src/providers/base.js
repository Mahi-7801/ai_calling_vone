/**
 * Provider interfaces. Implement these to connect real providers.
 *
 * TelephonyProvider:
 *   makeCall({ to, from, employee, callId }) -> Promise<{ providerCallId, status }>
 *   hangupCall(providerCallId) -> Promise<void>
 *   getCallStatus(providerCallId) -> Promise<{ status, duration }>
 *   listPhoneNumbers() -> Promise<Array<{ number, country, type, status }>>
 *
 * VoiceProvider:
 *   synthesize(text, { language, voice, speed, pitch, stability }) -> Promise<{ audioUrl, contentType }>
 *   getVoices(language) -> Promise<Array<{ id, name, language, gender }>>
 *
 * AIProvider:
 *   generateResponse(messages, { systemPrompt, temperature }) -> Promise<{ text, usage }>
 *   analyzeCall({ transcript, summaryRequested }) -> Promise<{ summary, sentiment, intent, outcome }>
 *
 * PaymentProvider:
 *   createOrder({ amount, currency }) -> Promise<{ orderId, amount, currency, ... }>
 *   verifyPayment({ orderId, paymentId }) -> Promise<{ verified, reference }>
 */

module.exports = {};
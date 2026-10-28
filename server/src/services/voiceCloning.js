const config = require('../config/env');
const { getVoiceProvider } = require('../providers');
const { AppError } = require('../utils/errors');

/**
 * Voice cloning runs against more than one provider because no single plan
 * guarantees availability:
 *   - Cartesia's /voices/clone requires a paid plan (402 on Free).
 *   - Sarvam's generation model occasionally returns 503.
 * We try each provider in order and keep the first real clone. A provider only
 * counts as failed if it could not create a clone - once a clone exists we
 * never create a second one for the same upload.
 */
function cloneProviderOrder() {
  const configured = String(process.env.VOICE_CLONE_PROVIDERS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const order = configured.length ? configured : ['sarvam', 'cartesia'];

  // Only keep providers that are actually usable, and never return a name twice.
  const usable = order.filter((name, idx) => {
    if (order.indexOf(name) !== idx) return false;
    if (name === 'sarvam') return !!config.providers.sarvam.apiKey;
    if (name === 'cartesia') return !!config.providers.cartesia.apiKey;
    return false;
  });

  return usable;
}

/** Turn a provider error into something a user can act on without exposing internal provider/API names. */
function describeFailure(providerName, err) {
  const raw = String(err?.message || '');

  if (raw.includes('plan_upgrade_required') || raw.includes('free tier')) {
    return 'Voice cloning is currently not enabled on this plan';
  }
  if (/speech duration is too short|recording is too short/i.test(raw)) {
    return 'The recording does not contain enough clear speech (minimum 4 seconds of continuous speech required, 10–30s recommended)';
  }
  if (/failure_reasons|audio validation|speaker|noise/i.test(raw)) {
    const detail = raw.replace(/^Voice sample rejected:\s*/, '').split(/,(?=[A-Z])/)[0].trim();
    return detail.replace(/^(sarvam|cartesia):\s*/gi, '');
  }
  if (/currently unavailable|model_call_error/i.test(raw)) {
    return 'The neural voice engine is temporarily unavailable. Please try again shortly';
  }
  if (raw.includes('UNSUPPORTED_AUDIO_FORMAT')) {
    return 'Unsupported audio format. Please upload a clear .wav, .mp3, or .m4a file';
  }
  if (raw.includes('UNSUPPORTED_LANGUAGE')) {
    return 'Selected language is not supported for voice cloning';
  }
  const clean = raw.replace(/^(sarvam|cartesia):\s*/gi, '').slice(0, 140);
  return clean || 'Voice sample could not be processed';
}

/**
 * Attempt to create a real clone, falling back through the provider list.
 * Throws only when every configured provider has failed.
 */
async function createVoiceClone({ audioBuffer, fileName, contentType, name, language, description = '' }) {
  const order = cloneProviderOrder();
  if (!order.length) {
    throw new AppError(
      'No voice cloning provider is available. Please contact administrator.',
      500,
      'CLONE_NOT_CONFIGURED'
    );
  }

  const failures = [];

  for (const providerName of order) {
    const provider = getVoiceProvider(providerName);
    const t0 = Date.now();
    try {
      const cloned = await provider.cloneVoice({
        audioBuffer,
        fileName,
        contentType,
        name,
        // Sarvam wants a locale (te-IN); Cartesia wants a bare ISO code (te).
        language: providerName === 'sarvam' ? (language.includes('-') ? language : `${language}-IN`) : language,
        description,
      });

      const voiceId = cloned?.id || cloned?.voice_id;
      if (!voiceId) throw new Error('provider returned no voice id');

      console.log(`[voice-clone] ${providerName} succeeded in ${Date.now() - t0}ms -> ${voiceId}`);
      return { providerName, voiceId, raw: cloned, attempts: failures.length };
    } catch (err) {
      const reason = describeFailure(providerName, err);
      failures.push(reason);
      console.warn(`[voice-clone] ${providerName} failed: ${reason}`);
    }
  }

  // Every provider failed. Report the most actionable reason first without exposing provider/API details.
  const isAudioQuality = failures.some((f) => /clear speech|failure_reasons|unsupported audio|duration|noise/i.test(f));
  const primaryReason = failures[0] ? failures[0].replace(/^(sarvam|cartesia):\s*/gi, '') : 'Recording did not meet audio quality criteria';
  const message = isAudioQuality
    ? `Your recording was rejected: ${primaryReason}. Record 15-30 seconds of continuous speech in a quiet room and try again.`
    : `Voice cloning is temporarily unavailable. No voice was created and no fee was charged.`;

  throw new AppError(message, isAudioQuality ? 422 : 502, 'CLONE_FAILED');
}

module.exports = { createVoiceClone, cloneProviderOrder, describeFailure };

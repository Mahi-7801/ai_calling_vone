const config = require('../../config/env');
const { AppError } = require('../../utils/errors');
const { toPcmMulaw8k } = require('../../services/pcm');

// Sarvam clones are identified by this prefix (svc-<uuid>).
const CLONE_ID_RE = /^svc-[a-z0-9-]+$/i;

function isClonedVoiceId(id) {
  return typeof id === 'string' && CLONE_ID_RE.test(id.trim());
}

async function sarvamRequest(path, options = {}) {
  if (!config.providers.sarvam.apiKey) {
    throw new AppError('Sarvam API key not configured in .env (SARVAM_API_KEY)', 500, 'SARVAM_NOT_CONFIGURED');
  }
  const isMultipart = options.body instanceof FormData;
  const headers = {
    'api-subscription-key': config.providers.sarvam.apiKey,
    ...(options.headers || {}),
  };
  if (!isMultipart && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  // Sarvam's voice-cloning generation model returns 503 while it warms up or
  // under load. Those are worth retrying; 4xx are not.
  const maxAttempts = options.retries ?? 0;
  const backoffMs = options.backoffMs ?? 1200;
  const maxBackoffMs = options.maxBackoffMs ?? Infinity;
  let lastStatus = 0;
  let lastText = '';

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    const res = await fetch(`https://api.sarvam.ai${path}`, {
      method: options.method || 'POST',
      headers,
      body: isMultipart ? options.body : (options.body ? JSON.stringify(options.body) : undefined),
    });

    if (res.ok) return res.json();

    lastStatus = res.status;
    lastText = await res.text().catch(() => '');
    const retryable = res.status === 503 || res.status === 429 || res.status >= 500;
    if (!retryable || attempt === maxAttempts) break;
    const wait = Math.min(maxBackoffMs, backoffMs * (attempt + 1));
    await new Promise((r) => setTimeout(r, wait));
  }

  throw new AppError(`Sarvam error ${lastStatus}: ${lastText}`, 502, 'SARVAM_ERROR');
}

// Real Sarvam speaker ids. These are the only values the TTS API accepts, so the
// advertised catalogue must use them verbatim. The previous list advertised
// invented names (meera, arvind, sweetie, aditi, ...) that do not exist upstream:
// synthesize() then silently substituted a different speaker, so the preview the
// user clicked was not the voice they heard, and not the voice a saved employee
// would use.
const SARVAM_SPEAKERS = [
  'aditya', 'ritu', 'ashutosh', 'priya', 'neha', 'rahul', 'pooja', 'rohan', 'simran',
  'kavya', 'amit', 'dev', 'ishita', 'shreya', 'ratan', 'varun', 'manan', 'sumit',
  'roopa', 'kabir', 'aayan', 'shubh', 'advait', 'anand', 'tanya', 'tarun', 'sunny',
  'mani', 'gokul', 'vijay', 'shruti', 'suhani', 'mohit', 'kavitha', 'rehan', 'soham', 'rupali',
];

class SarvamProvider {
  constructor() {
    // Advertise real speakers only, with the personality described in the label.
    this.voices = [
      { id: 'kavya', name: 'Kavya (Telugu Female - Warm & Expressive)', language: 'te-IN', language_code: 'te', language_name: 'Telugu', gender: 'female', provider: 'sarvam' },
      { id: 'kavitha', name: 'Kavitha (Telugu Female - Professional & Clear)', language: 'te-IN', language_code: 'te', language_name: 'Telugu', gender: 'female', provider: 'sarvam' },
      { id: 'roopa', name: 'Roopa (Telugu Female - Soft & Conversational)', language: 'te-IN', language_code: 'te', language_name: 'Telugu', gender: 'female', provider: 'sarvam' },
      { id: 'ishita', name: 'Ishita (Telugu Female - Bright & Friendly)', language: 'te-IN', language_code: 'te', language_name: 'Telugu', gender: 'female', provider: 'sarvam' },
      { id: 'shruti', name: 'Shruti (Telugu Female - Calm & Reassuring)', language: 'te-IN', language_code: 'te', language_name: 'Telugu', gender: 'female', provider: 'sarvam' },
      { id: 'simran', name: 'Simran (Telugu Female - Smooth & Modern)', language: 'te-IN', language_code: 'te', language_name: 'Telugu', gender: 'female', provider: 'sarvam' },
      { id: 'aditya', name: 'Aditya (Telugu Male - Professional & Deep)', language: 'te-IN', language_code: 'te', language_name: 'Telugu', gender: 'male', provider: 'sarvam' },
      { id: 'ashutosh', name: 'Ashutosh (Telugu Male - Formal & Assured)', language: 'te-IN', language_code: 'te', language_name: 'Telugu', gender: 'male', provider: 'sarvam' },
      { id: 'rahul', name: 'Rahul (Telugu Male - Friendly & Clear)', language: 'te-IN', language_code: 'te', language_name: 'Telugu', gender: 'male', provider: 'sarvam' },
      { id: 'amit', name: 'Amit (Telugu Male - Upbeat & Sales-ready)', language: 'te-IN', language_code: 'te', language_name: 'Telugu', gender: 'male', provider: 'sarvam' },
      { id: 'dev', name: 'Dev (Telugu Male - Young & Energetic)', language: 'te-IN', language_code: 'te', language_name: 'Telugu', gender: 'male', provider: 'sarvam' },
      { id: 'advait', name: 'Advait (Telugu Male - Bold & Confident)', language: 'te-IN', language_code: 'te', language_name: 'Telugu', gender: 'male', provider: 'sarvam' },
      { id: 'anand', name: 'Anand (Telugu Male - Steady & Composed)', language: 'te-IN', language_code: 'te', language_name: 'Telugu', gender: 'male', provider: 'sarvam' },
    ].filter((v) => SARVAM_SPEAKERS.includes(v.id));

    // Single source of truth for the speaker check in synthesize().
    this.validSpeakers = new Set(SARVAM_SPEAKERS);
  }

  async synthesize(text, opts = {}) {
    if (!text || !text.trim()) throw new AppError('Text is required for voice synthesis', 400, 'EMPTY_TEXT');

    // A cloned voice must go through /voices/clone, not the stock speaker list.
    const rawVoice = String(opts.voice || '').trim();
    if (isClonedVoiceId(rawVoice)) {
      return this.synthesizeCloned(text, rawVoice, opts);
    }

    const requested = (opts.voice || '').toLowerCase();
    // Unknown ids used to fall through to aditya/kavitha with no warning, so a
    // saved employee pointed at a stale or invented voice id would speak in
    // someone else's voice. Now it is logged loudly; we still synthesise rather
    // than throw, because going mute mid-call is worse than the wrong voice.
    let speaker = requested;
    if (!this.validSpeakers.has(requested)) {
      speaker = opts.gender === 'male' ? 'aditya' : 'kavitha';
      console.warn(
        `[sarvam] "${opts.voice}" is not a valid Sarvam speaker; substituting "${speaker}". ` +
        'Re-pick the voice in the employee Voice tab so previews match the saved voice.'
      );
    }

    let normalizedPitch = undefined;
    if (opts.pitch != null) {
      const p = parseFloat(opts.pitch);
      normalizedPitch = Math.max(-0.5, Math.min(0.5, p > 0.5 ? Math.round((p - 1.0) * 100) / 100 : p));
    }

    const data = await sarvamRequest('/text-to-speech', {
      body: {
        inputs: [text.trim()],
        target_language_code: opts.language || 'te-IN',
        speaker,
        pacing: opts.speed || 1.0,
        speech_sample_rate: 22050,
        audio_format: 'wav',
        model: config.providers.sarvam.model || 'bulbul:v3',
        ...(normalizedPitch != null ? { pitch: normalizedPitch } : {}),
        ...(opts.stability != null ? { model_params: { stability: opts.stability } } : {}),
      },
    });

    const rawAudio = data.audios?.[0] || null;
    if (!rawAudio) throw new AppError('No audio returned by Sarvam TTS', 502, 'SARVAM_EMPTY_RESPONSE');

    // Bulbul returns base64 WAV. A http(s) URL would have to be fetched before
    // it can be re-encoded, so fetch it rather than passing the URL through.
    const isUrl = !rawAudio.startsWith('data:') && /^https?:\/\//i.test(rawAudio);
    const base64 = rawAudio.startsWith('data:')
      ? rawAudio.slice(rawAudio.indexOf(',') + 1)
      : rawAudio;
    let wav;
    if (isUrl) {
      const res = await fetch(rawAudio);
      if (!res.ok) throw new AppError(`Could not fetch Sarvam audio (${res.status})`, 502, 'SARVAM_AUDIO_FETCH_FAILED');
      wav = Buffer.from(await res.arrayBuffer());
    } else {
      wav = Buffer.from(base64, 'base64');
    }

    // telephony/browser callers need 8 kHz G.711 mu-law, not WAV
    if (opts.mulaw === true) {
      const mulaw = await toPcmMulaw8k(wav);
      return {
        audioUrl: `data:audio/x-mulaw;base64,${mulaw.toString('base64')}`,
        contentType: 'audio/x-mulaw;rate=8000',
        bytes: mulaw.length,
        buffer: mulaw,
        sampleRate: 8000,
      };
    }

    return {
      audioUrl: `data:audio/wav;base64,${wav.toString('base64')}`,
      contentType: 'audio/wav',
      bytes: wav.length,
      buffer: wav,
    };
  }

  /**
   * Streaming synthesis for telephony: yields 8 kHz G.711 mu-law frames.
   *
   * Sarvam has no streaming endpoint, so the whole utterance is generated first
   * and then re-framed. Callers get the same interface as Cartesia's generator,
   * and the browser/PSTN path can stay provider-agnostic. Sarvam's bulbul voices
   * are purpose-built for Telugu and the other Indian languages, so they are the
   * better default there than a general-purpose multilingual voice.
   */
  async *streamSynthesize(text, opts = {}) {
    if (!text || !text.trim()) throw new AppError('Text is required for voice synthesis', 400, 'EMPTY_TEXT');

    const result = await this.synthesize(text, { ...opts, mulaw: true });
    const mulaw = result.buffer;
    if (!Buffer.isBuffer(mulaw) || mulaw.length === 0) {
      throw new AppError('Sarvam returned no audio to stream', 502, 'SARVAM_EMPTY_RESPONSE');
    }

    // 20ms frames at 8 kHz. Uniform sizing is what the carriers and the browser
    // player both expect for gapless playback.
    const FRAME = 160;
    for (let i = 0; i < mulaw.length; i += FRAME) {
      yield mulaw.subarray(i, Math.min(i + FRAME, mulaw.length));
    }
  }

  async transcribe(audioBufferOrBase64, opts = {}) {
    if (!config.providers.sarvam.apiKey) {
      throw new AppError('Sarvam API key not configured', 500, 'SARVAM_NOT_CONFIGURED');
    }
    const buffer = Buffer.isBuffer(audioBufferOrBase64)
      ? audioBufferOrBase64
      : Buffer.from(String(audioBufferOrBase64).replace(/^data:audio\/\w+;base64,/, ''), 'base64');

    const formData = new FormData();
    const blob = new Blob([buffer], { type: opts.mimeType || 'audio/wav' });
    formData.append('file', blob, 'audio.wav');
    formData.append('model', config.providers.sarvam.sttModel || 'saaras:v3');
    if (opts.language) formData.append('language_code', opts.language);

    const data = await sarvamRequest('/speech-to-text', {
      method: 'POST',
      body: formData,
    });

    return {
      transcript: data.transcript || '',
      languageCode: data.language_code || opts.language || 'te-IN',
      confidence: data.confidence || 0.95,
      raw: data,
    };
  }

  /**
   * Generate speech in a voice created via POST /voices/create.
   * Sarvam returns base64 WAV, which is resampled to 8 kHz G.711 mu-law when the
   * caller needs PSTN-ready audio.
   */
  async synthesizeCloned(text, voiceId, opts = {}) {
    const lang = opts.language || 'te-IN';

    // Sarvam caps a single generation at 1000 characters.
    const CHUNK = 900;
    const chunks = [];
    for (let i = 0; i < text.length; i += CHUNK) chunks.push(text.slice(i, i + CHUNK));
    if (!chunks.length) chunks.push('');

    const wavBuffers = [];
    for (const chunk of chunks) {
      const formData = new FormData();
      formData.append('voice_id', voiceId);
      formData.append('text', chunk);
      formData.append('language_code', lang);
      // Sarvam's generation model returns 503 "Voice cloning model is currently
  // unavailable" while it warms up after a cold start, and a freshly created
  // clone is exactly when that happens. Two attempts with a ~2s backoff lost the
  // race and the clone ended up with no generated preview at all. Retry for
  // roughly half a minute before giving up.
  const data = await sarvamRequest('/voices/clone', { body: formData, retries: 5, backoffMs: 3000, maxBackoffMs: 8000 });
      if (!data.audio) throw new AppError('No audio returned by Sarvam voice clone', 502, 'SARVAM_EMPTY_RESPONSE');
      wavBuffers.push(Buffer.from(data.audio, 'base64'));
    }

    const wav = wavBuffers.length === 1 ? wavBuffers[0] : concatWav(wavBuffers);
    const contentType = 'audio/wav';
    const result = {
      audioUrl: `data:audio/wav;base64,${wav.toString('base64')}`,
      contentType,
      bytes: wav.length,
      buffer: wav,
    };

    if (opts.mulaw === true) {
      const mulaw = await toPcmMulaw8k(wav);
      return {
        audioUrl: `data:audio/x-mulaw;base64,${mulaw.toString('base64')}`,
        contentType: 'audio/x-mulaw;rate=8000',
        bytes: mulaw.length,
        buffer: mulaw,
        sampleRate: 8000,
      };
    }
    return result;
  }

  /**
   * Create a cloned voice from a reference clip.
   * `audioBuffer` must already be a format Sarvam accepts (wav works best).
   * Returns { voice_id, reference_text, ... }.
   */
  async cloneVoice({ audioBuffer, name, language = 'te-IN', description = '' }) {
    if (!config.providers.sarvam.apiKey) {
      throw new AppError('Sarvam API key not configured in .env (SARVAM_API_KEY)', 500, 'SARVAM_NOT_CONFIGURED');
    }

    const formData = new FormData();
    formData.append('name', String(name).slice(0, 100));
    formData.append('language', language);
    formData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'reference.wav');

    try {
      const data = await sarvamRequest('/voices/create', { body: formData });
      const voiceId = data?.data?.voice_id || data?.voice_id;
      if (!voiceId) throw new AppError('Sarvam did not return a voice_id', 502, 'SARVAM_CLONE_ERROR');
      return { ...data.data, voice_id: voiceId, id: voiceId, name, description };
    } catch (err) {
      // Surface Sarvam's validation reasons verbatim - they are actionable
      // (e.g. "Total speech duration is too short").
      const raw = String(err.message || '');
      const reasons = raw.match(/"failure_reasons":\[(.*?)\]/s);
      const detail = reasons ? reasons[1].replace(/["\\]/g, '').replace(/\s+/g, ' ').trim() : raw;
      throw new AppError(`Voice sample rejected: ${detail}`, 422, 'SARVAM_CLONE_REJECTED');
    }
  }

  async listClonedVoices() {
    const data = await sarvamRequest('/voices', { method: 'GET' }).catch(() => null);
    return data?.data?.voices || data?.voices || [];
  }

  /** Full details for one clone, including time-limited preview audio URLs. */
  async getClonedVoice(voiceId) {
    const data = await sarvamRequest(`/voices/${voiceId}`, { method: 'GET' });
    return data?.data || data;
  }

/**
 * Fetch a clone's own preview audio.
 *
 * Sarvam renders two different things: `reference_audio_url` is the clip the
 * customer uploaded, and `preview_audio_url` is generated from the clone. Only
 * the second one proves the clone works. Returning the reference here is what
 * made every cloned voice sound identical - the customer heard their own
 * recording played back and concluded cloning was broken.
 *
 * Returns `{ buffer, isReference }` so the caller can label it honestly, or
 * `{ buffer: null }` when the only audio available is the input file.
 */
async fetchClonedVoicePreview(voiceId) {
  const detail = await this.getClonedVoice(voiceId);
  const generatedUrl = detail?.preview_audio_url;
  if (!generatedUrl) {
    const ref = detail?.reference_audio_url;
    return { buffer: null, isReference: true, hasReference: !!ref, detail };
  }
  const res = await fetch(generatedUrl);
  if (!res.ok) return { buffer: null, isReference: false, detail };
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, isReference: false, detail };
}

  async deleteClonedVoice(voiceId) {
    return sarvamRequest(`/voices/delete/${voiceId}`, { method: 'DELETE' }).catch(() => null);
  }

  async getVoices() {
    return this.voices;
  }
}

module.exports = { SarvamProvider, isClonedVoiceId };
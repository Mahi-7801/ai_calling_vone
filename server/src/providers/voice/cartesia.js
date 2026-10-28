const { randomUUID } = require('crypto');
const config = require('../../config/env');
const { AppError } = require('../../utils/errors');

// Cartesia voice IDs are standard UUIDs
const CARTESIA_VOICE_ID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function isCartesiaVoiceId(id) {
  if (typeof id !== 'string') return false;
  const clean = id.trim().startsWith('cartesia:') ? id.trim().slice(9) : id.trim();
  return CARTESIA_VOICE_ID_RE.test(clean);
}

// =============================================================================
// Cartesia TTS / Voice API
// Reference: https://docs.cartesia.ai
//
// Auth differs by transport, per the docs:
//   REST  -> "Authorization: Bearer <api_key>"  (X-API-Key is WebSocket-only)
//   WS    -> "X-API-Key: <api_key>" header, plus "?cartesia_version=<date>"
// The version query parameter takes precedence over the header, so it is sent
// on the socket as well.
// =============================================================================
const API_BASE = 'https://api.cartesia.ai';
const WS_URL = 'wss://api.cartesia.ai/tts/websocket';
// The docs declare exactly one value in the Cartesia-Version enum.
const API_VERSION = '2026-08-14';

// Upload constraints for POST /voices/clone (the `clip` field).
const CLONE_FORMATS = new Set(['flac', 'mp3', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm']);
const CLONE_MAX_BYTES = 16 * 1024 * 1024;

// TTSRequest.model_id enum.
const MODEL_IDS = new Set(['sonic-3.6', 'sonic-3.5', 'sonic-3', 'sonic-latest']);

// RawOutputFormat.encoding enum.
const RAW_ENCODINGS = new Set(['pcm_f32le', 'pcm_s16le', 'pcm_mulaw', 'pcm_alaw']);

// RawOutputFormat.sample_rate enum (shared by every container variant).
const SAMPLE_RATES = new Set([8000, 16000, 22050, 24000, 44100, 48000]);

// SupportedLanguage enum (44 base codes) - the `language` field on
// POST /voices/clone and the base of the TTS language/locale enum.
const SUPPORTED_LANGUAGES = new Set([
  'en', 'fr', 'de', 'es', 'pt', 'zh', 'ja', 'hi', 'it', 'ko', 'nl', 'pl', 'ru',
  'sv', 'tr', 'tl', 'bg', 'ro', 'ar', 'cs', 'el', 'fi', 'hr', 'ms', 'sk', 'da',
  'ta', 'uk', 'hu', 'no', 'vi', 'bn', 'th', 'he', 'ka', 'id', 'te', 'gu', 'kn',
  'ml', 'mr', 'pa', 'or', 'ur',
]);

// VoiceAccent enum, grouped by the language it is valid for. The clone endpoint
// rejects an accent that is not listed for the submitted language.
const ACCENTS_BY_LANGUAGE = {
  ar: ['khaleeji', 'middle-eastern-arabic', 'modern-standard-arabic'],
  bn: ['jessore'],
  bg: ['bulgarian'],
  zh: ['mandarin', 'taiwanese-mandarin'],
  hr: ['zagreb'],
  cs: ['czech'],
  da: ['danish'],
  nl: ['randstad'],
  en: [
    'african-american', 'arabic-english', 'australian', 'british', 'california',
    'canadian-english', 'general-american', 'indian-english', 'irish',
    'midwestern-american', 'new-york', 'new-zealand', 'philippine-english',
    'singaporean', 'south-african', 'southern-us',
  ],
  fi: ['finnish'],
  fr: ['african-french', 'belgian-french', 'canadian-french', 'parisian'],
  ka: ['tbilisi'],
  de: ['standard-german', 'swiss-standard'],
  el: ['thessaloniki'],
  gu: ['parsi'],
  he: ['israeli'],
  hi: ['bagheli', 'standard-hindi'],
  hu: ['budapest'],
  id: ['standard-indonesian'],
  it: ['abruzzo-italian', 'campania', 'standard-italian'],
  ja: ['standard-japanese'],
  kn: ['southern-karnataka'],
  ko: ['korean'],
  ms: ['malay'],
  ml: ['north-kerala'],
  mr: ['konkani'],
  no: ['oslo'],
  or: ['odia'],
  pl: ['polish'],
  pt: ['brazilian-portuguese', 'european-portuguese'],
  pa: ['powadhi'],
  ro: ['moldovan', 'romanian'],
  ru: ['russian'],
  sk: ['slovak'],
  es: ['camba', 'castilian', 'chilean', 'colombian', 'mexican', 'peruvian'],
  sv: ['stockholm'],
  tl: ['manila'],
  ta: ['central-tamil'],
  te: ['telangana'],
  th: ['central-thai'],
  tr: ['istanbul'],
  uk: ['kyiv'],
  ur: ['indian-urdu', 'urdu'],
  vi: ['central-vietnamese', 'southern-vietnamese'],
};

// Human-readable names for the 44 documented language codes. The picker labels
// each voice with this, so a bare uppercased code ("TE") would be rendered
// straight into the UI.
const LANGUAGE_NAMES = {
  en: 'English', fr: 'French', de: 'German', es: 'Spanish', pt: 'Portuguese',
  zh: 'Chinese', ja: 'Japanese', hi: 'Hindi', it: 'Italian', ko: 'Korean',
  nl: 'Dutch', pl: 'Polish', ru: 'Russian', sv: 'Swedish', tr: 'Turkish',
  tl: 'Tagalog', bg: 'Bulgarian', ro: 'Romanian', ar: 'Arabic', cs: 'Czech',
  el: 'Greek', fi: 'Finnish', hr: 'Croatian', ms: 'Malay', sk: 'Slovak',
  da: 'Danish', ta: 'Tamil', uk: 'Ukrainian', hu: 'Hungarian', no: 'Norwegian',
  vi: 'Vietnamese', bn: 'Bengali', th: 'Thai', he: 'Hebrew', ka: 'Georgian',
  id: 'Indonesian', te: 'Telugu', gu: 'Gujarati', kn: 'Kannada', ml: 'Malayalam',
  mr: 'Marathi', pa: 'Punjabi', or: 'Odia', ur: 'Urdu',
};

// Telugu is the only language this deployment actually synthesises, so it gets
// an explicit pin. The clone endpoint treats a mismatched accent as invalid,
// and "telangana" is the single accent the docs list for `te`.
const PREFERRED_ACCENTS = { te: 'telangana', hi: 'standard-hindi', en: 'general-american' };

// GenerationConfig bounds. Only `speed` and `volume` apply to sonic-3+ models;
// the previous code silently dropped them when the model was older.
const SPEED_RANGE = [0.6, 1.5];
const VOLUME_RANGE = [0.5, 2.0];

// Cartesia voice ids are UUIDs. Employee rows have historically carried locale
// codes ('te-IN') and catalog nicknames in this column; those are rejected
// upstream with a 400, so they are filtered out before the request is built.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clamp(value, [min, max]) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Split a BCP-47 tag into the pieces Cartesia validates separately.
 * Underscore aliases ('en_GB') are accepted by the docs, so both separators
 * are handled. Returns null for values that are not a language or locale at
 * all, so callers can leave the field out rather than send an invalid one.
 */
function normalizeLangTag(tag) {
  const raw = String(tag || '').trim().replace(/_/g, '-');
  if (!raw) return null;
  const parts = raw.split('-').filter(Boolean);
  const base = (parts[0] || '').toLowerCase();
  if (!SUPPORTED_LANGUAGES.has(base)) return null;
  if (parts.length === 1) return { language: base, locale: null };
  const region = parts[parts.length - 1].toUpperCase();
  const locale = `${base}-${region}`;
  return { language: base, locale };
}

/**
 * The docs allow either `language` or `locale` but reject a request that sets
 * both. sonic-3.6+ prefers `locale`; base codes stay on `language`.
 */
function applyLanguage(payload, tag) {
  const parsed = normalizeLangTag(tag);
  if (!parsed) return;
  if (parsed.locale) payload.locale = parsed.locale;
  else payload.language = parsed.language;
}

/**
 * Turn a documented error response into an AppError.
 *
 * Cartesia-Version >= 2026-03-01 returns JSON
 * ({error_code, title, message, request_id}); older or invalid versions return
 * plain text in "Title: Message" form. Both shapes are handled so a downgrade
 * in behaviour does not surface as a bare "Cartesia error 400: " with no cause.
 */
async function toAppError(res, fallbackMessage, code) {
  const raw = await res.text().catch(() => '');
  let status = res.status;
  let title = '';
  let message = raw;
  let errorCode = null;
  let requestId = null;

  try {
    const json = JSON.parse(raw);
    if (json && typeof json === 'object') {
      errorCode = json.error_code ?? null;
      title = json.title || '';
      message = json.message || '';
      requestId = json.request_id || null;
      if (typeof json.status_code === 'number') status = json.status_code;
      message = [title, message].filter(Boolean).join(': ') || message;
    }
  } catch {
    // Pre-2026-03-01 responses are "Title: Message" plain text.
  }

  const err = new AppError(
    `${fallbackMessage} (${status}): ${message || res.statusText}${errorCode ? ` [${errorCode}]` : ''}`,
    502,
    errorCode || code
  );
  err.status = status;
  err.providerCode = errorCode;
  err.requestId = requestId;
  return err;
}

class CartesiaTTSStream {
  /**
   * One long-lived WebSocket that serves many utterances.
   *
   * The docs allow several concurrent context_ids on a single connection, and
   * a context expires one second after its last audio output. Reusing the
   * socket therefore saves a TLS handshake plus HTTP upgrade per reply, while
   * every utterance still gets a fresh context_id so it never touches an
   * expired context.
   */
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.ws = null;
    this.connectPromise = null;
    this.current = null; // active { contextId, chunks[], resolve, reject, finished }
    this.closed = false;
  }

  async connect() {
    if (this.ws && this.ws.readyState === 1) return this.ws;
    if (this.connectPromise) return this.connectPromise;

    const WebSocket = require('ws');
    this.connectPromise = new Promise((resolve, reject) => {
      const ws = new WebSocket(`${WS_URL}?cartesia_version=${API_VERSION}`, {
        headers: { 'X-API-Key': this.apiKey },
      });

      const onOpenError = (err) => {
        this.connectPromise = null;
        reject(err);
      };

      ws.once('error', onOpenError);
      ws.once('open', () => {
        ws.off('error', onOpenError);
        this.ws = ws;
        this.closed = false;
        this.#wire(ws);
        resolve(ws);
      });
    });

    try {
      return await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  #wire(ws) {
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      // Every server frame carries the context_id it belongs to.
      const ctx = this.current;
      if (!ctx || (msg.context_id && msg.context_id !== ctx.contextId)) return;

      switch (msg.type) {
        case 'chunk':
          if (msg.data) {
            const audio = Buffer.from(msg.data, 'base64');
            if (audio.length) ctx.chunks.push({ audio, stepTime: msg.step_time, statusCode: msg.status_code });
          }
          break;
        case 'error':
          ctx.fail(
            new AppError(
              `Cartesia streaming error (${msg.status_code}): ${msg.title || ''} ${msg.message || ''}`.trim() +
                (msg.error_code ? ` [${msg.error_code}]` : '') +
                (msg.doc_url ? ` See ${msg.doc_url}` : ''),
              502,
              msg.error_code || 'CARTESIA_STREAM_ERROR'
            )
          );
          break;
        case 'done':
          // `done: true` arrives only after every output for the context has
          // been delivered, so this is the safe point to release the context.
          ctx.finish();
          break;
        case 'flush_done':
          ctx.flushed = true;
          break;
        case 'timestamps':
        case 'phoneme_timestamps':
          // Word/phoneme timing is not consumed by the media pipeline.
          break;
        default:
          break;
      }
    });

    ws.on('close', () => {
      this.ws = null;
      this.closed = true;
      // A context still awaiting audio will never receive it.
      if (this.current) {
        this.current.fail(new AppError('Cartesia WebSocket closed before the utterance completed', 502, 'CARTESIA_STREAM_CLOSED'));
        this.current = null;
      }
    });

    ws.on('error', (err) => {
      this.ws = null;
      if (this.current) {
        this.current.fail(new AppError(`Cartesia WebSocket error: ${err.message}`, 502, 'CARTESIA_STREAM_ERROR'));
        this.current = null;
      }
    });
  }

  #makeContext(contextId) {
    const ctx = {
      contextId,
      chunks: [],
      flushed: false,
      finished: false,
      error: null,
      wake: null,
      fail(err) {
        if (this.finished) return;
        this.error = err;
        this.finished = true;
        if (this.wake) this.wake();
      },
      finish() {
        if (this.finished) return;
        this.finished = true;
        if (this.wake) this.wake();
      },
    };
    ctx.promise = new Promise((resolve) => {
      ctx.wake = resolve;
    });
    return ctx;
  }

  /**
   * Synthesize one utterance, yielding audio chunks as Cartesia produces them.
   *
   * The client frame carries no `type` discriminator - the docs identify a
   * generation request structurally by its required fields (model_id,
   * transcript, voice, output_format, context_id). Sending a `type: 'tts'`
   * marker, as this provider used to, is not part of the documented protocol.
   */
  async *speak(text, opts = {}) {
    const transcript = String(text || '').trim();
    if (!transcript) return;

    const ws = await this.connect();
    const contextId = opts.contextId || `vc-${randomUUID()}`;
    const ctx = this.#makeContext(contextId);
    this.current = ctx;

    const request = {
      model_id: opts.modelId,
      transcript,
      voice: opts.voice,
      output_format: opts.outputFormat,
      context_id: contextId,
      continue: false,
    };
    applyLanguage(request, opts.language);
    if (opts.accent) request.accent = opts.accent;
    if (opts.normalization) request.normalization = opts.normalization;
    // GenerationConfig exists only on sonic-3 and newer models.
    if (opts.generationConfig && Object.keys(opts.generationConfig).length > 0) {
      request.generation_config = opts.generationConfig;
    }
    if (Number.isFinite(opts.maxBufferDelayMs)) {
      request.max_buffer_delay_ms = clamp(Math.round(opts.maxBufferDelayMs), [0, 5000]);
    }

    // Without this, a context that receives neither `done` nor `error` would
    // wait on ctx.promise forever, keeping `this.current` bound to it and
    // silently dropping that context's audio for the rest of the process.
    const budgetMs = Number.isFinite(opts.timeoutMs) ? clamp(opts.timeoutMs, [1000, 60000]) : 20000;
    const timer = setTimeout(() => {
      ctx.fail(new AppError(`Cartesia utterance ${contextId} produced no completion within ${budgetMs}ms`, 504, 'CARTESIA_UTTERANCE_TIMEOUT'));
    }, budgetMs);

    try {
      ws.send(JSON.stringify(request));

      let sent = 0;
      while (!ctx.finished || sent < ctx.chunks.length) {
        if (ctx.finished && ctx.error) throw ctx.error;
        if (sent >= ctx.chunks.length) {
          await ctx.promise;
          continue;
        }
        const chunk = ctx.chunks[sent++];
        yield chunk.audio;
      }
      if (ctx.error) throw ctx.error;
    } finally {
      clearTimeout(timer);
      if (this.current === ctx) this.current = null;
    }
  }

  /**
   * Abandon the utterance in flight.
   *
   * The documented cancel request is `{context_id, cancel: true}`. The docs
   * state it halts only requests that have not begun generating, so any audio
   * already in flight still arrives - callers stop consuming regardless.
   */
  cancel() {
    const ctx = this.current;
    if (!ctx) return false;
    try {
      this.ws?.send(JSON.stringify({ context_id: ctx.contextId, cancel: true }));
    } catch {
      // Socket is already gone; finish() below still releases the generator.
    }
    ctx.finish();
    return true;
  }

  close() {
    this.cancel();
    this.closed = true;
    try {
      this.ws?.close();
    } catch {
      /* already gone */
    }
    this.ws = null;
  }
}

// One shared socket for the whole process. CartesiaTTSStream keeps one socket
// alive and multiplexes utterances onto it, so a call never pays the upgrade
// cost per reply.
let sharedStream = null;

function getSharedStream() {
  if (!config.providers.cartesia.apiKey) {
    throw new AppError('Cartesia API key not configured in .env (CARTESIA_API_KEY)', 500, 'CARTESIA_NOT_CONFIGURED');
  }
  if (!sharedStream || sharedStream.apiKey !== config.providers.cartesia.apiKey) {
    sharedStream?.close();
    sharedStream = new CartesiaTTSStream(config.providers.cartesia.apiKey);
  }
  return sharedStream;
}

class CartesiaProvider {
  constructor() {
    this.voices = [];
    this._cachedVoices = null;
    this._lastVoicesFetch = 0;
  }

  /**
   * Normalise the voice / model / encoding options a caller passes into exactly
   * the fields the TTSRequest and RawOutputFormat schemas require. Anything the
   * docs constrain is enforced here so no invalid enum ever leaves the process.
   */
  #buildTTSOptions(opts = {}) {
    let voiceId = opts.voice;
    if (typeof voiceId === 'string' && voiceId.includes(':')) {
      voiceId = voiceId.split(':').pop();
    }
    if (!UUID_RE.test(String(voiceId || ''))) {
      voiceId = config.providers.cartesia.voiceId || this.voices[0].id;
    }

    const modelId = MODEL_IDS.has(opts.modelId)
      ? opts.modelId
      : (MODEL_IDS.has(config.providers.cartesia.model) ? config.providers.cartesia.model : 'sonic-3.6');

    const container = opts.container === 'wav' ? 'wav' : 'raw';
    const isMulaw = opts.mulaw === true;
    const encoding = RAW_ENCODINGS.has(opts.encoding) ? opts.encoding : (isMulaw ? 'pcm_mulaw' : 'pcm_s16le');
    let sampleRate = Number(opts.sampleRate);
    if (!SAMPLE_RATES.has(sampleRate)) sampleRate = isMulaw ? 8000 : (container === 'wav' ? 44100 : 24000);

    // OutputFormat requires container, encoding and sample_rate together.
    const outputFormat = { container, encoding, sample_rate: sampleRate };

    // GenerationConfig exists only on sonic-3 and newer. The model id is a
    // dated snapshot on some deployments, so match on the major version.
    const generationConfig = {};
    const speed = Number(opts.speed);
    if (Number.isFinite(speed) && speed > 0 && /^(sonic-3|sonic-3\.5|sonic-3\.6|sonic-latest)/.test(modelId)) {
      generationConfig.speed = clamp(speed, SPEED_RANGE);
    } else if (/^(sonic-3|sonic-3\.5|sonic-3\.6|sonic-latest)/.test(modelId)) {
      generationConfig.speed = 0.96; // Real human conversational phone pacing
    }
    const volume = Number(opts.volume);
    if (Number.isFinite(volume) && volume > 0 && /^(sonic-3|sonic-3\.5|sonic-3\.6|sonic-latest)/.test(modelId)) {
      generationConfig.volume = clamp(volume, VOLUME_RANGE);
    }
    if (/^(sonic-3|sonic-3\.5|sonic-3\.6|sonic-latest)/.test(modelId)) {
      generationConfig.emotion = opts.emotion || 'content'; // Warm, smiling human inflection
    }

    return { voiceId, modelId, outputFormat, generationConfig, sampleRate, isMulaw };
  }

  async #rest(path, { method = 'GET', body, form } = {}) {
    const apiKey = config.providers.cartesia.apiKey;
    if (!apiKey) {
      throw new AppError('Cartesia API key not configured in .env (CARTESIA_API_KEY)', 500, 'CARTESIA_NOT_CONFIGURED');
    }
    // REST auth is a bearer token. X-API-Key is documented only for the
    // WebSocket handshake.
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Cartesia-Version': API_VERSION,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: form || (body ? JSON.stringify(body) : undefined),
    });
    return res;
  }

  /**
   * Mint short-lived access token for browser / mobile clients per Cartesia API docs.
   * Endpoint: POST https://api.cartesia.ai/access-token
   * Header: Authorization: Bearer <api_key>, Cartesia-Version: 2026-08-14
   * Payload: { grants: { tts: true, stt: true }, expires_in: seconds }
   */
  async createAccessToken({ grants = { tts: true }, expiresIn = 300 } = {}) {
    const res = await this.#rest('/access-token', {
      method: 'POST',
      body: {
        grants,
        expires_in: Math.min(3600, Math.max(10, Number(expiresIn) || 300)),
      },
    });
    if (!res.ok) {
      throw await toAppError(res, 'Failed to mint Cartesia access token', 'CARTESIA_AUTH_ERROR');
    }
    const data = await res.json();
    return {
      token: data.token,
      expires_in: data.expires_in || expiresIn,
      expires_at: Date.now() + (data.expires_in || expiresIn) * 1000,
    };
  }

  /**
   * Whole-utterance synthesis over POST /tts/bytes.
   *
   * Returns G.711 mu-law by default because the telephony media stream wants
   * exactly that; Cartesia emits it natively via output_format.encoding, so
   * there is no conversion step.
   */
  async synthesize(text, opts = {}) {
    const transcript = String(text || '').trim();
    if (!transcript) throw new AppError('Text is required for voice synthesis', 400, 'EMPTY_TEXT');

    const { voiceId, modelId, outputFormat, generationConfig, sampleRate } = this.#buildTTSOptions(opts);

    const payload = {
      model_id: modelId,
      transcript,
      voice: voiceId,
      output_format: outputFormat,
    };
    applyLanguage(payload, opts.language);
    if (opts.accent) payload.accent = opts.accent;
    if (Object.keys(generationConfig).length > 0) payload.generation_config = generationConfig;

    const res = await this.#rest('/tts/bytes', { method: 'POST', body: payload });

    if (!res.ok) {
      // A deleted or unavailable voice id fails the whole request. Retry once on
      // the configured default so the employee stays audible until someone
      // picks a replacement.
      const err = await toAppError(res, 'Cartesia TTS failed', 'CARTESIA_ERROR');
      const defaultVoice = config.providers.cartesia.voiceId || this.voices[0].id;
      const voiceUnavailable = err.status === 404 || /voice_not_found/i.test(err.providerCode || '');
      if (voiceUnavailable && voiceId !== defaultVoice) {
        console.warn(`[cartesia] voice ${voiceId} is unavailable; retrying with the default voice.`);
        return this.synthesize(text, { ...opts, voice: defaultVoice });
      }
      throw err;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const isWav = outputFormat.container === 'wav';
    const isMulaw = outputFormat.encoding === 'pcm_mulaw';
    const contentType = isWav ? 'audio/wav' : (isMulaw ? 'audio/x-mulaw;rate=8000' : 'audio/L16');
    return {
      audioUrl: `data:${contentType};base64,${buffer.toString('base64')}`,
      contentType,
      bytes: buffer.length,
      buffer,
      sampleRate,
    };
  }

  /**
   * Stream an utterance over the documented Cartesia TTS WebSocket.
   * Yields raw mu-law (G.711 8 kHz) Buffers as they arrive, so the first audio
   * hits the carrier in roughly a quarter of a second instead of after the
   * whole sentence has been generated.
   */
  async *streamSynthesize(text, opts = {}) {
    const transcript = String(text || '').trim();
    if (!transcript) throw new AppError('Text is required for voice synthesis', 400, 'EMPTY_TEXT');

    // Telephony always wants 8 kHz mu-law on the wire.
    const { voiceId, modelId, outputFormat, generationConfig } = this.#buildTTSOptions({
      ...opts,
      encoding: 'pcm_mulaw',
      sampleRate: 8000,
      mulaw: true,
    });

    const stream = getSharedStream();
    yield* stream.speak(transcript, {
      modelId,
      voice: voiceId,
      outputFormat,
      generationConfig,
      language: opts.language,
      accent: opts.accent,
      contextId: `vc-${randomUUID()}`,
      // Every utterance is sent as a finished sentence with continue: false, so
      // the API must not also wait on its own buffer timer. Leaving this unset
      // applied the documented 3000 ms default, which added three seconds of
      // dead air to every single reply on top of the LLM round trip. The
      // buffering guide prescribes 0 for exactly this client-buffering pattern.
      maxBufferDelayMs: 0,
    });
  }

  /**
   * Drop the utterance currently being generated. Used on barge-in so Cartesia
   * stops working on audio nobody will hear.
   */
  cancelActiveStream() {
    if (!sharedStream) return false;
    return sharedStream.cancel();
  }

  /**
   * Instant Voice Clone over POST /voices/clone (multipart/form-data).
   *
   * Required form fields are `clip`, `name` and `language`; `accent` must be
   * valid for the submitted language or the request is rejected.
   */
  async cloneVoice({ audioBuffer, name, language = 'te', description = '', fileName = 'clip.wav', contentType = 'audio/wav', tagline = '', accent }) {
    const lang = String(language || '').toLowerCase().split(/[-_]/)[0];
    if (!SUPPORTED_LANGUAGES.has(lang)) {
      throw new AppError(
        `Cartesia does not support language "${language}" for voice cloning. Supported: ${[...SUPPORTED_LANGUAGES].join(', ')}.`,
        400,
        'UNSUPPORTED_LANGUAGE'
      );
    }

    const ext = String(fileName).toLowerCase().split('.').pop();
    if (!CLONE_FORMATS.has(ext)) {
      throw new AppError(
        `Unsupported audio format ".${ext}" for voice cloning. Allowed: ${[...CLONE_FORMATS].join(', ')}.`,
        400,
        'UNSUPPORTED_AUDIO_FORMAT'
      );
    }
    if (audioBuffer.length > CLONE_MAX_BYTES) {
      throw new AppError(
        `Voice clone sample is ${(audioBuffer.length / 1024 / 1024).toFixed(1)} MB; Cartesia accepts at most ${CLONE_MAX_BYTES / 1024 / 1024} MB.`,
        400,
        'FILE_TOO_LARGE'
      );
    }

    const formData = new FormData();
    formData.append('clip', new Blob([audioBuffer], { type: contentType || 'application/octet-stream' }), `clip.${ext}`);
    formData.append('name', name);
    formData.append('language', lang);
    if (tagline) formData.append('tagline', String(tagline).slice(0, 32));
    // A voice is built in the language it was recorded in, so pin the accent
    // rather than letting the API pick a default that drifts from the speaker.
    const resolvedAccent = accent || PREFERRED_ACCENTS[lang];
    if (resolvedAccent) {
      if (!ACCENTS_BY_LANGUAGE[lang]?.includes(resolvedAccent)) {
        throw new AppError(
          `Accent "${resolvedAccent}" is not valid for language "${lang}". Valid: ${(ACCENTS_BY_LANGUAGE[lang] || []).join(', ') || 'none'}.`,
          400,
          'INVALID_ACCENT'
        );
      }
      formData.append('accent', resolvedAccent);
    }
    if (description) formData.append('description', String(description).slice(0, 1000));

    const res = await this.#rest('/voices/clone', { method: 'POST', form: formData });
    if (!res.ok) {
      throw await toAppError(res, 'Cartesia voice clone failed', 'CARTESIA_CLONE_ERROR');
    }

    // VoiceMetadata: id, access, visibility, name, tagline, description,
    // created_at, language, user_id.
    const data = await res.json();
    if (!data?.id) {
      throw new AppError('Cartesia accepted the clone but returned no voice id.', 502, 'CARTESIA_CLONE_NO_ID');
    }
    return data;
  }

  /**
   * List voices over GET /voices.
   *
   * The documented envelope is `{data, has_more, next_page}` - not a bare
   * array. The previous implementation tested Array.isArray(), never matched,
   * and therefore silently served its hardcoded catalogue forever.
   */
  async getVoices({ language = null, limit = 100, isOwner = false, q = null, expandPreview = true } = {}) {
    if (this._cachedVoices && (Date.now() - this._lastVoicesFetch < 5 * 60 * 1000)) {
      return this._cachedVoices;
    }

    try {
      const apiKey = config.providers.cartesia.apiKey;
      if (!apiKey) return this.voices;

      // Cartesia API endpoint: 'Cartesia-Version': '2024-06-10' returns the complete voice library (1000+ voices)
      const res = await fetch(`${API_BASE}/voices`, {
        headers: {
          'X-API-Key': apiKey,
          'Authorization': `Bearer ${apiKey}`,
          'Cartesia-Version': '2024-06-10',
        },
      });

      if (!res.ok) throw await toAppError(res, 'Cartesia list voices failed', 'CARTESIA_ERROR');

      const data = await res.json();
      const rawVoices = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
      if (rawVoices.length === 0) return this.voices;

      const mapped = rawVoices.filter((v) => v && v.status !== 'archived').map((v) => {
        const langCode = String(v.language || 'en').toLowerCase().split('-')[0];
        const isCloned = v.is_pro === true || v.is_owner === true || v.mode === 'clone';
        return {
          id: v.id,
          name: v.name,
          tagline: v.tagline || '',
          language: v.language || (['te', 'hi', 'ta', 'kn', 'ml', 'mr', 'bn', 'gu', 'pa'].includes(langCode) ? `${langCode}-IN` : langCode),
          language_code: langCode,
          language_name: LANGUAGE_NAMES[langCode] || langCode.toUpperCase(),
          gender: v.gender === 'feminine' ? 'female' : (v.gender === 'masculine' ? 'male' : 'neutral'),
          description: v.description || '',
          provider: 'cartesia',
          tier: isCloned ? 'cloned' : 'premium',
          rate: isCloned ? 10.0 : 6.8,
          badge: langCode === 'te' ? 'Pure Telugu' : (['hi', 'ta', 'kn', 'ml', 'mr', 'bn', 'gu', 'pa'].includes(langCode) ? 'Indian Voice' : (isCloned ? 'Cloned' : 'Sonic 3.6')),
          is_cloned: isCloned,
          is_pro: v.is_pro === true,
          status: v.status || 'active',
          preview_file_url: v.preview_file_url || null,
        };
      });

      const combined = [
        ...this.voices,
        ...mapped.filter((m) => !this.voices.some((v) => v.id === m.id)),
      ];

      // Pure Telugu first, then Indian languages, then alphabetical
      const indianLangs = new Set(['te', 'hi', 'ta', 'kn', 'ml', 'mr', 'bn', 'gu', 'pa']);
      combined.sort((a, b) => {
        if (a.language_code === 'te' && b.language_code !== 'te') return -1;
        if (b.language_code === 'te' && a.language_code !== 'te') return 1;
        const aInd = indianLangs.has(a.language_code);
        const bInd = indianLangs.has(b.language_code);
        if (aInd && !bInd) return -1;
        if (bInd && !aInd) return 1;
        if (a.language_code !== b.language_code) return a.language_code.localeCompare(b.language_code);
        return a.name.localeCompare(b.name);
      });

      this._cachedVoices = combined;
      this._lastVoicesFetch = Date.now();
      return combined;
    } catch (err) {
      console.warn('[cartesia] Failed to fetch live voices:', err.message);
      return this.voices;
    }
  }

  async ping() {
    const t0 = Date.now();
    if (!config.providers.cartesia.apiKey) {
      return { status: 'not_configured', latencyMs: 0, message: 'No API key set' };
    }
    try {
      const res = await this.#rest('/voices?limit=1');
      const latencyMs = Date.now() - t0;
      if (!res.ok) {
        const err = await toAppError(res, 'Cartesia ping failed', 'CARTESIA_ERROR');
        return { status: 'error', latencyMs, message: err.message };
      }
      const body = await res.json().catch(() => null);
      const count = Array.isArray(body?.data) ? body.data.length : 0;
      return {
        status: 'connected',
        latencyMs,
        model: config.providers.cartesia.model || 'sonic-3.6',
        apiVersion: API_VERSION,
        // has_more tells us the catalogue is paginated; the exact total is not
        // returned by this endpoint.
        hasMore: body?.has_more === true,
        voiceCount: count,
        defaultVoiceId: config.providers.cartesia.voiceId || this.voices[0].id,
      };
    } catch (err) {
      return { status: 'error', latencyMs: Date.now() - t0, message: err.message };
    }
  }
}

module.exports = {
  CartesiaProvider,
  CartesiaTTSStream,
  SUPPORTED_LANGUAGES,
  ACCENTS_BY_LANGUAGE,
  LANGUAGE_NAMES,
  API_VERSION,
  isCartesiaVoiceId,
};
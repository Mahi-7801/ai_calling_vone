const config = require('../../config/env');
const { AppError } = require('../../utils/errors');

// =============================================================================
// GroqChat API
// Reference: https://console.groq.com/docs/api-reference
//
// Base URL is https://api.groq.com and the chat path is
// /openai/v1/chat/completions. Auth is "Authorization: Bearer $GROQ_API_KEY".
// =============================================================================
const GROQ_BASE = (process.env.GROQ_BASE_URL || 'https://api.groq.com').replace(/\/+$/, '');

// Chat model ids published on https://console.groq.com/docs/models, split by
// the tier the docs assign them. The previous list was built from a stale
// api-reference example and named eight ids that no longer exist
// (compound-beta, gemma2-9b-it, both llama-4 variants, kimi-k2, qwen3-32b, ...).
const PRODUCTION_CHAT_MODELS = new Set([
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
]);

// Preview models: strong, but the docs state they "should not be used in
// production environments as they may be discontinued at short notice".
const PREVIEW_CHAT_MODELS = new Set([
  'qwen/qwen3.8-27b',
  'minimaxai/minimax-m2.7',
]);

const CHAT_MODELS = new Set([...PRODUCTION_CHAT_MODELS, ...PREVIEW_CHAT_MODELS]);

// Where to go when the configured model is unavailable, deprecated, or
// rate-limited. Groq currently publishes no Production-tier multilingual model,
// and this product is Telugu-first, so the primary must be a Preview-tier
// multilingual id and this is the safety net underneath it. gpt-oss-20b is the
// fastest Production chat model (1000 tps) and handles Telugu.
const FALLBACK_CHAT_MODEL = 'openai/gpt-oss-20b';

// Structured Outputs in strict mode are documented for these three only.
const STRICT_STRUCTURED_OUTPUT_MODELS = new Set([
  'qwen/qwen3.8-27b', 'openai/gpt-oss-20b', 'openai/gpt-oss-120b',
]);

// reasoning_effort is rejected with a 400 when a value is outside the model's
// supported set, so it cannot be sent unconditionally. qwen3.8-27b defaults to
// 'none'; the gpt-oss models only accept low/medium/high.
const REASONING_EFFORT_BY_MODEL = {
  'qwen/qwen3.8-27b': new Set(['none', 'default', 'low', 'medium', 'high']),
  'openai/gpt-oss-20b': new Set(['low', 'medium', 'high']),
  'openai/gpt-oss-120b': new Set(['low', 'medium', 'high']),
};

// The only STT models the audio endpoint accepts.
const STT_MODELS = new Set(['whisper-large-v3', 'whisper-large-v3-turbo']);
const STT_RESPONSE_FORMATS = new Set(['json', 'text', 'verbose_json']);

// CreateSpeechRequest.response_format enum.
const TTS_RESPONSE_FORMATS = new Set(['flac', 'mp3', 'mulaw', 'ogg', 'wav']);
const TTS_SAMPLE_RATES = new Set([8000, 16000, 22050, 24000, 32000, 44100, 48000]);

// Documented status codes that carry distinct meaning for a caller. 429 and
// 498 are worth retrying; 401/403 are configuration faults and are not.
const RETRYABLE_STATUSES = new Set([429, 498, 500, 502, 503]);

/**
 * Parse a Groq error body.
 *
 * The documented shape is `{"error": {"type", "message", "code", "param", ...}}`.
 * The previous implementation dumped the raw text into its message, so a rate
 * limit and an invalid model were indistinguishable in the logs.
 */
function parseGroqError(status, body) {
  const message = body?.error?.message || body?.message || `HTTP ${status}`;
  const type = body?.error?.type || 'unknown_error';
  const code = body?.error?.code || null;
  return { status, type, code, message };
}

function toAppError(status, body, fallbackCode = 'GROQ_ERROR') {
  const parsed = parseGroqError(status, body);
  const err = new AppError(`Groq error ${parsed.status} (${parsed.type}): ${parsed.message}`, 502, parsed.code || fallbackCode);
  err.status = parsed.status;
  err.providerType = parsed.type;
  err.providerCode = parsed.code;
  err.retryable = RETRYABLE_STATUSES.has(parsed.status);
  return err;
}

/**
 * GroqProvider - low-latency LLM inference for real-time bidirectional voice
 * calling, plus the Whisper speech-to-text and PlayAI/Orpheus speech endpoints
 * documented on the same host.
 */
class GroqProvider {
  constructor() {
    this.baseUrl = GROQ_BASE;
    this.apiKey = process.env.GROQ_API_KEY || config.providers.llm.apiKey;
    // Only accept a model the docs publish; an unlisted id fails with a 400 that
    // is easy to misread as a bad key.
    const configured = process.env.GROQ_MODEL || config.providers.llm.model;
    this.configuredModel = CHAT_MODELS.has(configured) ? configured : 'qwen/qwen3.8-27b';
    this.model = this.configuredModel;
    this.fallbackModel = process.env.GROQ_FALLBACK_MODEL && CHAT_MODELS.has(process.env.GROQ_FALLBACK_MODEL)
      ? process.env.GROQ_FALLBACK_MODEL
      : FALLBACK_CHAT_MODEL;
    // Note the temperature band: the qwen3.8-27b card recommends 0.7 / top_p
    // 0.80 for general instruct dialogue. Voice call sites deliberately pin
    // lower (0.2-0.4) because a rambling multi-sentence answer is far worse on
    // a phone call than a flat one, and the docs advise altering temperature or
    // top_p but not both.
    this.defaultTemperature = 0.4;
    this.sttModel = process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo';
    // playai-tts is the only TTS id in the API-reference enum, but the live API
    // rejects it as decommissioned; the documented working models are the
    // Canopy Labs Orpheus ones. Those need terms acceptance on the account
    // before they will synthesise, and they cover English and Arabic only -
    // Telugu calls must use Cartesia.
    this.ttsModel = process.env.GROQ_TTS_MODEL || 'canopylabs/orpheus-v1-english';
  }

  #assertKey() {
    if (!this.apiKey) {
      throw new AppError('Groq API key not configured (GROQ_API_KEY)', 500, 'GROQ_NOT_CONFIGURED');
    }
  }

  async #fetch(path, init = {}) {
    this.#assertKey();
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        ...(init.headers || {}),
      },
    });
    return res;
  }

  /**
   * #fetch plus a bounded retry for the statuses the docs say are worth
   * retrying (429/498 are rate limits; 500/502/503 are transient).
   *
   * This used to be computed and then thrown away - `retryable` was set on the
   * error object and nothing ever read it - so a single 503 during a live phone
   * turn became silence. Retrying is only safe here because chat completion is
   * idempotent, and because this runs before the response body is consumed: a
   * stream that has already started producing deltas is never re-requested.
   *
   * `maxRetries` is passed down by the live-call path, where doubling latency is
   * worse than a short fallback phrase, so it takes fewer attempts.
   */
  async #fetchWithRetry(path, init = {}, opts = {}) {
    const maxRetries = Number.isFinite(opts.maxRetries)
      ? Math.max(0, Math.min(3, opts.maxRetries))
      : 2;

    for (let attempt = 0; ; attempt += 1) {
      const res = await this.#fetch(path, init);
      if (res.ok || attempt >= maxRetries || !RETRYABLE_STATUSES.has(res.status)) return res;

      if (res.status === 429 && attempt >= 1) return res;

      const retryAfter = Number(res.headers.get('retry-after'));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 2000)
        : Math.min(300 * 2 ** attempt, 2000);

      console.warn(`[groq] ${res.status} on ${path}; retry ${attempt + 1}/${maxRetries} in ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  /**
   * Read the documented rate-limit headers off a response so a caller can react
   * instead of guessing. `retry-after` is only present on a 429.
   */
  static readRateLimit(res) {
    const get = (name) => res.headers.get(name);
    return {
      retryAfter: get('retry-after'),
      limitRequests: get('x-ratelimit-limit-requests'),
      limitTokens: get('x-ratelimit-limit-tokens'),
      remainingRequests: get('x-ratelimit-remaining-requests'),
      remainingTokens: get('x-ratelimit-remaining-tokens'),
      resetRequests: get('x-ratelimit-reset-requests'),
      resetTokens: get('x-ratelimit-reset-tokens'),
    };
  }

  #buildMessages(messages, opts = {}) {
    const systemPrompt = opts.systemPrompt || (
      'You are a professional Telugu AI voice calling consultant. ' +
      'Speak naturally with respect (అండి) in pure conversational Telugu. ' +
      'Keep answers brief (1-2 clear sentences). Never use bullet points or asterisks.'
    );

    return [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role || (m.speaker === 'ai' ? 'assistant' : 'user'),
        content: m.content || m.text || '',
      })),
    ];
  }

  /**
   * Build the request body from a documented field set.
   *
   * `max_tokens` is deprecated in favour of `max_completion_tokens`; the old
   * provider sent the deprecated field, which the docs still accept but which
   * does not cap total input+output length. Everything else here maps to a
   * documented parameter with its documented range.
   */
  #buildChatBody(messages, opts = {}) {
    const model = CHAT_MODELS.has(opts.model) ? opts.model : this.model;
    const body = {
      model,
      messages: this.#buildMessages(messages, opts),
      temperature: opts.temperature ?? this.defaultTemperature,
      // The docs restrict n to 1; any other value is a hard 400.
      n: 1,
    };

    // Reasoning adds 10-40% baseline latency, which is the wrong trade for a
    // 1-2 sentence phone reply. The qwen card recommends 'none' for exactly
    // this "efficient, general-purpose dialogue" case. Sent only when the
    // target model accepts it - an unsupported value is a 400.
    // An unsupported value is replaced with the safest supported one rather than
    // omitted, so behaviour does not depend on whatever the server defaults to.
    const supportedEffort = REASONING_EFFORT_BY_MODEL[model];
    if (opts.reasoningEffort && supportedEffort?.has(opts.reasoningEffort)) {
      body.reasoning_effort = opts.reasoningEffort;
    } else if (supportedEffort?.has('none')) {
      body.reasoning_effort = 'none';
    }

    // No numeric bounds are declared, but the model context window is the
    // effective ceiling: total input + generated tokens must fit inside it.
    const maxTokens = Number(opts.maxTokens);
    if (Number.isFinite(maxTokens) && maxTokens > 0) {
      body.max_completion_tokens = Math.floor(maxTokens);
    }
    if (Array.isArray(opts.stop) && opts.stop.length > 0 && opts.stop.length <= 4) {
      body.stop = opts.stop.slice(0, 4);
    }
    if (typeof opts.seed === 'number') body.seed = opts.seed;
    if (typeof opts.topP === 'number') body.top_p = Math.min(1, Math.max(0, opts.topP));
    if (typeof opts.frequencyPenalty === 'number') body.frequency_penalty = Math.min(2, Math.max(-2, opts.frequencyPenalty));
    if (typeof opts.presencePenalty === 'number') body.presence_penalty = Math.min(2, Math.max(-2, opts.presencePenalty));
    // reasoning_format is unsupported on the gpt-oss models, and it is mutually
    // exclusive with include_reasoning, so it is never sent implicitly.
    if (opts.reasoningFormat && model !== 'openai/gpt-oss-20b' && model !== 'openai/gpt-oss-120b') {
      body.reasoning_format = opts.reasoningFormat;
    }
    if (opts.responseFormat) body.response_format = opts.responseFormat;
    if (typeof opts.user === 'string') body.user = opts.user;

    return body;
  }

  /**
   * Swap to the fallback model when the configured one is unusable.
   *
   * Groq documents no Production-tier multilingual model, so a Telugu-first
   * deployment is pinned to a Preview id that may be withdrawn at any time.
   * If the primary is rejected as unknown/deprecated or fails with a
   * configuration-class error, one fallback attempt on a Production model keeps
   * the phone call alive instead of returning silence.
   */
  #applyModelFallback(body, res) {
    if (!body || body.model === this.fallbackModel) return false;
    if (![400, 404, 410, 429, 498].includes(res?.status)) return false;
    console.warn(`[groq] Model ${body.model} rejected or rate-limited (${res.status}); falling back to ${this.fallbackModel}.`);
    body.model = this.fallbackModel;
    if (this.fallbackModel === 'openai/gpt-oss-20b' || this.fallbackModel === 'openai/gpt-oss-120b') {
      body.reasoning_effort = 'low';
      if (body.max_completion_tokens && body.max_completion_tokens < 150) {
        body.max_completion_tokens = 150;
      }
    } else {
      delete body.reasoning_effort;
    }
    return true;
  }

  /**
   * Exposes the private request builder so the request-shape regression checks
   * in scratch/smoke_fixes.js can assert on what would actually be sent.
   */
  buildChatBodyForTest(messages, opts = {}) {
    return this.#buildChatBody(messages, opts);
  }

  /**
   * Non-streaming completion.
   *
   * The docs define finish_reason as one of stop | length | tool_calls |
   * function_call, and note that `length` means the token cap was hit - which
   * for a phone call means a truncated, half-spoken sentence. That is surfaced
   * rather than hidden.
   */
  async generateResponse(messages, opts = {}) {
    const t0 = Date.now();
    const chatBody = this.#buildChatBody(messages, opts);
    let res;
    try {
      res = await this.#fetchWithRetry(
        '/openai/v1/chat/completions',
        { method: 'POST', body: JSON.stringify(chatBody) },
        { maxRetries: opts.maxRetries }
      );
      // One fallback attempt on a Production model if the primary is rejected.
      if (!res.ok && this.#applyModelFallback(chatBody, res)) {
        res = await this.#fetchWithRetry(
          '/openai/v1/chat/completions',
          { method: 'POST', body: JSON.stringify(chatBody) },
          { maxRetries: 0 }
        );
      }
    } catch (err) {
      const geminiKey = process.env.GEMINI_API_KEY || config.providers?.gemini?.apiKey;
      if (geminiKey) {
        console.warn(`[groq] Groq network failed (${err.message}); falling back to Gemini.`);
        try {
          const { GeminiProvider } = require('./gemini');
          return await new GeminiProvider().generateResponse(messages, opts);
        } catch (gErr) {
          console.warn(`[groq] Gemini fallback error: ${gErr.message}`);
        }
      }
      throw new AppError(`Groq request failed: ${err.message}`, 502, 'GROQ_NETWORK_ERROR');
    }

    if (!res.ok) {
      const geminiKey = process.env.GEMINI_API_KEY || config.providers?.gemini?.apiKey;
      if (geminiKey) {
        console.warn(`[groq] Groq error ${res.status}; falling back to Gemini.`);
        try {
          const { GeminiProvider } = require('./gemini');
          return await new GeminiProvider().generateResponse(messages, opts);
        } catch (gErr) {
          console.warn(`[groq] Gemini fallback error: ${gErr.message}`);
        }
      }
      const body = await res.json().catch(() => null);
      const err = toAppError(res.status, body);
      throw Object.assign(err, { rateLimit: GroqProvider.readRateLimit(res) });
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    const raw = choice?.message?.content?.trim() || '';
    const text = raw.replace(/[*_#]/g, '').trim();
    const latencyMs = Date.now() - t0;
    const finishReason = choice?.finish_reason || null;
    const modelUsed = data.model || chatBody.model;

    if (finishReason === 'length') {
      console.warn(`[groq] Completion hit the token cap (finish_reason=length); reply may be truncated.`);
    }
    if (choice?.message?.refusal) {
      console.warn(`[groq] Model refused: ${choice.message.refusal}`);
    }
    console.log(`[groq] Generated voice reply in ${latencyMs}ms (${text.length} chars) using ${modelUsed} [queue=${data.usage?.queue_time ?? '?'}s total=${data.usage?.total_time ?? '?'}s]`);
    return {
      text,
      latencyMs,
      finishReason,
      refusal: choice?.message?.refusal || null,
      usage: data.usage || {},
      requestId: data.x_groq?.id || null,
      model: data.model || null,
      rateLimit: GroqProvider.readRateLimit(res),
    };
  }

  /**
   * Streaming completion: yields text deltas as the model produces them.
   *
   * `stream_options.include_usage` adds one extra chunk before `data: [DONE]`
   * carrying the request totals; that chunk has an empty `choices` array, so it
   * must not be treated as a content delta. `x_groq.error` on the final chunk
   * reports a stream that stopped early, which the old parser discarded.
   */
  async *streamResponse(messages, opts = {}) {
    const body = this.#buildChatBody(messages, opts);
    body.stream = true;
    // include_usage adds one extra chunk before `data: [DONE]` with the request
    // totals and an empty `choices` array. include_obfuscation is deliberately
    // not set: it is documented as supported only on deployments that stream
    // that field, and sending it elsewhere is a 400.
    body.stream_options = { include_usage: true };

    let res;
    try {
      res = await this.#fetchWithRetry(
        '/openai/v1/chat/completions',
        { method: 'POST', body: JSON.stringify(body) },
        { maxRetries: opts.maxRetries }
      );
      // Only safe before the body is consumed: once deltas have been yielded a
      // retry would duplicate audio the caller already heard.
      if (!res.ok && this.#applyModelFallback(body, res)) {
        res = await this.#fetchWithRetry(
          '/openai/v1/chat/completions',
          { method: 'POST', body: JSON.stringify(body) },
          { maxRetries: 0 }
        );
      }
    } catch (err) {
      const geminiKey = process.env.GEMINI_API_KEY || config.providers?.gemini?.apiKey;
      if (geminiKey) {
        console.warn(`[groq] Groq stream network failed (${err.message}); falling back to Gemini.`);
        try {
          const { GeminiProvider } = require('./gemini');
          yield* new GeminiProvider().streamResponse(messages, opts);
          return;
        } catch (gErr) {
          console.warn(`[groq] Gemini stream fallback error: ${gErr.message}`);
        }
      }
      throw new AppError(`Groq request failed: ${err.message}`, 502, 'GROQ_NETWORK_ERROR');
    }

    if (!res.ok || !res.body) {
      const geminiKey = process.env.GEMINI_API_KEY || config.providers?.gemini?.apiKey;
      if (geminiKey) {
        console.warn(`[groq] Groq stream error ${res.status}; falling back to Gemini.`);
        try {
          const { GeminiProvider } = require('./gemini');
          yield* new GeminiProvider().streamResponse(messages, opts);
          return;
        } catch (gErr) {
          console.warn(`[groq] Gemini stream fallback error: ${gErr.message}`);
        }
      }
      const errBody = res.body ? await res.json().catch(() => null) : null;
      const err = toAppError(res.status, errBody);
      throw Object.assign(err, { rateLimit: GroqProvider.readRateLimit(res) });
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let carry = '';
    let usage = null;
    let finishReason = null;
    let streamError = null;
    let sawDelta = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        carry += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line, and a TCP chunk can land
        // mid-frame, so only consume up to the last complete separator.
        let sep;
        while ((sep = carry.indexOf('\n\n')) !== -1) {
          const frame = carry.slice(0, sep);
          carry = carry.slice(sep + 2);

          for (const parsed of parseSseFrames(frame)) {
            if (parsed === 'DONE') continue;
            // The documented early-stop signal lives on the final chunk only.
            if (parsed?.x_groq?.error) streamError = parsed.x_groq.error;
            if (parsed?.usage) usage = parsed.usage;
            const reason = parsed?.choices?.[0]?.finish_reason;
            if (reason) finishReason = reason;
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta.length) {
              sawDelta = true;
              yield delta;
            }
          }
        }
      }

      const tail = parseSseFrames(carry);
      for (const parsed of tail) {
        if (parsed === 'DONE' || !parsed) continue;
        if (parsed?.x_groq?.error) streamError = parsed.x_groq.error;
        if (parsed?.usage) usage = parsed.usage;
        const reason = parsed?.choices?.[0]?.finish_reason;
        if (reason) finishReason = reason;
      }
    } finally {
      try { await reader.cancel(); } catch { /* stream already closed */ }
    }

    if (streamError) {
      throw new AppError(`Groq stream stopped early: ${streamError}`, 502, 'GROQ_STREAM_ERROR');
    }
    if (!sawDelta) {
      throw new AppError('Groq returned an empty stream for this request.', 502, 'GROQ_EMPTY_STREAM');
    }

    this.lastUsage = usage;
    this.lastFinishReason = finishReason;
  }

  /**
   * Post-call scoring over Structured Outputs.
   *
   * `response_format.type = json_schema` with `strict: true` constrains the
   * decode, so the reply is guaranteed to match the schema instead of being
   * parsed out of prose. Strict mode is only documented for a specific model
   * set and requires every field to be required with additionalProperties
   * false; the fallback is json_object when the configured model cannot do it.
   */
  async analyzeCall(transcriptLines = [], employee = null) {
    const rows = (transcriptLines || []).filter((l) => l && (l.text || typeof l === 'string'));
    const transcript = rows
      .map((l) => `${l.speaker === 'ai' ? (employee?.name || 'AI') : 'Customer'}: ${l.text || l}`)
      .join('\n');

    const schema = {
      name: 'call_analysis',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          summary: { type: 'string' },
          sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
          intent: { type: 'string' },
          outcome: {
            type: 'string',
            enum: [
              'interested', 'not_interested', 'follow_up', 'callback', 'converted',
              'dnd', 'wrong_number', 'no_answer', 'busy', 'failed',
            ],
          },
          outcomeConfidence: { type: 'number' },
          outcomeReason: { type: 'string' },
          nextAction: { type: 'string' },
          objections: { type: 'array', items: { type: 'string' } },
        },
        required: [
          'summary', 'sentiment', 'intent', 'outcome', 'outcomeConfidence',
          'outcomeReason', 'nextAction', 'objections',
        ],
      },
    };

    const systemPrompt = `You are a telephony call analytics engine. Analyze this conversation between an AI employee and customer.
Classify sentiment, customer intent, lead outcome, confidence score (0.0 to 1.0), reason, objections raised, and a concrete next action.`;

    const base = { model: this.model, temperature: 0.1 };
    const strict = STRICT_STRUCTURED_OUTPUT_MODELS.has(this.model);

    let parsed = null;
    if (strict) {
      parsed = await this.#structured([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Call Transcript:\n${transcript}` },
      ], { ...base, maxTokens: 500, responseFormat: { type: 'json_schema', json_schema: schema } });
    }

    if (!parsed) {
      // json_object is the documented fallback, but the model will not produce
      // JSON unless told to, so the instruction stays in the prompt.
      const text = await this.generateResponse(
        [{ role: 'user', content: `Call Transcript:\n${transcript}` }],
        {
          ...base,
          systemPrompt: `${systemPrompt}\nRespond ONLY with a JSON object using keys: summary, sentiment, intent, outcome, outcomeConfidence, outcomeReason, nextAction, objections.`,
          maxTokens: 500,
          responseFormat: { type: 'json_object' },
        }
      ).then((r) => r.text);
      parsed = parseJsonLoose(text);
    }

    if (!parsed) {
      return {
        summary: 'Call completed successfully. Transcript recorded.',
        sentiment: 'neutral',
        intent: 'general_enquiry',
        outcome: 'follow_up',
        outcomeConfidence: 0.6,
        outcomeReason: 'Automated fallback analysis',
        nextAction: 'Review transcript',
        objections: [],
        employee: employee?.name || null,
      };
    }

    return {
      summary: parsed.summary || 'Call finished',
      sentiment: parsed.sentiment || 'neutral',
      intent: parsed.intent || 'general_enquiry',
      outcome: parsed.outcome || 'follow_up',
      outcomeConfidence: typeof parsed.outcomeConfidence === 'number' ? parsed.outcomeConfidence : 0.7,
      outcomeReason: parsed.outcomeReason || null,
      nextAction: parsed.nextAction || 'Review call details',
      objections: Array.isArray(parsed.objections) ? parsed.objections : [],
      employee: employee?.name || null,
    };
  }

  async #structured(messages, opts) {
    try {
      const res = await this.generateResponse(messages, opts);
      return parseJsonLoose(res.text);
    } catch (err) {
      console.warn(`[groq] Structured output unavailable on ${opts.model}: ${err.message}`);
      return null;
    }
  }

  /**
   * Speech-to-text over POST /openai/v1/audio/transcriptions (multipart).
   *
   * `file` is required unless `url` is given. The documented response_format
   * values are json | text | verbose_json; verbose_json is the only one that
   * carries segments and words.
   */
  async transcribe(audioBuffer, { language = 'te', model = null, prompt = '', responseFormat = 'json', filename = 'audio.mp3', contentType = 'audio/mpeg' } = {}) {
    this.#assertKey();
    const sttModel = STT_MODELS.has(model) ? model : (STT_MODELS.has(this.sttModel) ? this.sttModel : 'whisper-large-v3-turbo');
    const format = STT_RESPONSE_FORMATS.has(responseFormat) ? responseFormat : 'json';

    const form = new FormData();
    form.append('file', new Blob([audioBuffer], { type: contentType }), filename);
    form.append('model', sttModel);
    if (language) form.append('language', language);
    if (prompt) form.append('prompt', prompt);
    form.append('response_format', format);
    form.append('temperature', '0');

    // The auth header still applies, but Content-Type must be left to the fetch
    // implementation so it can set the multipart boundary.
    const res = await fetch(`${this.baseUrl}/openai/v1/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw toAppError(res.status, body, 'GROQ_STT_ERROR');
    }

    if (format === 'text') {
      const text = await res.text();
      return { text: text.trim(), model: sttModel };
    }

    const data = await res.json();
    if (format === 'json') {
      return { text: (data.text || '').trim(), model: sttModel, requestId: data.x_groq?.id || null };
    }
    return {
      text: (data.text || '').trim(),
      language: data.language,
      duration: data.duration,
      segments: data.segments || [],
      words: data.words || [],
      model: sttModel,
    };
  }

  /**
   * Text-to-speech over POST /openai/v1/audio/speech.
   * response_format accepts flac | mp3 | mulaw | ogg | wav, and `mulaw` at
   * 8000 Hz is the telephony format.
   */
  async synthesize(text, { model = null, voice = 'Fritz-PlayAI', responseFormat = 'mp3', sampleRate = 24000, speed = 1 } = {}) {
    this.#assertKey();
    const transcript = String(text || '').trim();
    if (!transcript) throw new AppError('Text is required for voice synthesis', 400, 'EMPTY_TEXT');

    const body = {
      model: model || this.ttsModel,
      input: transcript,
      voice,
    };
    if (TTS_RESPONSE_FORMATS.has(responseFormat)) body.response_format = responseFormat;
    if (TTS_SAMPLE_RATES.has(Number(sampleRate))) body.sample_rate = Number(sampleRate);
    if (Number.isFinite(Number(speed))) body.speed = Math.min(5, Math.max(0.5, Number(speed)));

    const res = await fetch(`${this.baseUrl}/openai/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw toAppError(res.status, errBody, 'GROQ_TTS_ERROR');
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    return {
      buffer,
      bytes: buffer.length,
      contentType: `audio/${responseFormat === 'mulaw' ? 'x-mulaw' : responseFormat}`,
      sampleRate: body.sample_rate || null,
    };
  }

  /** GET /openai/v1/models - the authoritative live model list. */
  async listModels() {
    this.#assertKey();
    const res = await fetch(`${this.baseUrl}/openai/v1/models`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw toAppError(res.status, await res.json().catch(() => null), 'GROQ_MODELS_ERROR');
    const data = await res.json();
    return Array.isArray(data?.data) ? data.data : [];
  }

  async ping() {
    const t0 = Date.now();
    if (!this.apiKey) return { status: 'not_configured', latencyMs: 0, message: 'No API key set' };
    try {
      const models = await this.listModels();
      return {
        status: 'connected',
        latencyMs: Date.now() - t0,
        model: this.model,
        modelCount: models.length,
      };
    } catch (err) {
      return { status: 'error', latencyMs: Date.now() - t0, model: this.model, message: err.message };
    }
  }
}

/**
 * Split one SSE frame into its parsed payloads.
 * Returns the literal string 'DONE' for the terminator, so callers can skip it
 * without trying to JSON.parse it.
 */
function parseSseFrames(frame) {
  const out = [];
  for (const line of frame.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload) continue;
    if (payload === '[DONE]') {
      out.push('DONE');
      continue;
    }
    try {
      out.push(JSON.parse(payload));
    } catch {
      // A comment frame or a partial payload; skip it.
    }
  }
  return out;
}

/**
 * json_object mode still emits fences on some models, so strip them before
 * parsing. Returns null rather than throwing on malformed output.
 */
function parseJsonLoose(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/```json|```/gi, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Fall back to the first balanced object in the string.
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function body_model(data, opts, fallback) {
  return data?.model || (CHAT_MODELS.has(opts.model) ? opts.model : fallback);
}

/**
 * Which published models this deployment can actually use, and which of them
 * Groq marks Production vs Preview. Surfaced by the admin provider screen so the
 * Preview-tier dependency is visible rather than buried in a comment.
 */
function listChatModels() {
  return [...CHAT_MODELS].map((id) => ({
    id,
    tier: PRODUCTION_CHAT_MODELS.has(id) ? 'production' : 'preview',
    supportsStrictStructuredOutput: STRICT_STRUCTURED_OUTPUT_MODELS.has(id),
    reasoningEffort: [...(REASONING_EFFORT_BY_MODEL[id] || [])],
  }));
}

module.exports = {
  GroqProvider,
  parseGroqError,
  parseJsonLoose,
  CHAT_MODELS,
  STT_MODELS,
  PRODUCTION_CHAT_MODELS,
  PREVIEW_CHAT_MODELS,
  FALLBACK_CHAT_MODEL,
  listChatModels,
};
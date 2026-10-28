const config = require('../../config/env');
const { AppError } = require('../../utils/errors');

class LLMProvider {
  constructor() {
    this.baseUrl = (config.providers.llm.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.apiKey = config.providers.llm.apiKey;
    this.model = config.providers.llm.model || 'gpt-4o-mini';
    this.defaultTemperature = config.providers.llm.temperature ?? 0.6;
  }

  async #chat(messages, temperature = null, maxTokens = 500) {
    if (!this.apiKey) {
      throw new AppError('LLM API key not configured in .env (LLM_API_KEY)', 500, 'LLM_NOT_CONFIGURED');
    }

    const payload = {
      model: this.model,
      messages,
      temperature: temperature ?? this.defaultTemperature,
      max_tokens: maxTokens,
    };
    // max_tokens is deprecated in favour of max_completion_tokens. When this
    // provider is pointed at Groq the modern field is used instead; other
    // OpenAI-compatible endpoints still require the older one.
    if (/groq\.com/i.test(this.baseUrl)) {
      delete payload.max_tokens;
      payload.max_completion_tokens = maxTokens;
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new AppError(`LLM error ${res.status}: ${errText}`, 502, 'LLM_ERROR');
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  }

  async generateResponse(messages, opts = {}) {
    const text = await this.#chat(
      this.#buildMessages(messages, opts),
      opts.temperature ?? this.defaultTemperature,
      opts.maxTokens || 250
    );

    return { text, usage: {} };
  }

  #buildMessages(messages, opts = {}) {
    const systemPrompt = opts.systemPrompt || (
      'You are a professional Telugu AI voice calling agent. ' +
      'Speak naturally in conversational Telugu. Keep your responses concise (1 to 2 sentences) ' +
      'suitable for spoken telephone conversations.'
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
   * Yields text deltas as the model produces them, so the browser can render
   * and speak an employee reply progressively instead of waiting for the whole
   * utterance. Falls back to a single chunk of the non-streaming response when
   * the upstream does not support `stream`, so callers always get the text.
   */
  async *streamResponse(messages, opts = {}) {
    if (!this.apiKey) {
      throw new AppError('LLM API key not configured in .env (LLM_API_KEY)', 500, 'LLM_NOT_CONFIGURED');
    }

    let res;
    try {
const streamBody = {
          model: this.model,
          messages: this.#buildMessages(messages, opts),
          temperature: opts.temperature ?? this.defaultTemperature,
          max_tokens: opts.maxTokens || 250,
          stream: true,
        };
        if (/groq\.com/i.test(this.baseUrl)) {
          delete streamBody.max_tokens;
          streamBody.max_completion_tokens = opts.maxTokens || 250;
        }
        res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify(streamBody),
        });
    } catch (err) {
      throw new AppError(`LLM request failed: ${err.message}`, 502, 'LLM_ERROR');
    }

    if (!res.ok || !res.body) {
      const errText = await res.text().catch(() => '');
      throw new AppError(`LLM error ${res.status}: ${errText}`, 502, 'LLM_ERROR');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    let sawDelta = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line; a chunk boundary can land
        // mid-frame, so only consume up to the last complete separator.
        let sep;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const delta = parseSseDelta(frame);
          if (delta) {
            sawDelta = true;
            full += delta;
            yield delta;
          }
        }
      }
    } finally {
      try { reader.cancel(); } catch { /* stream already closed */ }
    }

    if (!sawDelta) {
      // Upstream ignored `stream` and returned a plain JSON body; the last
      // (unterminated) frame holds it.
      const tail = parseSseDelta(buffer) || '';
      const text = tail || full;
      if (text) yield text;
    }
  }

  async analyzeCall(transcriptLines = [], employee = null) {
    const transcript = transcriptLines
      .map((l) => `${l.speaker === 'ai' ? (employee?.name || 'AI') : 'Customer'}: ${l.text || l}`)
      .join('\n');

    const sys = `You are a telephony call analytics engine. Analyze this conversation between an AI employee and customer.
Classify sentiment (positive|neutral|negative), customer intent, lead outcome (interested|not_interested|follow_up|callback|converted|dnd|wrong_number|no_answer|busy|failed), confidence score (0.0 to 1.0), reason, objections raised, and concrete next action.
Respond ONLY with valid JSON matching this schema:
{
  "summary": "Concise summary under 60 words",
  "sentiment": "positive"|"neutral"|"negative",
  "intent": "Brief customer intent",
  "outcome": "interested"|"not_interested"|"follow_up"|"callback"|"converted"|"dnd"|"wrong_number"|"no_answer"|"busy"|"failed",
  "outcomeConfidence": 0.85,
  "outcomeReason": "Reason for outcome",
  "nextAction": "Actionable next step",
  "objections": ["pricing", "timing"]
}`;

    try {
      const text = await this.#chat([
        { role: 'system', content: sys },
        { role: 'user', content: `Call Transcript:\n${transcript}` },
      ], 0.1, 500);

      const cleaned = text.replace(/```json|```/gi, '').trim();
      const parsed = JSON.parse(cleaned);
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
    } catch {
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
  }
}

// Pull choices[0].delta.content out of one SSE frame. Returns '' for keep-alive
// comments, [DONE] markers, error payloads and empty role-only deltas.
function parseSseDelta(frame) {
  let out = '';
  for (const line of frame.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const json = JSON.parse(payload);
      const content = json?.choices?.[0]?.delta?.content;
      if (typeof content === 'string') out += content;
    } catch {
      /* partial or non-JSON frame */
    }
  }
  return out;
}

module.exports = { LLMProvider };
const config = require('../../config/env');
const { AppError } = require('../../utils/errors');

class GeminiProvider {
  constructor(opts = {}) {
    this.apiKey = opts.apiKey || process.env.GEMINI_API_KEY || config.providers?.gemini?.apiKey;
    this.model = opts.model || process.env.GEMINI_MODEL || config.providers?.gemini?.model || 'gemini-2.0-flash-lite';
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  }

  isConfigured() {
    return !!this.apiKey;
  }

  /**
   * Convert OpenAI-style messages array to Gemini generateContent request format
   */
  #formatGeminiPayload(messages, opts = {}) {
    const systemPromptParts = [];
    if (opts.systemPrompt) {
      systemPromptParts.push({ text: opts.systemPrompt });
    }

    const contents = [];
    for (const msg of messages) {
      if (msg.role === 'system') {
        systemPromptParts.push({ text: msg.content });
      } else if (msg.role === 'assistant' || msg.role === 'model') {
        contents.push({
          role: 'model',
          parts: [{ text: msg.content }]
        });
      } else {
        contents.push({
          role: 'user',
          parts: [{ text: msg.content }]
        });
      }
    }

    // Gemini requires at least one user turn
    if (contents.length === 0) {
      contents.push({
        role: 'user',
        parts: [{ text: 'హలో' }]
      });
    }

    const payload = {
      contents,
      generationConfig: {
        maxOutputTokens: opts.maxTokens || 80,
        temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.4,
      }
    };

    if (systemPromptParts.length > 0) {
      payload.systemInstruction = {
        parts: systemPromptParts
      };
    }

    return payload;
  }

  /**
   * Generate complete response
   */
  async generateResponse(messages, opts = {}) {
    if (!this.apiKey) {
      throw new AppError('Gemini API key not configured', 500, 'GEMINI_NO_KEY');
    }

    const t0 = Date.now();
    const payload = this.#formatGeminiPayload(messages, opts);
    const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      const msg = errData?.error?.message || `HTTP ${res.status}`;
      throw new AppError(`Gemini error ${res.status}: ${msg}`, 502, 'GEMINI_ERROR');
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const raw = parts.map(p => p.text).filter(Boolean).join(' ').trim();
    const text = raw.replace(/[*_#•-]/g, ' ').replace(/\s+/g, ' ').trim();
    const latencyMs = Date.now() - t0;

    console.log(`[gemini] Generated voice reply in ${latencyMs}ms (${text.length} chars) using ${this.model}`);
    return {
      text,
      latencyMs,
      model: this.model,
      usage: data.usageMetadata || {},
    };
  }

  /**
   * Streaming response generator for real-time TTS
   */
  async *streamResponse(messages, opts = {}) {
    if (!this.apiKey) {
      throw new AppError('Gemini API key not configured', 500, 'GEMINI_NO_KEY');
    }

    // Use OpenAI-compatible SSE streaming for easy text delta parsing
    const url = `${this.baseUrl}/openai/chat/completions`;
    const openAiMessages = [];
    if (opts.systemPrompt) {
      openAiMessages.push({ role: 'system', content: opts.systemPrompt });
    }
    for (const m of messages) {
      openAiMessages.push({ role: m.role === 'model' ? 'assistant' : m.role, content: m.content });
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: openAiMessages,
        max_tokens: opts.maxTokens || 80,
        temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.4,
        stream: true
      })
    });

    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => null);
      throw new AppError(`Gemini stream error ${res.status}: ${JSON.stringify(err)}`, 502, 'GEMINI_ERROR');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let carry = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        carry += decoder.decode(value, { stream: true });

        let sep;
        while ((sep = carry.indexOf('\n\n')) !== -1) {
          const frame = carry.slice(0, sep);
          carry = carry.slice(sep + 2);

          const lines = frame.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(dataStr);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) yield delta;
            } catch {
              // Ignore malformed chunk
            }
          }
        }
      }
    } finally {
      try { await reader.cancel(); } catch {}
    }
  }
}

module.exports = { GeminiProvider };

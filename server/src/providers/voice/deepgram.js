const config = require('../../config/env');
const { AppError } = require('../../utils/errors');

class DeepgramProvider {
  constructor(apiKey = null) {
    this.apiKey = apiKey || config.providers.deepgram.apiKey || process.env.DEEPGRAM_API_KEY || '';
    this.defaultModel = config.providers.deepgram.model || 'nova-3';
  }

  isConfigured() {
    return !!this.apiKey;
  }

  /**
   * Transcribe an audio buffer (WAV, mu-law, or raw PCM container) using Deepgram Nova-3.
   *
   * @param {Buffer|string} audio - Buffer or base64 audio data.
   * @param {Object} opts
   * @param {string} [opts.language='te'] - Language code (e.g. 'te', 'te-IN', 'hi', 'en').
   * @param {string} [opts.model='nova-3'] - Deepgram model.
   * @param {string[]} [opts.keyterms] - Custom domain keywords to boost (e.g. ['2BHK', 'బడ్జెట్']).
   * @param {string} [opts.contentType='audio/wav'] - MIME type.
   * @returns {Promise<{ transcript: string, confidence: number, raw: any }>}
   */
  async transcribe(audio, opts = {}) {
    if (!this.apiKey) {
      throw new AppError('Deepgram API key not configured (DEEPGRAM_API_KEY)', 500, 'DEEPGRAM_NOT_CONFIGURED');
    }

    const buffer = Buffer.isBuffer(audio)
      ? audio
      : Buffer.from(String(audio).replace(/^data:audio\/\w+;base64,/, ''), 'base64');

    if (!buffer || buffer.length === 0) {
      return { transcript: '', confidence: 0 };
    }

    // Deepgram expects ISO language code: 'te', 'hi', 'en', 'ta', etc.
    let lang = (opts.language || 'te').toLowerCase();
    if (lang.includes('-')) {
      lang = lang.split('-')[0];
    }

    const model = opts.model || this.defaultModel || 'nova-3';

    const params = new URLSearchParams({
      model,
      language: lang,
      smart_format: 'true',
      punctuate: 'true',
    });

    // Custom keyterm boosting (Keyterm recognition for Telugu domain words)
    if (Array.isArray(opts.keyterms) && opts.keyterms.length > 0) {
      for (const term of opts.keyterms.slice(0, 50)) {
        if (typeof term === 'string' && term.trim()) {
          // Deepgram supports keywords=word:intensifier
          params.append('keywords', `${term.trim()}:2`);
        }
      }
    }

    const url = `https://api.deepgram.com/v1/listen?${params.toString()}`;
    const contentType = opts.contentType || 'audio/wav';

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Token ${this.apiKey}`,
          'Content-Type': contentType,
        },
        body: buffer,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new AppError(`Deepgram STT error ${res.status}: ${errText}`, 502, 'DEEPGRAM_STT_ERROR');
      }

      const data = await res.json();
      const alt = data?.results?.channels?.[0]?.alternatives?.[0];
      const transcript = (alt?.transcript || '').trim();
      const confidence = alt?.confidence || 0;

      return {
        transcript,
        confidence,
        raw: data,
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(`Deepgram transcription failed: ${err.message}`, 502, 'DEEPGRAM_NETWORK_ERROR');
    }
  }
}

module.exports = {
  DeepgramProvider,
};

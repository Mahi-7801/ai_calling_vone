const { AppError } = require('../../utils/errors');

class MockVoiceProvider {
  constructor() {
    this.voices = [
      { id: 'te-IN', name: 'Telugu (Male)', language: 'te-IN', gender: 'male', provider: 'mock' },
      { id: 'te-IN-female', name: 'Telugu (Female)', language: 'te-IN', gender: 'female', provider: 'mock' },
      { id: 'hi-IN', name: 'Hindi', language: 'hi-IN', gender: 'male', provider: 'mock' },
      { id: 'en-IN', name: 'English (India)', language: 'en-IN', gender: 'female', provider: 'mock' },
    ];
  }

  async synthesize(text, _opts = {}) {
    if (!text) throw new AppError('Empty text', 400, 'EMPTY_TEXT');
    const size = Math.max(1200, Math.round(text.length * 30));
    return {
      audioUrl: `https://mock.storage/tts/${Buffer.from(text).toString('base64').slice(0, 12)}.wav`,
      contentType: 'audio/wav',
      bytes: size,
    };
  }

  async getVoices() {
    return this.voices;
  }
}

module.exports = { MockVoiceProvider };
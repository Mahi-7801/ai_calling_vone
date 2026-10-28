const fs = require('fs');
const path = require('path');
const config = require('../src/config/env');
const { SarvamProvider } = require('../src/providers/voice/sarvam');
const { CartesiaProvider } = require('../src/providers/voice/cartesia');
const { GroqProvider } = require('../src/providers/ai/groq');

async function benchmark() {
  console.log('=== BENCHMARK LATENCY BREAKDOWN ===');

  // Let's create a 1.5s dummy audio buffer or synthesize a short clip "నమస్కారం"
  const cartesia = new CartesiaProvider();
  const sarvam = new SarvamProvider();
  const groq = new GroqProvider();

  // Test 1: Groq LLM latency
  console.log('\n--- 1. Testing Groq LLM TTFT & full completion ---');
  const t0 = Date.now();
  const genRes = await groq.generateResponse([{ role: 'user', content: 'నమస్కారం అండి, మీ వెబ్సైట్ వివరాలు కావాలి' }], {
    systemPrompt: 'You are Charan, reply in 1 short Telugu sentence.',
    maxTokens: 50,
  });
  console.log(`Groq full generation: ${Date.now() - t0}ms -> "${genRes.text}"`);

  // Test 1b: Groq Streaming TTFT
  const tStream0 = Date.now();
  let firstTokenMs = 0;
  let fullStreamText = '';
  for await (const chunk of groq.streamResponse([{ role: 'user', content: 'నమస్కారం అండి, మీ వెబ్సైట్ వివరాలు కావాలి' }], {
    systemPrompt: 'You are Charan, reply in 1 short Telugu sentence.',
    maxTokens: 50,
  })) {
    if (!firstTokenMs) {
      firstTokenMs = Date.now() - tStream0;
      console.log(`Groq TTFT (Time to First Token): ${firstTokenMs}ms!`);
    }
    fullStreamText += chunk;
  }
  console.log(`Groq streaming total: ${Date.now() - tStream0}ms -> "${fullStreamText}"`);

  // Test 2: Cartesia TTS WebSocket streaming Time to First Audio
  console.log('\n--- 2. Testing Cartesia TTS WebSocket TTFB ---');
  const tTts0 = Date.now();
  let firstAudioMs = 0;
  let totalBytes = 0;
  for await (const chunk of cartesia.streamSynthesize('ఖచ్చితంగా అండి, మా వద్ద అన్ని రకాల వెబ్సైట్ ప్యాకేజీలు అందుబాటులో ఉన్నాయి.', {
    voice: '82c2afc8-ebbc-4802-8ccf-036dc0fa1e3b',
    language: 'te',
  })) {
    if (!firstAudioMs) {
      firstAudioMs = Date.now() - tTts0;
      console.log(`Cartesia Time-to-First-Audio (TTFA): ${firstAudioMs}ms!`);
    }
    totalBytes += chunk.length;
  }
  console.log(`Cartesia streaming total: ${Date.now() - tTts0}ms, bytes: ${totalBytes}`);

  // Test 3: Sarvam STT vs Groq Whisper (if Groq has whisper)
  console.log('\n--- 3. Testing Sarvam STT ---');
  // Synthesize short test audio to test transcribe
  const syn = await cartesia.synthesize('నమస్కారం అండి', { voice: '82c2afc8-ebbc-4802-8ccf-036dc0fa1e3b' });
  const tStt0 = Date.now();
  try {
    const sttRes = await sarvam.transcribe(syn.buffer, { mimeType: 'audio/mpeg', language: 'te-IN' });
    console.log(`Sarvam STT latency: ${Date.now() - tStt0}ms -> "${sttRes.transcript}"`);
  } catch (err) {
    console.log(`Sarvam STT failed: ${err.message}`);
  }

  process.exit(0);
}

benchmark().catch(err => {
  console.error(err);
  process.exit(1);
});

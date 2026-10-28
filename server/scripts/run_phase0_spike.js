const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { CartesiaProvider } = require('../src/providers/voice/cartesia');
const { DeepgramProvider } = require('../src/providers/voice/deepgram');
const { SarvamProvider } = require('../src/providers/voice/sarvam');
const { GroqProvider } = require('../src/providers/ai/groq');

// 15 Prepared Telugu Test Sentences per Master Prompt Phase 0 specification
const TELUGU_TEST_SENTENCES = [
  { id: 1, type: 'Greeting & Identity', text: 'నమస్కారం అండి, నా పేరు మహేష్. మీ సర్వీస్ గురించి తెలుసుకోవాలనుకుంటున్నాను.' },
  { id: 2, type: 'Location & Name', text: 'నేను హైదరాబాద్ కూకట్‌పల్లి నుండి మాట్లాడుతున్నాను.' },
  { id: 3, type: 'Digits & Phone', text: 'నా ఫోన్ నెంబర్ తొమ్మిది సున్నా సున్నా సున్నా సున్నా తొమ్మిది ఎనిమిది ఏడు ఆరు.' },
  { id: 4, type: 'Currency & Pricing', text: 'మీ ప్లాన్ నెలకి రెండు వేల ఐదు వందల రూపాయలా లేక మూడు వేలా?' },
  { id: 5, type: 'Date & Time', text: 'వచ్చే సోమవారం ఉదయం పదకొండు గంటలకి సైట్ విజిట్ బుక్ చేయండి.' },
  { id: 6, type: 'Tenglish Mix', text: 'నాకు Instagram ad లో మీ real estate flat details చూసి interest వచ్చింది.' },
  { id: 7, type: 'Automobile Domain', text: 'కార్ ఎక్స్చేంజ్ ఆఫర్ మరియు doorstep test drive available ఉందా?' },
  { id: 8, type: 'Complex Numbers', text: 'మా బడ్జెట్ యాభై ఐదు లక్షల నుండి డెబ్బై లక్షల వరకు ఉంది.' },
  { id: 9, type: 'Agreement & WhatsApp', text: 'అవునండి, నాకు అర్థమైంది. మీరు వాట్సాప్‌లో బ్రోచర్ పంపించండి.' },
  { id: 10, type: 'Polite Objection', text: 'ప్రస్తుతం నేను ఒక మీటింగ్‌లో ఉన్నాను, సాయంత్రం ఐదు గంటలకి కాల్ చేయండి.' },
  { id: 11, type: 'Healthcare Booking', text: 'డాక్టర్ అపాయింట్‌మెంట్ కోసం రేపు ఉదయం తొమ్మిది గంటలకి స్లాట్ దొరుకుతుందా?' },
  { id: 12, type: 'Education & Fees', text: 'నీట్ మరియు జేఈఈ లాంగ్ టర్మ్ కోచింగ్ ఫీజు ఎంత ఉంటుంది?' },
  { id: 13, type: 'Reschedule', text: 'ఈ వీకెండ్ నాకు కుదరదు, వచ్చే శనివారం రీషెడ్యూల్ చేయండి.' },
  { id: 14, type: 'Barge-in Phrase', text: 'ఒక్క నిమిషం ఆగండి, మళ్ళీ చెప్పండి.' },
  { id: 15, type: 'Farewell & Exit', text: 'సరే అండి, చాలా ధన్యవాదాలు. వాట్సాప్ మెసేజ్ కోసం చూస్తాను.' },
];

function scoreSimilarity(original, recognized) {
  if (!recognized) return 'wrong';
  const origClean = original.toLowerCase().replace(/[^\w\u0C00-\u0C7F]/g, '');
  const recClean = recognized.toLowerCase().replace(/[^\w\u0C00-\u0C7F]/g, '');
  if (origClean === recClean) return 'correct';
  
  // Count matching words
  const origWords = original.toLowerCase().split(/\s+/).filter(Boolean);
  const recWords = recognized.toLowerCase().split(/\s+/).filter(Boolean);
  let matches = 0;
  for (const w of origWords) {
    if (recWords.some(rw => rw.includes(w) || w.includes(rw))) matches++;
  }
  const ratio = matches / Math.max(origWords.length, 1);
  if (ratio >= 0.75) return 'correct';
  if (ratio >= 0.40) return 'partly';
  return 'wrong';
}

async function runPhase0Spike() {
  console.log('================================================================');
  console.log('   PHASE 0 SPIKE: TELUGU VOICE AI & TELEPHONY PIPELINE TEST   ');
  console.log('   VoBiz + Cartesia Sonic 3.6 + Groq LPU + Deepgram Nova-3 / Sarvam');
  console.log('================================================================\n');

  const cartesia = new CartesiaProvider();
  const deepgram = new DeepgramProvider();
  const sarvam = new SarvamProvider();
  const groq = new GroqProvider();

  const results = {
    sttDeepgram: [],
    sttSarvam: [],
    groqMetrics: {},
    cartesiaMetrics: {},
    timestamp: new Date().toISOString(),
  };

  // -------------------------------------------------------------
  // Test 1: Groq LLM Latency & Streaming TTFT
  // -------------------------------------------------------------
  console.log('--- 1. Testing Groq LPU LLM Latency & TTFT ---');
  const tGroq0 = Date.now();
  let firstTokenMs = 0;
  let groqReply = '';
  for await (const chunk of groq.streamResponse([
    { role: 'user', content: 'నమస్కారం అండి, నాకు రియల్ ఎస్టేట్ ఫ్లాట్స్ వివరాలు కావాలి.' }
  ], {
    systemPrompt: 'You are Charan, an expert Telugu sales advisor. Respond in 1 warm, concise Telugu sentence.',
    maxTokens: 60,
  })) {
    if (!firstTokenMs) firstTokenMs = Date.now() - tGroq0;
    groqReply += chunk;
  }
  const totalGroqMs = Date.now() - tGroq0;
  console.log(`✓ Groq TTFT (Time-To-First-Token) : ${firstTokenMs} ms`);
  console.log(`✓ Groq Total Completion Time    : ${totalGroqMs} ms`);
  console.log(`✓ Generated Telugu Reply         : "${groqReply.trim()}"\n`);
  results.groqMetrics = { firstTokenMs, totalGroqMs, reply: groqReply.trim() };

  // -------------------------------------------------------------
  // Test 2: Cartesia Sonic 3.6 TTS Latency (TTFA)
  // -------------------------------------------------------------
  console.log('--- 2. Testing Cartesia Sonic 3.6 TTS Latency (TTFA) ---');
  const tTts0 = Date.now();
  let firstAudioChunkMs = 0;
  let totalAudioBytes = 0;
  for await (const chunk of cartesia.streamSynthesize(groqReply || 'నమస్కారం అండి, మా వద్ద 2BHK మరియు 3BHK ఫ్లాట్స్ అందుబాటులో ఉన్నాయి.', {
    voice: '82c2afc8-ebbc-4802-8ccf-036dc0fa1e3b', // Charan
    language: 'te',
  })) {
    if (!firstAudioChunkMs) firstAudioChunkMs = Date.now() - tTts0;
    totalAudioBytes += chunk.length;
  }
  const totalTtsMs = Date.now() - tTts0;
  console.log(`✓ Cartesia TTFA (Time-To-First-Audio) : ${firstAudioChunkMs} ms`);
  console.log(`✓ Cartesia Total Generation Time     : ${totalTtsMs} ms`);
  console.log(`✓ Synthesized Audio Bytes            : ${totalAudioBytes} bytes (8kHz / 16kHz)\n`);
  results.cartesiaMetrics = { firstAudioChunkMs, totalTtsMs, totalAudioBytes };

  // Total Pipeline Response Time:
  const pipelineFirstAudioEst = firstTokenMs + firstAudioChunkMs;
  console.log(`⚡ Estimated Pipeline Latency (STT End -> Audio Start): ~${pipelineFirstAudioEst} ms (< 1200ms target!)\n`);

  // -------------------------------------------------------------
  // Test 3: 15 Telugu Sentences STT Evaluation
  // -------------------------------------------------------------
  console.log('--- 3. Evaluating 15 Telugu Test Sentences with Deepgram Nova-3 & Sarvam ---');
  let deepgramCorrect = 0;
  let deepgramPartly = 0;
  let deepgramWrong = 0;

  let sarvamCorrect = 0;
  let sarvamPartly = 0;
  let sarvamWrong = 0;

  for (const s of TELUGU_TEST_SENTENCES) {
    // Generate clean audio for this sentence with Cartesia Charan in canonical WAV container
    const syn = await cartesia.synthesize(s.text, {
      voice: '82c2afc8-ebbc-4802-8ccf-036dc0fa1e3b',
      language: 'te',
      container: 'wav',
    });

    // 3a. Deepgram Nova-3 Transcription
    const tDg0 = Date.now();
    let dgText = '';
    let dgConf = 0;
    try {
      const dgRes = await deepgram.transcribe(syn.buffer, { language: 'te', contentType: 'audio/wav' });
      dgText = dgRes.transcript;
      dgConf = dgRes.confidence;
    } catch (err) {
      dgText = `[Error: ${err.message}]`;
    }
    const dgLatency = Date.now() - tDg0;
    const dgScore = scoreSimilarity(s.text, dgText);
    if (dgScore === 'correct') deepgramCorrect++;
    else if (dgScore === 'partly') deepgramPartly++;
    else deepgramWrong++;

    // 3b. Sarvam Transcription
    const tSa0 = Date.now();
    let saText = '';
    try {
      const saRes = await sarvam.transcribe(syn.buffer, { mimeType: 'audio/wav', language: 'te-IN' });
      saText = saRes.transcript || '';
    } catch (err) {
      saText = `[Fallback/Error: ${err.message}]`;
    }
    const saLatency = Date.now() - tSa0;
    const saScore = scoreSimilarity(s.text, saText);
    if (saScore === 'correct') sarvamCorrect++;
    else if (saScore === 'partly') sarvamPartly++;
    else sarvamWrong++;

    console.log(`[#${s.id}] ${s.type}`);
    console.log(`  Expected : "${s.text}"`);
    console.log(`  Deepgram : "${dgText}" -> ${dgScore.toUpperCase()} (${dgLatency}ms, conf: ${dgConf.toFixed(2)})`);
    console.log(`  Sarvam   : "${saText}" -> ${saScore.toUpperCase()} (${saLatency}ms)`);

    results.sttDeepgram.push({ id: s.id, type: s.type, expected: s.text, transcript: dgText, latency: dgLatency, score: dgScore, conf: dgConf });
    results.sttSarvam.push({ id: s.id, type: s.type, expected: s.text, transcript: saText, latency: saLatency, score: saScore });
  }

  const dgAccuracy = ((deepgramCorrect + deepgramPartly * 0.5) / TELUGU_TEST_SENTENCES.length) * 100;
  const saAccuracy = ((sarvamCorrect + sarvamPartly * 0.5) / TELUGU_TEST_SENTENCES.length) * 100;

  console.log('\n================================================================');
  console.log('                      PHASE 0 SPIKE SUMMARY                    ');
  console.log('================================================================');
  console.log(`Deepgram Nova-3 Telugu Score : ${deepgramCorrect} Correct, ${deepgramPartly} Partly, ${deepgramWrong} Wrong`);
  console.log(`Deepgram Nova-3 Telugu Rate  : ${dgAccuracy.toFixed(1)}%`);
  console.log(`Sarvam Telugu Score          : ${sarvamCorrect} Correct, ${sarvamPartly} Partly, ${sarvamWrong} Wrong`);
  console.log(`Sarvam Telugu Rate           : ${saAccuracy.toFixed(1)}%`);
  console.log(`Groq Time-to-First-Token     : ${firstTokenMs} ms`);
  console.log(`Cartesia Time-to-First-Audio : ${firstAudioChunkMs} ms`);
  console.log(`Total End-to-End Latency     : ~${pipelineFirstAudioEst} ms`);
  console.log(`Decision Rule Outcome        : ${dgAccuracy >= 85 ? 'PASSED (>= 85% Accuracy)' : 'NEEDS PIPELINE FALLBACK'}`);
  console.log('================================================================\n');

  // Save raw data to JSON for documentation
  fs.writeFileSync(path.join(__dirname, '../scratch/phase0_test_results.json'), JSON.stringify(results, null, 2));
  console.log('✓ Phase 0 spike results written to server/scratch/phase0_test_results.json');
}

runPhase0Spike().catch(err => {
  console.error('Phase 0 spike failed:', err);
  process.exit(1);
});

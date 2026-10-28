const BaseEngine = require('./baseEngine');
const { getAIProvider, getVoiceProvider } = require('../../providers');
const { SarvamProvider } = require('../../providers/voice/sarvam');
const { CartesiaProvider } = require('../../providers/voice/cartesia');
const { DeepgramProvider } = require('../../providers/voice/deepgram');
const { buildSystemPrompt } = require('../systemPrompt');
const { mulawToLinear } = require('../callRecording');
const { AppError } = require('../../utils/errors');

function echoTextScore(text, haystack) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const a = norm(text);
  const b = norm(haystack);
  // Short words/phrases (< 12 letters) like "హలో", "హాయ్", "yes", "సరే" are never echo
  if (a.length < 12 || b.length < 12) return 0;
  // If user utterance is at least 15 characters and literally contained in haystack, it's echo
  if (a.length >= 15 && b.includes(a)) return 1;
  const N = 5;
  if (a.length < N) return 0;
  let hit = 0;
  let total = 0;
  for (let i = 0; i + N <= a.length; i++) {
    total++;
    if (b.includes(a.slice(i, i + N))) hit++;
  }
  return total ? hit / total : 0;
}

function wordOverlapScore(text, haystack) {
  const tokenize = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ').trim().split(/\s+/).filter((w) => w.length >= 2);
  const wordsA = tokenize(text);
  const wordsB = new Set(tokenize(haystack));
  if (!wordsA.length || !wordsB.size) return 0;
  let matches = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) matches++;
  }
  return matches / wordsA.length;
}

function normalizeUtterance(s) {
  return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function detectEndingIntent(userText, messages = []) {
  const norm = String(userText || '').toLowerCase().replace(/[.,!?;:()]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!norm) return false;

  const explicitTerms = [
    'bye', 'buy', 'by', 'బాయ్', 'గుడ్ బాయ్', 'goodbye',
    'ok bye', 'okay bye', 'ok buy', 'okay buy', 'ok by', 'okay by',
    'bye bye', 'buy buy', 'ఓకే బాయ్', 'సరే బాయ్', 'థాంక్యూ బాయ్', 'థాంక్స్ బాయ్',
    'కట్ ద కాల్', 'కాల్ కట్', 'కట్ చేయండి', 'కట్ చేయి', 'కట్ చేయు',
    'cut the call', 'cut call', 'disconnect',
    'ఫోన్ పెట్టేయండి', 'ఫోన్ పెట్టేస్తా', 'ఫోన్ కట్', 'పెట్టేయండి', 'పెట్టేస్తా',
    'హ్యాంగ్ అప్', 'hang up',
    'థాంక్యూ చాలు', 'థాంక్స్ చాలు', 'ఇక చాలు', 'ఇంతే చాలు', 'వద్దు చాలు',
  ];
  if (explicitTerms.some((t) => norm === t || norm.startsWith(t + ' ') || norm.endsWith(' ' + t) || norm.includes(' ' + t + ' '))) {
    return true;
  }
  if (norm.includes('bye') || norm.includes('బాయ్') || norm.includes('goodbye') || norm.includes('కాల్ కట్') || norm.includes('okay buy') || norm.includes('ok buy')) {
    return true;
  }

  const thankTerms = [
    'థాంక్యూ', 'థాంక్స్', 'థాంక్స్ అండి', 'థాంక్యూ అండి',
    'ఓకే థాంక్యూ', 'ఓకే థాంక్స్', 'ఓకే అండి థాంక్యూ', 'థాంక్యూ సో మచ్',
    'ధన్యవాదాలు', 'ధన్యవాదాలు అండి',
    'thank you', 'thanks', 'ok thank you', 'ok thanks', 'thank you so much',
  ];
  if (messages.length >= 3 && thankTerms.some((t) => norm === t || norm.startsWith(t + ' ') || norm.endsWith(' ' + t) || norm.includes(' ' + t + ' '))) {
    return true;
  }

  const negativeAnswers = [
    'ఏం లేదు', 'ఏమీ లేదు', 'ఇంకేం లేదు', 'ఇంకా ఏం లేదు', 'ఇంకేమీ లేదు',
    'లేదు', 'లేదండి', 'నో', 'వద్దు', 'వద్దండి', 'నాకేం వద్దు',
    'no', 'nope', 'nothing', 'no thanks', 'nothing else', 'no questions',
    'అంతే', 'అంతే అండి', 'చాలు', 'చాలండి', 'ఇక చాలు', 'అవసరం లేదు', 'సరిపోతుంది',
  ];
  const isNegative = negativeAnswers.some((w) => norm === w || norm.startsWith(w + ' ') || norm.endsWith(' ' + w) || norm.includes(' ' + w + ' '));

  if (isNegative) {
    if (messages.length >= 3) return true;
    const lastAiMsg = (messages.slice(0, -1).reverse().find((m) => m.role === 'assistant')?.content || '').toLowerCase();
    const isAiAskingMore = [
      'ఇంకా ఏదైనా', 'ఇంకేమైనా', 'ఇంకా ఏమైనా', 'సందేహాలు', 'ప్రశ్నలు',
      'అడగుదామా', 'అడగండి', 'వివరాలు కావాలా', 'సహాయం కావాలా', 'వివరాలు పంపించమంటారా',
      'anything else', 'any other', 'any questions',
    ].some((q) => lastAiMsg.includes(q));
    if (isAiAskingMore) return true;
  }

  return false;
}

function createSimpleWavHeader(dataBuffer, sampleRate = 8000, numChannels = 1, bitsPerSample = 8) {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataLength = dataBuffer.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(7, 20); // 7 = mu-law
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataLength, 40);

  return Buffer.concat([header, dataBuffer]);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * PipelineEngine
 *
 * Custom turn-based conversational pipeline:
 * VoBiz audio (8kHz mu-law) -> VAD -> Sarvam Saaras v2 STT (te-IN) -> Groq LPU LLM -> Cartesia Sonic 3.6 TTS -> VoBiz playAudio
 */
class PipelineEngine extends BaseEngine {
  constructor(options) {
    super(options);
    this.name = 'pipeline';

    this.ai = getAIProvider('groq');
    this.cartesia = new CartesiaProvider();
    this.sarvam = new SarvamProvider();
    this.deepgram = new DeepgramProvider();

    this.employeeKnowledge = options.employeeKnowledge || options.session?.employeeKnowledge || null;
    this.audioBuffer = [];
    this.preSpeechBuffer = [];
    this.bargeInBuffer = [];
    this.isUserSpeaking = false;
    this.pendingAudio = null;
    this.isAiSpeaking = false;
    this.isProcessingSpeech = false;
    this.messages = [];
    this.bloodGroup = null;
    this.silenceTimer = null;
    this.silenceRepromptCount = 0;
    this.exitTimer = null;
    this.isClosing = false;
    this.hasGreeted = false;
    this.recentAiSpeech = [];
    this.noiseFloor = 20;
    this.speechRun = 0;
    this.silenceRun = 0;
    this.activeUtteranceBytes = 0;
    this.lastSpeakStart = 0;
    this.playbackEndTime = 0;
    this._bargedIn = false;
    this._bargeInLogged = false;
    this.diag = { mediaChunks: 0, lastDiagTs: 0 };
  }

  interrupt() {
    this._bargedIn = true;
    this.isAiSpeaking = false;
    this.playbackEndTime = 0;
    this.clearSilenceTimer();
  }

  onPlaybackConfirmed() {
    this.playbackEndTime = Date.now();
    this.isAiSpeaking = false;
    this.speechRun = 0;
    this.armSilenceTimer();
  }

  onPlaybackCleared() {
    this.playbackEndTime = 0;
    this.isAiSpeaking = false;
    this.speechRun = 0;
    this._bargedIn = true;
    this.clearSilenceTimer();
  }

  clearSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  armSilenceTimer() {
    this.clearSilenceTimer();
    if (this.session?.finished || this.isClosing) return;

    const now = Date.now();
    const remainingPlaybackMs = Math.max(0, (this.playbackEndTime || 0) - now);
    // Allow caller a generous, natural 10-second silence window AFTER AI finishes speaking
    const waitMs = remainingPlaybackMs + 10000;

    this.silenceTimer = setTimeout(async () => {
      this.silenceTimer = null;
      if (this.session?.finished || this.isClosing || this.isAiSpeaking || this.isUserSpeaking || this.isProcessingSpeech) return;
      if (Date.now() < (this.playbackEndTime || 0)) {
        this.armSilenceTimer();
        return;
      }
      await this.handleSilenceReprompt();
    }, waitMs);
  }

  async handleSilenceReprompt() {
    if (this.session?.finished || this.isClosing || this.isAiSpeaking || this.isUserSpeaking) return;

    this.silenceRepromptCount = (this.silenceRepromptCount || 0) + 1;
    const leadName = (this.lead?.name || '').trim();
    const lang = (this.employee?.language_code || 'te').toLowerCase();
    const isTe = !lang.startsWith('en') && !lang.startsWith('hi');
    const isHi = lang.startsWith('hi');
    const leadHonorific = leadName ? (
      isHi ? `${leadName} जी` :
      !isTe ? leadName :
      `${leadName} గారు`
    ) : (isTe ? 'అండి' : isHi ? 'सर' : 'Sir');

    if (this.silenceRepromptCount === 1) {
      const msg = isTe
        ? `హలో ${leadHonorific}, నా మాట వినిపిస్తోందా? లైన్‌లో ఉన్నారా అండి?`
        : isHi
        ? `हेलो ${leadHonorific}, क्या आप सुन पा रहे हैं? क्या आप लाइन पर हैं?`
        : `Hello ${leadHonorific}, can you hear me? Are you on the line?`;
      console.log(`[pipeline] Silence prompt 1/3: "${msg}"`);
      this.messages.push({ role: 'assistant', content: msg });
      this.session.addTranscript('ai', msg);
      await this.speak(msg);
      this.armSilenceTimer();
    } else if (this.silenceRepromptCount === 2) {
      const msg = isTe
        ? `హలో ${leadHonorific}, మీ వైపు నుంచి ఎలాంటి శబ్దం రావడం లేదు, మీరు ఉన్నారా అండి?`
        : isHi
        ? `हेलो ${leadHonorific}, आपकी आवाज नहीं आ रही है, क्या आप लाइन पर हैं?`
        : `Hello ${leadHonorific}, I cannot hear any response from you, are you still there?`;
      console.log(`[pipeline] Silence prompt 2/3: "${msg}"`);
      this.messages.push({ role: 'assistant', content: msg });
      this.session.addTranscript('ai', msg);
      await this.speak(msg);
      this.armSilenceTimer();
    } else {
      const msg = isTe
        ? `మీ వైపు నుంచి ఎలాంటి స్పందన లేదు అండి. కాబట్టి కాల్ ముగిస్తున్నాను, ధన్యవాదాలు!`
        : isHi
        ? `आपकी तरफ से कोई जवाब नहीं मिल रहा है, इसलिए मैं कॉल समाप्त कर रही हूँ। धन्यवाद!`
        : `There is no response from your side, so I am ending the call. Thank you!`;
      console.log(`[pipeline] Silence prompt 3/3 (no response) -> terminating call: "${msg}"`);
      this.messages.push({ role: 'assistant', content: msg });
      this.session.addTranscript('ai', msg);
      this.isClosing = true;
      await this.speak(msg);
      const remainingPlaybackMs = Math.max(0, (this.playbackEndTime || Date.now()) - Date.now());
      this.exitTimer = setTimeout(() => {
        this.exitTimer = null;
        this.session.finishCall('no_response');
      }, Math.max(2500, remainingPlaybackMs + 1000));
    }
  }

  resolveVoiceProvider() {
    const { resolveVoiceProvider } = require('../../providers');
    try {
      return resolveVoiceProvider(this.employee?.voice || null, this.employee?.voice_provider || null);
    } catch {
      return this.cartesia;
    }
  }

  async start() {
    // Schedule initial greeting after connection settles
    setTimeout(() => this.playInitialGreeting(), 600);
  }

  async playInitialGreeting() {
    if (this.hasGreeted) return;
    this.hasGreeted = true;
    try {

    if (this.session?.provider === 'vobiz') {
      const deadline = Date.now() + 5000;
      while (!this.session.streamSid && Date.now() < deadline) {
        await sleep(100);
      }
      if (!this.session.streamSid) {
        this.session.streamSid = this.session.callSid || this.session.callId;
        console.warn(`[pipeline] Using fallback streamSid (${this.session.streamSid}) for greeting`);
      }
    }

      const leadName = (this.lead?.name || '').trim();
      const leadPurpose = (this.lead?.purpose || '').trim();
      const lang = (this.employee?.language_code || 'te').toLowerCase();
      const isTe = !lang.startsWith('en') && !lang.startsWith('hi');
      const isHi = lang.startsWith('hi');
      const empName = this.employee?.name || (isTe ? 'రాధ' : isHi ? 'राधा' : 'Radha');
      const company = (this.employee?.company || this.session?.organization?.name || 'మా సంస్థ').trim();

    const leadHonorific = leadName ? (
      isHi ? `${leadName} जी` :
      !isTe ? leadName :
      `${leadName} గారు`
    ) : '';

    let greeting = '';
    const customGreeting = (this.employee?.greeting || '').trim();

    if (customGreeting) {
      greeting = customGreeting
        .replace('{name}', empName)
        .replace('{company}', company);

      // If placeholders exist in template, replace them with lead name
      if (customGreeting.includes('{lead') || customGreeting.includes('{customer')) {
        greeting = greeting.replace(/\{lead_name\}|\{customer_name\}|\{lead\}|\{customer\}/gi, leadHonorific || (isTe ? 'అండి' : isHi ? 'जी' : 'there'));
      } else if (leadHonorific && !greeting.includes(leadName)) {
        // Naturally weave the entered lead name into the greeting opening without duplication
        const teMatch = greeting.match(/^(\s*)(నమస్కారం|నమస్తే)(\s*అండి)?([\s,!.–—]+)(.*)$/i);
        const teHello = greeting.match(/^(\s*)(హలో)([\s,!.–—]+)(.*)$/i);
        const hiMatch = greeting.match(/^(\s*)(नमस्ते|नमस्कार)(\s*जी)?([\s,!.–—]+)(.*)$/i);
        const enMatch = greeting.match(/^(\s*)(Hello|Hi)(\s*there)?([\s,!.–—]+)(.*)$/i);
        if (teMatch) {
          greeting = `${teMatch[2]} ${leadHonorific}! ${teMatch[5]}`;
        } else if (teHello) {
          greeting = `హలో ${leadHonorific}! ${teHello[4]}`;
        } else if (hiMatch) {
          greeting = `${hiMatch[2]} ${leadHonorific}! ${hiMatch[5]}`;
        } else if (enMatch) {
          greeting = `${enMatch[2]} ${leadHonorific}! ${enMatch[5]}`;
        } else {
          greeting = isTe ? `నమస్కారం ${leadHonorific}! ${greeting}` : isHi ? `नमस्ते ${leadHonorific}! ${greeting}` : `Hello ${leadHonorific}! ${greeting}`;
        }
      }
      if (leadPurpose) {
        greeting = greeting.replace(/\{purpose\}|\{reason\}/gi, leadPurpose);
      }
    } else {
      // Default natural generated greeting
      if (isHi) {
        if (leadHonorific && leadPurpose) {
          greeting = `नमस्ते ${leadHonorific}! मेरा नाम ${empName} है, मैं ${company} से बात कर रही हूँ। आपने ${leadPurpose} के बारे में जानकारी माँगी थी, क्या आपसे एक मिनट बात हो सकती है?`;
        } else if (leadHonorific) {
          greeting = `नमस्ते ${leadHonorific}! मेरा नाम ${empName} है, मैं ${company} से बात कर रही हूँ। क्या आपसे एक मिनट बात हो सकती है?`;
        } else {
          greeting = `नमस्ते! मेरा नाम ${empName} है, मैं ${company} से बात कर रही हूँ। क्या आपसे एक मिनट बात हो सकती है?`;
        }
      } else if (!isTe) {
        if (leadHonorific && leadPurpose) {
          greeting = `Hello ${leadHonorific}! My name is ${empName} calling from ${company}. I am following up on your enquiry regarding ${leadPurpose}. Do you have a quick minute to speak?`;
        } else if (leadHonorific) {
          greeting = `Hello ${leadHonorific}! My name is ${empName} from ${company}. Do you have a quick minute to speak?`;
        } else {
          greeting = `Hello! My name is ${empName} from ${company}. Do you have a quick minute to speak?`;
        }
      } else {
        if (leadHonorific && leadPurpose) {
          greeting = `నమస్కారం ${leadHonorific}! నా పేరు ${empName}. నేను ${company} నుంచి మాట్లాడుతున్నాను. మీరు ${leadPurpose} గురించి ఆసక్తి చూపించారు కదా, మీతో ఒక నిమిషం మాట్లాడవచ్చా అండి?`;
        } else if (leadHonorific) {
          greeting = `నమస్కారం ${leadHonorific}! నా పేరు ${empName}, నేను ${company} నుంచి మాట్లాడుతున్నాను. మీతో ఒక నిమిషం మాట్లాడవచ్చా అండి?`;
        } else {
          greeting = `నమస్కారం అండి! నా పేరు ${empName}, నేను ${company} నుంచి మాట్లాడుతున్నాను. మీతో ఒక నిమిషం మాట్లాడవచ్చా అండి?`;
        }
      }
    }

    greeting = greeting.replace(/[ \t]+/g, ' ').replace(/\s*\?\s*$/, '?').trim();

    this.messages.push({ role: 'assistant', content: greeting });
    this.session.addTranscript('ai', greeting);
    this.recentAiSpeech.push(greeting);
    console.log(`[pipeline] Playing greeting to caller: "${greeting}"`);
    this.isGreeting = true;
    try {
      await this.speak(greeting);
    } finally {
      // Keep isGreeting active until audio has actually finished playing on the caller handset
      const remainingMs = Math.max(0, (this.playbackEndTime || Date.now()) - Date.now());
      setTimeout(() => {
        this.isGreeting = false;
      }, remainingMs);
    }
    this.armSilenceTimer();
    } catch (err) {
      console.error('[pipeline] playInitialGreeting error:', err);
    }
  }

  decodeInbound(chunk) {
    const encoding = this.session?.mediaFormat?.encoding || 'mulaw';
    const rate = this.session?.mediaFormat?.sampleRate || 8000;

    if (encoding === 'l16' || encoding === 'pcm16' || encoding === 'linear16') {
      const count = Math.floor(chunk.length / 2);
      const out = new Int16Array(count);
      for (let i = 0; i < count; i++) out[i] = chunk.readInt16LE(i * 2);
      return { samples: out, sampleRate: rate };
    }

    const out = new Int16Array(chunk.length);
    for (let i = 0; i < chunk.length; i++) out[i] = mulawToLinear(chunk[i]);
    return { samples: out, sampleRate: rate };
  }

  handleInboundAudio(chunk) {
    if (!chunk || !chunk.length) return;

    const { samples } = this.decodeInbound(chunk);
    const n = samples.length;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const s = samples[i];
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / n);
    this.diag.mediaChunks++;
    const now = Date.now();

    // 16-bit linear PCM noise floor tracking (analog line hiss ~100-600 RMS)
    if (rms < 800) {
      this.noiseFloor = this.noiseFloor === 0
        ? rms
        : Math.min(600, Math.max(80, this.noiseFloor * 0.95 + rms * 0.05));
    }

    const baseFloor = Math.max(80, Math.min(600, this.noiseFloor || 200));
    const isAiPlaying = (this.isAiSpeaking || now < (this.playbackEndTime || 0)) && !this._bargedIn;

    if (isAiPlaying) {
      // Rolling buffer of inbound frames during AI speech (last 8 frames = 160ms)
      if (!this.bargeInBuffer) this.bargeInBuffer = [];
      this.bargeInBuffer.push(chunk);
      if (this.bargeInBuffer.length > 8) this.bargeInBuffer.shift();

      const speakElapsed = now - (this.lastSpeakStart || 0);
      // Protect initial greeting from acoustic echo cancellation
       // Respond to a sudden caller interruption as early as possible instead of
       // letting the AI finish its current utterance. Keep only a short echo
       // guard at the very start of a turn.
       const minSpeakElapsed = 0;

       // Realistic speech detection over acoustic echo on 16-bit linear PCM:
       // Phone acoustic echo peaks around 1,500 - 3,800 RMS.
       // During initial greeting, speaker volume is loud, so protect with higher threshold & run
       const bargeThreshold = this.isGreeting ? Math.max(4500, baseFloor * 8) : Math.max(3000, baseFloor * 5);
       const isLoudSpeech = rms >= bargeThreshold;
       this.speechRun = isLoudSpeech ? (this.speechRun || 0) + 1 : 0;
       const requiredRun = this.isGreeting ? 5 : 3;

      // Require consecutive loud speech frames to ensure it's deliberate caller speech, not an echo blip
       if (speakElapsed >= minSpeakElapsed && this.speechRun >= requiredRun) {
        if (!this._bargeInLogged) {
          this._bargeInLogged = true;
          console.log(`[pipeline] Caller barge-in: interrupting AI playback (rms=${rms.toFixed(0)}, elapsed=${speakElapsed}ms)`);
        }
        this.clearSilenceTimer();
        this._bargedIn = true;
        this.session.clearAudioBuffer();
        this.isAiSpeaking = false;
        this.playbackEndTime = 0;
        this.isUserSpeaking = true;
        this.utteranceStartedAt = now - (this.bargeInBuffer.length * 20);
        this.lastSpeechTs = now;
        this.quietFrames = 0;
        this.voicedFrames = this.speechRun;
        // Preserve caller's barge-in speech frames so the first words aren't lost!
        this.audioBuffer = [...this.bargeInBuffer];
        this.activeUtteranceBytes = this.audioBuffer.reduce((acc, c) => acc + c.length, 0);
        this.bargeInBuffer = [];
        this.preSpeechBuffer = [];
        return;
      }
      return;
    }

    const speechThreshold = Math.max(650, baseFloor * 2.2);
    const isSpeechLike = rms >= speechThreshold;
    this.speechRun = isSpeechLike ? (this.speechRun || 0) + 1 : 0;
    const sustainedSpeech = this.speechRun >= 3;

    if (!this.isUserSpeaking) {
      if (!this.preSpeechBuffer) this.preSpeechBuffer = [];
      this.preSpeechBuffer.push(chunk);
      // Keep 25 frames (~500ms) of pre-speech audio history so initial words are never clipped!
      if (this.preSpeechBuffer.length > 25) this.preSpeechBuffer.shift();

      if (sustainedSpeech && !this.isProcessingSpeech) {
        this.clearSilenceTimer();
        if (this.exitTimer) {
          clearTimeout(this.exitTimer);
          this.exitTimer = null;
        }
        this.isUserSpeaking = true;
        this.utteranceStartedAt = now;
        this.lastSpeechTs = now;
        this.quietFrames = 0;
        this.voicedFrames = this.speechRun;
        this.audioBuffer = [...this.preSpeechBuffer];
        this.activeUtteranceBytes = this.audioBuffer.reduce((acc, c) => acc + c.length, 0);
        this.preSpeechBuffer = [];
      }
    } else {
      this.audioBuffer.push(chunk);
      this.activeUtteranceBytes += chunk.length;

      if (isSpeechLike) {
        this.voicedFrames = (this.voicedFrames || 0) + 1;
        this.lastSpeechTs = now;
        this.quietFrames = 0;
      } else {
        this.quietFrames = (this.quietFrames || 0) + 1;
      }

      const pauseMs = now - (this.lastSpeechTs || now);
      const utteranceMs = now - (this.utteranceStartedAt || now);

      // Ultra-fast conversational endpointing:
      // 1. Fast completion for short responses (e.g. "Hi", "Hello", "Yes", "హా", "చెప్పండి", "అవును", "సరే"):
      //    Total utterance <= 1500ms and pause >= 360ms (7 quiet frames) -> instant reply!
      // 2. Natural sentence completion:
      //    Total utterance > 1500ms and pause >= 500ms (10 quiet frames) -> cuts 400ms of dead air!
      // 3. Maximum utterance safety cap: 15s
      const isShortTurnComplete = (utteranceMs <= 1500) && (pauseMs >= 360 && this.quietFrames >= 7);
      const isNormalTurnComplete = (utteranceMs > 1500) && (pauseMs >= 500 && this.quietFrames >= 10);
      const isMaxCap = this.activeUtteranceBytes >= 120000;

      const isTurnComplete = this.activeUtteranceBytes >= 1200 && (isShortTurnComplete || isNormalTurnComplete || isMaxCap);

      if (isTurnComplete && !this.isProcessingSpeech) {
        this.isUserSpeaking = false;
        const voiced = this.voicedFrames || 0;
        this.voicedFrames = 0;
        this.quietFrames = 0;

        if (voiced < 2) {
          this.audioBuffer = [];
          this.activeUtteranceBytes = 0;
          return;
        }

        this.handleSpeechUtterance();
      }
    }
  }

  _finishProcessing() {
    this.isProcessingSpeech = false;
    this.pendingAudio = null;
  }

  async handleSpeechUtterance(overrideAudio = null) {
    if (this.session?.finished) return;
    this.clearSilenceTimer();
    this.silenceRepromptCount = 0;

    if (this.exitTimer && !this.isClosing) {
      clearTimeout(this.exitTimer);
      this.exitTimer = null;
    }
    this.isProcessingSpeech = true;
    try {
    const fullAudio = overrideAudio || Buffer.concat(this.audioBuffer);
    this.audioBuffer = [];
    this.activeUtteranceBytes = 0;

    let userText = '';
    const languageCode = (this.employee?.language_code || 'te').toLowerCase();
    const isoLang = languageCode.split('-')[0];
    const isTe = !languageCode.startsWith('en') && !languageCode.startsWith('hi');
    const isHi = languageCode.startsWith('hi');
    const wavBuffer = createSimpleWavHeader(fullAudio, 8000, 1, 8);

    // For Indian languages (Telugu, Hindi), Sarvam Saaras-v3 is hosted in India and returns in ~250-300ms (vs Deepgram ~1.5s).
    // Prioritizing Sarvam for Indian languages cuts 1.2+ seconds off every turn!
    const attempts = isTe || isHi ? [
      { name: 'sarvam', run: () => this.sarvam.transcribe(wavBuffer, { language: this.employee?.language_code || 'te-IN' }) },
      ...(this.deepgram.isConfigured() ? [{
        name: 'deepgram-nova3',
        run: () => this.deepgram.transcribe(wavBuffer, { language: isoLang, model: 'nova-3' }),
      }] : []),
      {
        name: 'groq-whisper',
        run: async () => {
          const { GroqProvider } = require('../../providers/ai/groq');
          const res = await new GroqProvider().transcribe(wavBuffer, { language: isoLang, filename: 'call.wav', contentType: 'audio/wav' });
          return { transcript: res.text };
        },
      },
    ] : [
      ...(this.deepgram.isConfigured() ? [{
        name: 'deepgram-nova3',
        run: () => this.deepgram.transcribe(wavBuffer, { language: isoLang, model: 'nova-3' }),
      }] : []),
      { name: 'sarvam', run: () => this.sarvam.transcribe(wavBuffer, { language: this.employee?.language_code || 'te-IN' }) },
    ];

    for (const attempt of attempts) {
      try {
        const stt = await attempt.run();
        userText = (stt.transcript || '').trim();
        if (userText) break;
      } catch (sttErr) {
        console.warn(`[pipeline] STT ${attempt.name} error: ${sttErr.message}`);
      }
    }

    if (!userText || userText.length < 2) {
      this._finishProcessing();
      return;
    }

    const leadName = (this.lead?.name || '').trim();
    const leadPurpose = (this.lead?.purpose || '').trim();
    const lang = languageCode;
    const empName = this.employee?.name || (isTe ? 'రాధ' : isHi ? 'राधा' : 'Radha');
    const company = this.employee?.company || 'మన కంపెనీ';
    const leadHonorific = leadName ? (
      isHi ? `${leadName} जी` :
      !isTe ? leadName :
      `${leadName} గారు`
    ) : (isTe ? 'అండి' : isHi ? 'सर' : 'Sir');

    if (this.isClosing) {
      const normCheck = userText.toLowerCase().replace(/[.,!?;:()]/g, ' ').replace(/\s+/g, ' ').trim();
      const waitWords = ['ఆగండి', 'ఆగు', 'వెయిట్', 'wait', 'ఒక్క నిమిషం', 'ఒక్క ప్రశ్న', 'ఇంకో ప్రశ్న'];
      if (!waitWords.some((w) => normCheck.includes(w))) {
        this.session.addTranscript('customer', userText);
        const fare = isTe ? `సరే ${leadHonorific}, చాలా ధన్యవాదాలు, ఉంటాను, బాయ్!` : isHi ? `अलविदा, धन्यवाद!` : `Goodbye, thank you!`;
        await this.speak(fare);
        this.session.finishCall('completed');
        this._finishProcessing();
        return;
      }
      this.isClosing = false;
      if (this.exitTimer) {
        clearTimeout(this.exitTimer);
        this.exitTimer = null;
      }
    }

    if (this.recentAiSpeech.length) {
      const empNameCheck = (this.employee?.name || '').toLowerCase();
      const normUser = userText.toLowerCase().replace(/[.,!?;:()]/g, ' ').replace(/\s+/g, ' ').trim();

      const commonResponses = [
        'hi', 'hello', 'hey', 'yes', 'no', 'yeah', 'yep', 'nope', 'ok', 'okay',
        'హాయ్', 'హలో', 'నమస్కారం', 'నమస్తే', 'అవును', 'లేదు', 'సరే', 'ఉన్నాను', 'చెప్పండి', 'వింటున్నాను', 'అండి',
        'హా', 'హఁ', 'కదా', 'చెప్పండి మేడమ్', 'చెప్పండి సర్',
        'हाँ', 'नमस्ते', 'हेलो', 'हाय', 'जी', 'हाँ जी', 'सुनाई दे रहा है', 'बोलिए',
      ];
      const isCommonResponse = commonResponses.some((r) => normUser === r || normUser.startsWith(r + ' ') || normUser.endsWith(' ' + r));

      // 1. Detect if the transcription is the AI's own self-introduction echoing back
      const isSelfIntroEcho = Boolean(
        empNameCheck && normUser.includes(empNameCheck) && (
          normUser.includes('మాట్లాడుతున్నాను') ||
          normUser.includes('speaking') ||
          normUser.includes('bol') ||
          normUser.includes('హలో నేను')
        )
      );

      // 2. Real acoustic echo check: only discard if NOT a common response and >= 75% character sequence match with recent AI speech.
      const maxEcho = Math.max(...this.recentAiSpeech.map((t) => echoTextScore(userText, t)));
      const isEcho = !isCommonResponse && (isSelfIntroEcho || (maxEcho >= 0.75));

      if (isEcho) {
        console.log(`[pipeline] Discarding genuine self-echo utterance (charEcho=${(maxEcho * 100).toFixed(0)}%, isSelfIntro=${isSelfIntroEcho}): "${userText}"`);
        this._finishProcessing();
        return;
      }
    }

    console.log(`[pipeline] Caller: "${userText}"`);
    this.session.addTranscript('customer', userText);
    this.messages.push({ role: 'user', content: userText });

    const lastAiMsg = (this.messages.slice().reverse().find((m) => m.role === 'assistant')?.content || '').trim();

    // Ultra-compact live telephony prompt (~250-300 tokens) to stay well under rate limits
    const empInstructions = (this.employee?.instructions || '').trim();
    let knowledgeBrief = '';
    const knowledge = this.employeeKnowledge || this.session?.employeeKnowledge || null;
    const kbParts = [];
    if (knowledge?.text?.length) {
      const topK = knowledge.text.slice(0, 2).map((k) => `${k.title ? `${k.title}: ` : ''}${k.content}`).join('; ');
      kbParts.push(`కంపెనీ/సర్వీస్ సమాచారం: ${topK}`);
    }
    if (knowledge?.faqs?.length) {
      const topF = knowledge.faqs.slice(0, 3).map((f) => `Q: ${f.question} A: ${f.answer}`).join(' | ');
      kbParts.push(`తరచూ అడిగే ప్రశ్నలు: ${topF}`);
    }
    if (kbParts.length > 0) {
      knowledgeBrief = `\n${kbParts.join('\n')}`;
    }

    const empRole = (this.employee?.role || (isTe ? 'ప్రతినిధి' : isHi ? 'प्रतिनिधि' : 'Representative')).trim();
    const empObjective = (this.employee?.objective || this.employee?.description || leadPurpose || (isTe ? 'కస్టమర్ అవసరాలను తెలుసుకుని తగిన సమాచారం మరియు సహాయం అందించడం' : isHi ? 'ग्राहक की आवश्यकताओं को समझना और सहायता प्रदान करना' : 'Understand customer requirements and provide assistance')).trim();

    let systemPrompt = isTe
      ? `మీరు ${company} లో నిజమైన మానవ ప్రతినిధి (${empName} - ${empRole}). ఎప్పుడూ AI, రోబోట్ లేదా కంప్యూటర్ లాగా మాట్లాడవద్దు.
మీ పాత్ర: ${empRole}.
కాల్ ఉద్దేశ్యం: "${leadPurpose || empObjective}".
కస్టమర్ పేరు: ${leadName ? `${leadName} (${leadHonorific})` : 'గౌరవనీయ కస్టమర్'}.
${empInstructions ? `\nఉద్యోగి ప్రత్యేక ఆదేశాలు (Strictly follow):\n${empInstructions}` : ''}${knowledgeBrief}

లైవ్ ఫోన్ సంభాషణ & కాలింగ్ నియమాలు:
1. సంభాషణ శైలి: 100% సహజమైన తెలుగు. ప్రతి సమాధానం కేవలం 1 లేదా 2 చిన్న వాక్యాలు (12-18 పదాలు మాత్రమే). స్పష్టంగా, మర్యాదగా మాట్లాడండి.
2. తొలి పరిచయం & అనుమతి: కస్టమర్ మాట్లాడటానికి అనుమతిస్తే ("చెప్పండి", "మాట్లాడండి", "హా", "yes", "sure"), "ధన్యవాదాలు ${leadHonorific}!" అని చెప్పి, మీ పాత్ర (${empRole}) మరియు కాల్ ఉద్దేశ్యం (${leadPurpose || empObjective}) కి సంబంధించిన మొదటి చిన్న ప్రశ్నను మాత్రమే అడగండి. ఇతర అసంబద్ధ విషయాలు మాట్లాడవద్దు.
3. డైనమిక్ క్వాలిఫికేషన్ (One Question at a Time): ఎప్పుడూ ఒకేసారి ఒకే చిన్న ప్రశ్న అడగండి. కస్టమర్ సమాధానం ఇచ్చిన తర్వాతే తదుపరి ప్రశ్నను అడగండి. చెప్పిన సమాధానాన్ని మళ్లీ అడగవద్దు.
4. కస్టమర్ స్పందన & అభ్యంతరాల పరిష్కారం:
   - ఆసక్తి చూపితే: మీ సేవలకు సంబంధించిన వివరాలు తెలిపి, తదుపరి చర్య / అపాయింట్‌మెంట్ / డెమో కోసం 2 నిర్దిష్ట సమయాలు ఆఫర్ చేయండి (ఉదా: "రేపు సాయంత్రం 5:30కి లేదా శనివారం ఉదయం 10కి").
   - ధర లేదా ఫీజుల గురించి అడిగితే: కంపెనీ వివరాల ప్రకారం స్పష్టంగా తెలిపి, పూర్తి కొటేషన్ మరియు వివరాలు వాట్సాప్‌లో పంపుతామని చెప్పండి.
   - బిజీగా ఉంటే: "సరేనండి, మిమ్మల్ని డిస్టర్బ్ చేయను. మీకు ఎప్పుడు కాల్ చేయమంటారు?" అని సమయం అడగండి.
   - ఆలోచించుకుంటామంటే: గౌరవించి, వివరాలు వాట్సాప్ చేస్తామని చెప్పండి.
   - వివరాలు వాట్సాప్‌లో పంపమంటే: "తప్పకుండా, మీ నంబర్‌కి పూర్తి వివరాలు వాట్సాప్ చేస్తాను" అని చెప్పండి.
   - ఆసక్తి లేకపోతే ("వద్దు", "నాకు వద్దు", "not interested"): "సరే అండి, మీ సమయానికి ధన్యవాదాలు. ఉంటానండి!" అని చెప్పి వెంటనే కాల్ ముగించండి.
   - కాల్ చేయొద్దు / DNC అంటే: వెంటనే క్షమాపణ చెప్పి నంబర్ తొలగిస్తామని చెప్పి కాల్ ముగించండి.
5. కాల్ ఇప్పటికే ప్రారంభమైంది. మీ పేరు, నమస్కారం, పరిచయం మళ్లీ మళ్లీ ఎప్పుడూ పునరావృతం చేయవద్దు. ఎమోజీలు, నక్షత్రాలు (*) వాడవద్దు. మీ పాత్ర (${empRole}) పరిధిలోనే సమాధానం ఇవ్వండి.`
      : isHi
      ? `आप ${company} में टेलीफोन सलाहकार (${empName} - ${empRole}) हैं। कभी भी AI या रोबोट की तरह बात न करें।
भूमिका: ${empRole}। उद्देश्य: "${leadPurpose || empObjective}"।
ग्राहक: ${leadName ? `${leadName} (${leadHonorific})` : 'ग्राहक'}।
${empInstructions ? `निर्देश:\n${empInstructions}` : ''}${knowledgeBrief}
नियम:
1. केवल 1-2 छोटे वाक्य (12-18 शब्द) में विनम्रता से उत्तर दें।
2. जब ग्राहक "हाँ", "बोलिए", "बताइए" कहे, तो धन्यवाद कहकर अपनी भूमिका (${empRole}) और उद्देश्य के अनुसार पहला प्रश्न पूछें।
3. ग्राहक के सवाल का सीधा उत्तर दें। अगर आगे बढ़ना चाहें तो 2 समय विकल्प दें।
4. अगर फीस/कीमत पूछें तो कंपनी जानकारी के अनुसार बताएं और व्हाट्सएप पर विवरण भेजने की पेशकश करें।
5. अगर व्यस्त हों तो दोबारा कॉल करने का समय पूछें। अगर रुचि न हो तो धन्यवाद कहकर तुरंत कॉल समाप्त करें।
6. कभी भी ग्रीटिंग न दोहराएं। इमोजी या स्टार (*) का उपयोग न करें। अपनी भूमिका (${empRole}) के दायरे में ही रहें।`
      : `You are a real human phone advisor (${empName} - ${empRole}) at ${company}. Never sound like an AI.
Role: ${empRole}. Purpose: "${leadPurpose || empObjective}".
Customer: ${leadName || 'Valued Customer'}.
${empInstructions ? `Instructions:\n${empInstructions}` : ''}${knowledgeBrief}
Rules:
1. Reply in 1-2 concise, natural sentences (12-18 words max).
2. When customer consents ("yes", "tell me", "sure"), thank them and ask the first qualifying question related to your role (${empRole}) and purpose. Never speak about unrelated domains.
3. If interested, provide relevant details and offer 2 specific next-step times.
4. If asked about pricing/fees, provide accurate company info and offer to send details via WhatsApp.
5. If busy, ask for a convenient callback time. If not interested, politely thank them and close immediately.
6. Call is in progress. Never repeat greeting or introduction. No emojis or bullet points. Stay strictly within your role (${empRole}).`;

    const recentAssistantReplies = this.messages
      .filter((m) => m.role === 'assistant')
      .slice(-4)
      .map((m) => String(m.content || '').trim())
      .filter(Boolean);
    if (recentAssistantReplies.length) {
      systemPrompt += `\nDo not repeat any of these previous replies: ${recentAssistantReplies.map((r) => `"${r.slice(0, 80)}"`).join('; ')}. Ask a new follow-up or move the conversation forward.`;
    }

    const isEndingCall = detectEndingIntent(userText, this.messages);
    let reply = '';

    if (isEndingCall) {
      reply = isTe
        ? `సరే ${leadHonorific}, చాలా ధన్యవాదాలు! ఉంటాను, బాయ్!`
        : isHi
        ? `धन्यवाद ${leadHonorific}! आपका दिन शुभ हो, अलविदा!`
        : `Thank you ${leadHonorific}! Have a wonderful day, goodbye!`;
    } else {
      try {
        const llmRes = await this.ai.generateResponse(this.messages.slice(-6), {
          systemPrompt,
          temperature: 0.35,
          maxTokens: 160,
          frequencyPenalty: 0.5,
          presencePenalty: 0.3,
        });
        reply = (llmRes.text || '').replace(/[*_#•-]/g, ' ').replace(/\s+/g, ' ').trim();

        const priorAssistantReplies = this.messages
          .filter((m) => m.role === 'assistant')
          .map((m) => String(m.content || '').trim().toLowerCase())
          .filter(Boolean);
        const isRepeatedReply = priorAssistantReplies.some((prev) => {
          const a = prev;
          const b = reply.trim().toLowerCase();
          if (!a || !b) return false;
          if (a === b) return true;
          if (b.length > 20 && a.includes(b.slice(0, 25))) return true;
          if (a.length > 20 && b.includes(a.slice(0, 25))) return true;
          return false;
        });
        if (isRepeatedReply) {
          reply = isTe
            ? `చెప్పండి ${leadHonorific}, నేను వింటున్నాను. మీకు ఎలా సహాయపడగలను?`
            : isHi
            ? `जी ${leadHonorific}, मैं सुन रही हूँ। बताइए, मैं आपकी क्या सहायता कर सकती हूँ?`
            : `Yes ${leadHonorific}, I am listening. How can I help you today?`;
        }
      } catch (llmErr) {
        console.warn('[pipeline] LLM error:', llmErr.message);
      }

      if (!reply) {
        reply = isTe
          ? `చెప్పండి ${leadHonorific}, నేను వింటున్నాను. మీకు ఎలా సహాయపడగలను?`
          : isHi
          ? `जी ${leadHonorific}, मैं सुन रही हूँ। बताइए, मैं आपकी क्या सहायता कर सकती हूँ?`
          : `Yes ${leadHonorific}, I am listening. How can I help you today?`;
      }
    }

    this.messages.push({ role: 'assistant', content: reply });
    this.session.addTranscript('ai', reply);
    this.recentAiSpeech = [reply];
    await this.speak(reply);

    if (isEndingCall) {
      this.isClosing = true;
      this.clearSilenceTimer();
      const remainingPlaybackMs = Math.max(0, (this.playbackEndTime || Date.now()) - Date.now());
      const waitMs = Math.max(2500, remainingPlaybackMs + 800);
      this.exitTimer = setTimeout(() => {
        this.exitTimer = null;
        this.session.finishCall('completed');
      }, waitMs);
    } else {
      // Arm silence timer so if the customer does not speak for 7.5s, AI asks "Hello sir, are you on the line?"
      this.armSilenceTimer();
    }
    this._finishProcessing();
    } finally {
      this.isProcessingSpeech = false;
      this.pendingAudio = null;
    }
  }

  async speak(text) {
    if (!text || this.session?.finished) return;
    // Wipe stale inbound audio buffers so old echo never leaks into the next turn
    this.audioBuffer = [];
    this.preSpeechBuffer = [];
    this.pendingAudio = null;
    this.isUserSpeaking = false;
    this.speechRun = 0;
    this.voicedFrames = 0;
    this.quietFrames = 0;

    this.isAiSpeaking = true;
    this.lastSpeakStart = Date.now();
    this._bargeInLogged = false;
    this._bargedIn = false;

    let pcmBytes = 0;
    try {
      const langCode = this.employee?.language_code || 'te-IN';
      const iterator = this.resolveVoiceProvider().streamSynthesize(text, {
        voice: this.employee?.voice || undefined,
        language: langCode,
        speed: this.employee?.voice_speed || 1.0,
      });

      const FRAME = 480;
      let carry = Buffer.alloc(0);
      for await (const mulawChunk of iterator) {
        if (!this.isAiSpeaking || this._bargedIn) break;
        if (mulawChunk.length > 0) {
          pcmBytes += mulawChunk.length;
          const buffered = carry.length > 0 ? Buffer.concat([carry, mulawChunk]) : mulawChunk;
          const nFrames = Math.floor(buffered.length / FRAME);
          for (let i = 0; i < nFrames; i++) {
            if (!this.isAiSpeaking || this._bargedIn) break;
            const frame = buffered.subarray(i * FRAME, (i + 1) * FRAME);
            this.session.sendAudioFrame(frame);
          }
          carry = buffered.subarray(nFrames * FRAME);
          await sleep(2);
        }
      }
      if (carry.length > 0 && !this._bargedIn && this.isAiSpeaking) {
        pcmBytes += carry.length;
        this.session.sendAudioFrame(carry);
      }
    } catch (err) {
      console.warn('[pipeline] TTS streaming warning:', err.message);
    } finally {
      const spokenMs = Math.round(pcmBytes / 8);
      if (text) {
        this.recentAiSpeech.push(text);
        if (this.recentAiSpeech.length > 8) this.recentAiSpeech.shift();
      }
      this.isAiSpeaking = false;
      if (this._bargedIn) {
        this.playbackEndTime = 0;
      } else {
        const estimatedEnd = this.lastSpeakStart + spokenMs;
        this.playbackEndTime = Math.max(Date.now(), estimatedEnd);
      }
      this.audioBuffer = [];
      this.preSpeechBuffer = [];
      this.bargeInBuffer = [];
      this.pendingAudio = null;
    }
  }

  handleDtmf(digit) {
    if (!this.isAiSpeaking) return;
    this.session.clearAudioBuffer();
  }

  async close() {
    await super.close();
    this.clearSilenceTimer();
    if (this.exitTimer) clearTimeout(this.exitTimer);
  }
}

module.exports = PipelineEngine;

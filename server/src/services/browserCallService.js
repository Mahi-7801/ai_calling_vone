const WebSocket = require('ws');
const { queryOne, insert, update } = require('../config/db');
const { resolveSocketIdentity } = require('./socketAuth');
const { getAIProvider } = require('../providers');
const { SarvamProvider } = require('../providers/voice/sarvam');
const { DeepgramProvider } = require('../providers/voice/deepgram');
const realtime = require('./realtime');
const { buildSystemPrompt, loadEmployeeKnowledge } = require('./systemPrompt');

/**
 * Live call between a browser tab and an AI employee.
 *
 * Wire format mirrors the carrier media stream so the turn-taking logic is
 * shared with it: the browser sends {type:'audio', payload:<base64 mulaw>} at
 * 8kHz and receives {type:'audio', payload:<base64 mulaw>}. Unlike the carrier
 * path this is authenticated with the user's JWT, because a browser can reach it
 * directly and it must never process audio for an employee in another tenant.
 *
 * The browser does the VAD/turn-taking framing, so this side only has to
 * transcribe each utterance, answer it, and stream the reply back as it is
 * synthesized.
 */
class BrowserCallSession {
  constructor({ ws, user, org, employeeId, callId }) {
    this.ws = ws;
    this.user = user;
    this.org = org;
    this.employeeId = employeeId;
    this.callId = callId;
    this.employee = null;
    this.employeeKnowledge = null;
    this.messages = [];
    this.transcript = [];
    this.startTime = Date.now();
    this.dbCallId = null;
    this.closed = false;
    this.isClosing = false;
    this.turnInFlight = false;
    this.ai = getAIProvider('groq');
    this.deepgram = new DeepgramProvider();
    this.sarvam = new SarvamProvider();
  }

  send(data) {
    if (this.closed || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(data));
    } catch (err) {
      console.warn('[browserCall] send failed:', err.message);
    }
  }

  async init() {
    // Scope the employee lookup to the caller's org. A missing or foreign id
    // must not silently fall back to someone else's employee.
    this.employee = await queryOne(
      'SELECT * FROM ai_employees WHERE id = ? AND organization_id = ? AND status != "disabled"',
      [this.employeeId, this.org.id]
    );
    if (!this.employee) {
      this.send({ type: 'error', message: 'Employee not found for this organization.' });
      this.close(1008, 'employee not found');
      return;
    }

    // Same as the PSTN path: knowledge is loaded once per session so the model
    // can actually answer from what the employee was taught.
    try {
      this.employeeKnowledge = await loadEmployeeKnowledge(this.employeeId);
    } catch (err) {
      console.warn(`[browserCall] Could not load knowledge for employee ${this.employeeId}: ${err.message}`);
      this.employeeKnowledge = null;
    }

    try {
      // phone_number is NOT NULL; a browser call has no carrier number, so
      // record the channel itself rather than leaving the column unset.
      const r = await insert(
        'INSERT INTO calls (organization_id, call_id, direction, employee_id, phone_number, status, started_at) VALUES (?,?,?,?,?,?,NOW())',
        [this.org.id, this.callId, 'outbound', this.employeeId, 'browser', 'in_progress']
      );
      this.dbCallId = r.insertId;
    } catch (err) {
      console.warn('[browserCall] could not record call row:', err.message);
    }

    this.send({
      type: 'ready',
      callId: this.callId,
      employee: { id: this.employee.id, name: this.employee.name, voice: this.employee.voice, language: this.employee.language_code },
    });

    realtime.emit(this.org.id, 'call.created', { callId: this.callId, callDbId: this.dbCallId, employeeId: this.employeeId, channel: 'browser' });

    // Greeting the moment the socket opens matches how a carrier call behaves,
    // so the browser conversation starts with the employee speaking.
    const greeting = (this.employee.greeting || 'నమస్కారం! నేను {name}. మీకు ఎలా సహాయపడగలను?')
      .replace('{name}', this.employee.name);
    this.messages.push({ role: 'assistant', content: greeting });
    this.addTranscript('ai', greeting);
    await this.speak(greeting);
  }

  addTranscript(speaker, text) {
    const ts = Math.round((Date.now() - this.startTime) / 1000);
    this.transcript.push({ speaker, text, ts });
    realtime.emit(this.org.id, 'call.transcript', {
      callId: this.callId,
      callDbId: this.dbCallId,
      speaker,
      text,
      ts,
    });
  }

  async handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'audio') {
      if (typeof msg.payload !== 'string' || !msg.payload) return;
      // mu-law @ 8kHz = 8000 bytes/s. Cap a single utterance so a client stuck
      // in a send loop cannot buffer without bound.
      if (msg.payload.length > 8000 * 30 * 1.4) {
        console.warn('[browserCall] oversized audio frame, dropped');
        return;
      }
      await this.handleUtterance(Buffer.from(msg.payload, 'base64'));
      return;
    }

    if (msg.type === 'hangup') {
      await this.finishCall('completed');
      return;
    }

    if (msg.type === 'ping') {
      this.send({ type: 'pong', ts: Date.now() });
    }
  }

  async handleUtterance(mulaw) {
    // The browser frames utterances, but it can still send the next one while
    // this one is being answered. Serialize so replies cannot interleave.
    if (this.turnInFlight || mulaw.length < 800) return; // < 100ms of audio
    this.turnInFlight = true;
    try {
      const wav = mulawToWav(mulaw, 8000);
      let userText = '';
      const langCode = this.employee?.language_code || (
        this.employee?.language === 'Hindi' ? 'hi-IN' :
          this.employee?.language === 'English' ? 'en-IN' :
            this.employee?.language === 'Tamil' ? 'ta-IN' :
              this.employee?.language === 'Kannada' ? 'kn-IN' :
                this.employee?.language === 'Malayalam' ? 'ml-IN' :
                  this.employee?.language === 'Marathi' ? 'mr-IN' : 'te-IN'
      );
      const isoLang = langCode.split('-')[0].toLowerCase();
      let keyterms = [];
      try {
        if (Array.isArray(this.employee?.custom_keyterms)) {
          keyterms = this.employee.custom_keyterms;
        } else if (typeof this.employee?.custom_keyterms === 'string') {
          keyterms = JSON.parse(this.employee.custom_keyterms);
        } else if (this.employee?.livekit_metadata?.custom_keyterms) {
          keyterms = this.employee.livekit_metadata.custom_keyterms;
        }
      } catch {}

      // 1. Primary STT: Deepgram Nova-3 (with custom keyterm recognition)
      if (this.deepgram.isConfigured()) {
        try {
          const dg = await this.deepgram.transcribe(wav, {
            language: isoLang,
            model: 'nova-3',
            keyterms,
          });
          userText = (dg.transcript || '').trim();
        } catch (dgErr) {
          console.warn('[browserCall] Primary Deepgram STT failed:', dgErr.message);
        }
      }

      // 2. Fallback STT: Sarvam Saaras v3
      if (!userText) {
        try {
          const stt = await this.sarvam.transcribe(wav, { language: langCode });
          userText = (stt.transcript || '').trim();
        } catch (sttErr) {
          console.warn('[browserCall] Fallback Sarvam STT failed:', sttErr.message);
        }
      }

      // 3. Fallback STT: Groq Whisper
      if (!userText) {
        try {
          const { GroqProvider } = require('../providers/ai/groq');
          const groq = new GroqProvider();
          const gRes = await groq.transcribe(wav, { language: isoLang, filename: 'browser_call.wav' });
          userText = (gRes.text || '').trim();
        } catch (groqErr) {
          console.warn('[browserCall] Fallback Groq Whisper STT failed:', groqErr.message);
        }
      }

      if (!userText || userText.length < 2) return;

      this.send({ type: 'user_transcript', text: userText });
      this.addTranscript('customer', userText);
      this.messages.push({ role: 'user', content: userText });

      if (this.isClosing) {
        console.log(`[browserCall] Call already in closing state. User acknowledged ("${userText}"). Ending call.`);
        await this.finishCall('completed');
        return;
      }

      const goodbye = [
        'bye', 'బాయ్', 'గుడ్ బాయ్', 'goodbye', 'వద్దు', 'కాల్ కట్', 'కట్ చేయండి',
        'థాంక్యూ', 'థాంక్స్', 'థాంక్స్ అండి', 'థాంక్యూ అండి', 'ధన్యవాదాలు',
        'చాలు', 'అంతే', 'ఏం లేదు'
      ];
      if (this.messages.length >= 2 && goodbye.some((g) => userText.toLowerCase().includes(g))) {
        this.isClosing = true;
        const signoff = (this.employee.goodbye_message || 'ధన్యవాదాలు! మీకు శుభేచ్ఛలు.')
          .replace('{name}', this.employee.name);
        this.messages.push({ role: 'assistant', content: signoff });
        this.addTranscript('ai', signoff);
        await this.speak(signoff);
        await this.finishCall('completed');
        return;
      }

      const systemPrompt = buildSystemPrompt(
        this.employee,
        { name: this.employee.company || 'our company' },
        this.employeeKnowledge,
        this.lead
      );

      const lastAiMsg = (this.messages.slice().reverse().find((m) => m.role === 'assistant')?.content || '').trim();
      const promptToUse = `${systemPrompt}
Instructions for live conversation (REAL HUMAN ADVISOR):
- Speak strictly as a genuine, warm human advisor (${this.employee.name || 'Advisor'}). NEVER sound like a computer or say you are an AI.
- Reply in 1 or 2 concise, polite, natural conversational sentences in ${this.employee.language || 'Telugu'} with respect (అండి).
- Use natural active listening bridges before speaking (e.g. "అవునా అండి!", "ఓహ్ అర్థమైందండి...", "ఖచ్చితంగా అండి!").
- Insert natural commas (,) between spoken clauses so your voice breathes naturally.
- Maximum 15-20 words per response. Keep answers brief and ask at most ONE simple question, then pause for the caller.
- CRITICAL ANTI-REPETITION RULES:
  * NEVER repeat your previous greeting, question, or sentence.
  ${lastAiMsg ? `* You just said: "${lastAiMsg.slice(0, 80)}...". Do not repeat this!` : ''}
  * If the user confirmed with "ఓకే", "సరే", "హా", conclude the booking/demo warmly and thank them.`;

      let reply = '';
      const stream = typeof this.ai.streamResponse === 'function'
        ? this.ai.streamResponse(this.messages.slice(-8), {
            systemPrompt: promptToUse,
            temperature: 0.35,
            maxTokens: 220,
            frequencyPenalty: 0.6,
            presencePenalty: 0.4,
          })
        : null;

      if (stream) {
        for await (const delta of stream) {
          if (this.closed) return;
          reply += delta;
          this.send({ type: 'ai_delta', text: delta });
        }
      } else {
        const res = await this.ai.generateResponse(this.messages.slice(-8), {
          systemPrompt: promptToUse,
          temperature: 0.35,
          maxTokens: 220,
          frequencyPenalty: 0.6,
          presencePenalty: 0.4,
        });
        reply = res.text || '';
        this.send({ type: 'ai_delta', text: reply });
      }

      if (!reply) return;

      // Loop breaker
      if (lastAiMsg && reply && (
        reply === lastAiMsg ||
        (reply.length > 25 && lastAiMsg.includes(reply.slice(0, 30))) ||
        (lastAiMsg.length > 25 && reply.includes(lastAiMsg.slice(0, 30)))
      )) {
        console.warn('[browserCall] Repetition loop detected! Breaking loop.');
        reply = 'చాలా సంతోషం అండి! వివరాలు మరియు లింక్ వెంటనే మీ వాట్సాప్‌కి పంపిస్తాము, ధన్యవాదాలు!';
      }

      this.messages.push({ role: 'assistant', content: reply });
      this.addTranscript('ai', reply);
      await this.speak(reply);
    } catch (err) {
      console.warn('[browserCall] turn error:', err.message);
      this.send({ type: 'error', message: 'Something went wrong handling that. Try again.' });
    } finally {
      this.turnInFlight = false;
    }
  }

  /**
   * Pick the provider this employee is actually configured to use.
   *
   * Previously this always called Cartesia, so an employee set to Sarvam (whose
   * bulbul voices are the ones built for Telugu and the other Indian languages)
   * was read in the wrong voice. A cloned Sarvam voice is also only reachable
   * through Sarvam, so the declared provider has to be respected.
   */
  resolveVoiceProvider() {
    const { resolveVoiceProvider } = require('../providers');
    const declared = this.employee?.voice_provider || null;
    try {
      return resolveVoiceProvider(this.employee?.voice || null, declared);
    } catch (err) {
      console.warn('[browserCall] voice provider resolution failed, falling back:', err.message);
      const { getVoiceProvider } = require('../providers');
      return getVoiceProvider(declared);
    }
  }

  // Stream the employee's voice as mu-law frames, the same encoding the browser
  // mic sends, so playback needs no conversion on either side.
  async speak(text) {
    this.send({ type: 'ai_speaking_start', text });
    const provider = this.resolveVoiceProvider();
    const name = provider?.constructor?.name || 'unknown';
    try {
      if (typeof provider?.streamSynthesize !== 'function') {
        throw new Error(`${name} has no streaming synthesis`);
      }
      const langCode = this.employee?.language_code || (
        this.employee?.language === 'Hindi' ? 'hi-IN' :
          this.employee?.language === 'English' ? 'en-IN' :
            this.employee?.language === 'Tamil' ? 'ta-IN' :
              this.employee?.language === 'Kannada' ? 'kn-IN' :
                this.employee?.language === 'Malayalam' ? 'ml-IN' :
                  this.employee?.language === 'Marathi' ? 'mr-IN' : 'te-IN'
      );
      const iterator = provider.streamSynthesize(text, {
        voice: this.employee?.voice || undefined,
        language: langCode,
        speed: this.employee?.voice_speed || 1.0,
      });
      for await (const chunk of iterator) {
        if (this.closed) return;
        if (chunk && chunk.length) this.send({ type: 'audio', payload: chunk.toString('base64') });
      }
    } catch (err) {
      console.warn(`[browserCall] TTS stream failed via ${name}:`, err.message);
      this.send({ type: 'tts_failed', message: 'Could not synthesize that reply.' });
    } finally {
      this.send({ type: 'ai_speaking_end' });
    }
  }

  async finishCall(status = 'completed') {
    if (this.closed) return;
    const duration = Math.max(1, Math.round((Date.now() - this.startTime) / 1000));
    this.send({ type: 'ended', callId: this.callId, duration, status });

    if (this.dbCallId) {
      // Persist the transcript before marking the call complete, so a failure
      // cannot leave a "completed" call with no readable conversation.
      for (const item of this.transcript) {
        await insert('INSERT INTO call_transcripts (call_id, speaker, text, ts) VALUES (?,?,?,?)',
          [this.dbCallId, item.speaker, item.text, item.ts || 0]).catch(() => { });
      }
      await update(
        'UPDATE calls SET duration = ?, status = ?, ended_at = NOW() WHERE id = ?',
        [duration, status, this.dbCallId]
      ).catch(() => { });
      await this.analyze().catch(() => { });
    }

    realtime.emit(this.org.id, 'call.completed', {
      callId: this.callId,
      callDbId: this.dbCallId,
      status,
      duration,
      employeeId: this.employeeId,
      channel: 'browser',
    });
    this.close(1000, 'call ended');
  }

  async analyze() {
    if (!this.dbCallId || this.transcript.length < 2) return;
    const ai = getAIProvider();
    const result = await ai.analyzeCall(this.transcript, this.employee);
    await update(
      'UPDATE calls SET summary = ?, sentiment = ?, outcome = ? WHERE id = ?',
      [result.summary || null, result.sentiment || null, result.outcome || null, this.dbCallId]
    ).catch(() => { });
    realtime.emit(this.org.id, 'call.analyzed', {
      callId: this.callId,
      callDbId: this.dbCallId,
      summary: result.summary,
      sentiment: result.sentiment,
      outcome: result.outcome,
    });
  }

  close(code = 1000, reason = 'closed') {
    this.closed = true;
    try {
      if (this.ws.readyState === WebSocket.OPEN) this.ws.close(code, reason);
    } catch { /* already closing */ }
  }
}

function mulawToWav(mulaw, sampleRate = 8000) {
  const byteRate = sampleRate; // 1 byte/sample, mono
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + mulaw.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(7, 20); // 7 = mu-law
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write('data', 36);
  header.writeUInt32LE(mulaw.length, 40);
  return Buffer.concat([header, mulaw]);
}

// Delegates to the shared resolver so the browser socket and the realtime
// socket derive org/role from the user row in exactly one place.
function resolveIdentity(token) {
  return resolveSocketIdentity(token, { requireOrg: true });
}

function handleBrowserCallConnection(ws, req) {
  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);
  // /ws/browser/<employeeId>/<callId>
  const employeeId = parseInt(parts[2] || '0', 10);
  const callId = parts[3] || `browser_${Date.now()}`;

  // A browser closing a tab resets the socket mid-handshake, so a failed verify
  // is routine. Log it and drop the connection without touching the process.
  resolveIdentity(url.searchParams.get('token')).then((identity) => {
    if (!identity) {
      console.warn('[browserCall] rejected unauthenticated connection');
      try {
        ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized.' }));
        ws.close(1008, 'unauthorized');
      } catch { /* already gone */ }
      return;
    }
    if (!employeeId) {
      try {
        ws.send(JSON.stringify({ type: 'error', message: 'employeeId is required.' }));
        ws.close(1008, 'bad request');
      } catch { /* already gone */ }
      return;
    }

    const session = new BrowserCallSession({
      ws,
      user: identity.user,
      org: identity.org,
      employeeId,
      callId,
    });
    session.init().catch((err) => console.error('[browserCall] init error:', err.message));

    ws.on('message', (raw) => {
      session.handleMessage(raw).catch((err) => console.warn('[browserCall] message error:', err.message));
    });
    ws.on('close', () => {
      // A dropped socket still ends the call and persists what was said.
      if (!session.closed) session.finishCall('completed').catch(() => { });
    });
    ws.on('error', (err) => {
      if (err?.code !== 'ECONNRESET' && !/aborted|reset/i.test(err?.message || '')) {
        console.error('[browserCall] socket error:', err.message);
      }
    });

    // Same reasoning as the carrier socket: a media stream that goes quiet
    // mid-call is indistinguishable from an idle one, so ping to reap it.
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    const hb = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return clearInterval(hb);
      if (ws.isAlive === false) return clearInterval(hb);
      ws.isAlive = false;
      try { ws.ping(); } catch { clearInterval(hb); }
    }, 20000);
    if (hb.unref) hb.unref();
    ws.on('close', () => clearInterval(hb));
  }).catch((err) => console.error('[browserCall] auth error:', err.message));
}

module.exports = { BrowserCallSession, handleBrowserCallConnection };

const express = require('express');
const multer = require('multer');
const { query, queryOne, insert, update, withTransaction } = require('../config/db');
const { asyncHandler, safeJson, parseBool } = require('../utils/helpers');
const { AppError } = require('../utils/errors');
const { requireOrg, optionalAuth } = require('../middleware/auth');
const { ensureOrgOwned } = require('../middleware/tenant');
const { buildSystemPrompt, loadEmployeeKnowledge } = require('../services/systemPrompt');
const { getAIProvider, getVoiceProvider } = require('../providers');
const { audit } = require('../services/activity');
const { startInstantCall } = require('../services/callService');
const realtime = require('../services/realtime');
const { buildAiEmployeeFromPrompt } = require('../services/employeeBuilder');
const { storeSample, resolveSample, removeSample, isPlayableUrl, contentTypeFor } = require('../services/voiceSampleStore');
const { toCloneReadyAudio } = require('../services/audioNormalize');
const { createVoiceClone, cloneProviderOrder } = require('../services/voiceCloning');
const { syncCartesiaAgent, deleteCartesiaAgent } = require('../services/cartesiaAgentService');
const config = require('../config/env');

const router = express.Router();

// Serves voice preview audio from disk. Registered before requireOrg so standard
// browser <audio> tags (which do not pass custom Authorization headers) can load
// previews cleanly without receiving 401 Unauthorized.
router.get('/voice-samples/:file', (req, res) => {
  const fullPath = resolveSample(req.params.file);
  if (!fullPath) return res.status(404).send('Audio sample not found');
  res.set({
    'Content-Type': contentTypeFor(req.params.file),
    'Cache-Control': 'public, max-age=86400',
    'Accept-Ranges': 'bytes',
  });
  res.sendFile(fullPath);
});

const defaultLanguageGreetings = {
  Telugu: 'నమస్కారం! నేను మీ AI అసిస్టెంట్‌ని. నా వాయిస్ మీకు ఎలా వినిపిస్తుంది?',
  'te-IN': 'నమస్కారం! నేను మీ AI అసిస్టెంట్‌ని. నా వాయిస్ మీకు ఎలా వినిపిస్తుంది?',
  te: 'నమస్కారం! నేను మీ AI అసిస్టెంట్‌ని. నా వాయిస్ మీకు ఎలా వినిపిస్తుంది?',
  Hindi: 'नमस्ते! मैं आपका AI असिस्टेंट हूँ। मेरी आवाज़ आपको कैसी लग रही है?',
  'hi-IN': 'नमस्ते! मैं आपका AI असिस्टेंट हूँ। मेरी आवाज़ आपको कैसी लग रही है?',
  hi: 'नमस्ते! मैं आपका AI असिस्टेंट हूँ। मेरी आवाज़ आपको कैसी लग रही है?',
  Tamil: 'வணக்கம்! நான் உங்கள் AI உதவியாளர். எனது குரல் எப்படி இருக்கிறது?',
  'ta-IN': 'வணக்கம்! நான் உங்கள் AI உதவியாளர். எனது குரல் எப்படி இருக்கிறது?',
  ta: 'வணக்கம்! நான் உங்கள் AI உதவியாளர். எனது குரல் எப்படி இருக்கிறது?',
  Kannada: 'ನಮಸ್ಕಾರ! ನಾನು ನಿಮ್ಮ AI ಸಹಾಯಕ. ನನ್ನ ಧ್ವನಿ ಹೇಗಿದೆ?',
  'kn-IN': 'ನಮಸ್ಕಾರ! ನಾನು ನಿಮ್ಮ AI ಸಹಾಯಕ. ನನ್ನ ಧ್ವನಿ ಹೇಗಿದೆ?',
  kn: 'ನಮಸ್ಕಾರ! ನಾನು ನಿಮ್ಮ AI ಸಹಾಯಕ. ನನ್ನ ಧ್ವನಿ ಹೇಗಿದೆ?',
  Malayalam: 'നമസ്കാരം! ഞാൻ നിങ്ങളുടെ AI അസിസ്റ്റന്റാണ്. എന്റെ ശബ്ദം എങ്ങനെയുണ്ട്?',
  'ml-IN': 'നമസ്കാരം! ഞാൻ നിങ്ങളുടെ AI അസിസ്റ്റന്റാണ്. എന്റെ ശബ്ദം എങ്ങനെയുണ്ട്?',
  ml: 'നമസ്കാരം! ഞാൻ നിങ്ങളുടെ AI അസിസ്റ്റന്റാണ്. എന്റെ ശബ്ദം എങ്ങനെയുണ്ട്?',
  Marathi: 'नमस्कार! मी तुमचा AI सहाय्यक आहे. माझा आवाज तुम्हाला कसा वाटतो?',
  'mr-IN': 'नमस्कार! मी तुमचा AI सहाय्यक आहे. माझा आवाज तुम्हाला कसा वाटतो?',
  mr: 'नमस्कार! मी तुमचा AI सहाय्यक आहे. माझा आवाज तुम्हाला कसा वाटतो?',
  English: 'Hello! I am your AI assistant. How does this voice sound to you?',
  'en-IN': 'Hello! I am your AI assistant. How does this voice sound to you?',
  en: 'Hello! I am your AI assistant. How does this voice sound to you?',
  Spanish: '¡Hola! Soy tu asistente de inteligencia artificial. ¿Cómo suena esta voz?',
  es: '¡Hola! Soy tu asistente de inteligencia artificial. ¿Cómo suena esta voz?',
  French: 'Bonjour ! Je suis votre assistant virtuel. Comment trouvez-vous cette voix ?',
  fr: 'Bonjour ! Je suis votre assistant virtuel. Comment trouvez-vous cette voix ?',
  German: 'Hallo! Ich bin Ihr KI-Assistent. Wie klingt diese Stimme für Sie?',
  de: 'Hallo! Ich bin Ihr KI-Assistent. Wie klingt diese Stimme für Sie?',
  Japanese: 'こんにちは！私はAIアシスタントです。この声の調子はいかがですか？',
  ja: 'こんにちは！私はAIアシスタントです。この声の調子はいかがですか？',
};

const langCodeMap = {
  Telugu: 'te-IN',
  Hindi: 'hi-IN',
  Tamil: 'ta-IN',
  Kannada: 'kn-IN',
  Malayalam: 'ml-IN',
  Marathi: 'mr-IN',
  English: 'en-IN',
};

// Map UI voice codes to Sarvam speaker voices
const codeToSpeakerMap = {
  P01: 'kavya',
  P02: 'aditya',
  P06: 'priya',
  P07: 'mohit',
  P09: 'vijay',
  S01: 'rohan',
  S02: 'suhani',
  S03: 'rohan',
  S04: 'kavitha',
  S36: 'shruti',
  S39: 'suhani',
  V01: 'kavitha',
  V02: 'rehan',
  V05: 'ritu',
};

async function synthesizeVoiceSample({ text, voice, voiceId, language, provider, speed = 1, pitch = 1, gender = 'female' }) {
  const chosenVoice = voice || voiceId || 'kavya';
  const langKey = language || 'Telugu';
  const normLang = langCodeMap[langKey] || (langKey.includes('-') ? langKey : `${langKey}-IN`);
  const sampleText = (text && text.trim()) ? text.trim() : (defaultLanguageGreetings[langKey] || defaultLanguageGreetings[normLang] || defaultLanguageGreetings.English || 'Hello! I am your AI voice assistant.');

  let speakerOrVoice = String(chosenVoice);
  if (speakerOrVoice.includes(':')) {
    const [prefix, rest] = speakerOrVoice.split(':');
    speakerOrVoice = rest || prefix;
  }
  speakerOrVoice = codeToSpeakerMap[speakerOrVoice] || speakerOrVoice;

  const { isClonedVoiceId } = require('../providers/voice/sarvam');
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isSarvamClone = isClonedVoiceId(speakerOrVoice);
  const isCartesiaVoice = !isSarvamClone && (
    UUID_RE.test(speakerOrVoice) || provider === 'cartesia'
  );

  const primaryProvider = isSarvamClone ? 'sarvam' : (isCartesiaVoice ? 'cartesia' : (provider || 'sarvam'));
  const secondaryProvider = isSarvamClone ? null : (primaryProvider === 'cartesia' ? 'sarvam' : 'cartesia');

  let lastError = null;

  // Try primary provider
  try {
    const prov = getVoiceProvider(primaryProvider);
    if (primaryProvider === 'cartesia') {
      const cLang = normLang.split('-')[0].toLowerCase();
      const audio = await prov.synthesize(sampleText, {
        voice: speakerOrVoice,
        language: cLang,
        speed,
        pitch,
        container: 'wav',
      });
      if (audio?.buffer) {
        const sampleUrl = storeSample(audio.buffer, speakerOrVoice);
        return { success: true, audioUrl: sampleUrl, contentType: 'audio/wav', provider: primaryProvider };
      }
      if (audio?.audioUrl) return { success: true, audioUrl: audio.audioUrl, contentType: audio.contentType, provider: primaryProvider };
    } else {
      const audio = await prov.synthesize(sampleText, {
        voice: speakerOrVoice,
        language: normLang,
        speed,
        pitch,
        gender,
      });
      if (audio?.audioUrl) return { success: true, audioUrl: audio.audioUrl, contentType: audio.contentType, provider: primaryProvider };
    }
  } catch (err) {
    console.warn(`[voice-sample] Primary (${primaryProvider}) failed:`, err.message);
    lastError = err;
  }

  // Fallback to secondary provider
  if (secondaryProvider) {
    try {
      const prov = getVoiceProvider(secondaryProvider);
      if (secondaryProvider === 'cartesia') {
        const cLang = normLang.split('-')[0].toLowerCase();
        const audio = await prov.synthesize(sampleText, {
          voice: '76961778-5ce4-4aa9-9cdf-66a029d61a8f',
          language: cLang,
          speed,
          pitch,
        });
        if (audio?.audioUrl) return { success: true, audioUrl: audio.audioUrl, contentType: audio.contentType, provider: secondaryProvider };
      } else {
        const audio = await prov.synthesize(sampleText, {
          voice: 'kavya',
          language: normLang,
          speed,
          pitch,
          gender,
        });
        if (audio?.audioUrl) return { success: true, audioUrl: audio.audioUrl, contentType: audio.contentType, provider: secondaryProvider };
      }
    } catch (err) {
      console.warn(`[voice-sample] Secondary (${secondaryProvider}) fallback failed:`, err.message);
      lastError = err;
    }
  }

  throw new AppError(`Voice synthesis failed: ${lastError?.message || 'Unknown error'}`, 502, 'TTS_FAILED');
}

// Voices Catalog - Accessible to all (optionalAuth includes private clones if logged in)
router.get('/voices', optionalAuth, asyncHandler(async (req, res) => {
  const sarvam = await getVoiceProvider('sarvam').getVoices().catch(() => []);
  const cartesia = await getVoiceProvider('cartesia').getVoices().catch(() => []);
  const orgId = req.user?.organization_id;
  const dbClones = orgId ? await query('SELECT * FROM voice_clones WHERE organization_id = ? ORDER BY created_at DESC', [orgId]).catch(() => []) : [];

  const cloned = (dbClones || []).map((c) => ({
    id: c.voice_id || `clone_${c.id}`,
    name: `${c.name} (My Cloned Voice)`,
    language: c.language ? (c.language.includes('-') ? c.language : `${c.language}-IN`) : 'te-IN',
    language_code: c.language || 'te',
    language_name: 'Telugu',
    gender: c.gender || 'custom',
    description: c.description || 'Personal neural cloned voice',
    provider: 'cartesia',
    tier: 'cloned',
    rate: 10.0,
    badge: 'My Cloned Voice',
    is_cloned: true,
    sample_url: c.sample_url,
  }));

  const all = [...cloned, ...cartesia, ...sarvam];
  res.json({ success: true, voices: { sarvam, cartesia, cloned, all } });
}));

// Voice preview synthesis
router.post('/voice-sample', optionalAuth, asyncHandler(async (req, res) => {
  const result = await synthesizeVoiceSample(req.body);
  res.json(result);
}));

router.post('/test-voice-sample', optionalAuth, asyncHandler(async (req, res) => {
  const result = await synthesizeVoiceSample(req.body);
  res.json(result);
}));

// Mint short-lived access token for browser applications per Cartesia security standards
router.post('/cartesia-access-token', optionalAuth, asyncHandler(async (req, res) => {
  const cartesia = getVoiceProvider('cartesia');
  const tokenData = await cartesia.createAccessToken({
    grants: req.body.grants || { tts: true, stt: true },
    expiresIn: req.body.expires_in || 300,
  });
  res.json({ success: true, ...tokenData });
}));

router.use(requireOrg);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Turn a provider error into something the user can act on without exposing internal provider names.
function buildCloneFailureMessage(err) {
  let msg = err?.message || 'Voice cloning failed.';
  return msg.replace(/\b(sarvam|cartesia):\s*/gi, '').trim();
}

const EMPLOYEE_FIELDS = [
  'name', 'role', 'description', 'department', 'persona', 'language', 'language_code',
  'personality', 'tone', 'speaking_style', 'formality', 'greeting', 'objective', 'never_say', 'instructions',
  'system_prompt',
  'max_call_duration', 'retry_attempts', 'call_timeout', 'goodbye_message', 'working_hours',
  'record_calls', 'transcript_enabled', 'human_transfer', 'outcome_detection', 'custom_message',
  'voice_provider', 'voice', 'voice_speed', 'voice_pitch', 'voice_stability', 'voice_naturalness',
  'ambient_sound', 'ambient_volume', 'ambient_enabled',
  'status', 'livekit_agent_name', 'livekit_metadata', 'cartesia_agent_id',
];


function pickEmployee(input) {
  const o = {};
  for (const f of EMPLOYEE_FIELDS) {
    if (input[f] !== undefined) o[f] = input[f];
  }
  if (o.greeting === undefined && input.welcome_message !== undefined) {
    o.greeting = input.welcome_message;
  }
  if (o.never_say === undefined) {
    if (input.neverSay !== undefined) o.never_say = input.neverSay;
    else if (input.neversay !== undefined) o.never_say = input.neversay;
  }
  if (o.goodbye_message === undefined) {
    if (input.goodbyeMessage !== undefined) o.goodbye_message = input.goodbyeMessage;
    else if (input.goodbyemessage !== undefined) o.goodbye_message = input.goodbyemessage;
  }
  if (o.language_code === undefined) {
    if (input.languageCode !== undefined) o.language_code = input.languageCode;
    else if (input.languagecode !== undefined) o.language_code = input.languagecode;
  }
  if (o.voice_provider === undefined) {
    if (input.voiceProvider !== undefined) o.voice_provider = input.voiceProvider;
    else if (input.voiceprovider !== undefined) o.voice_provider = input.voiceprovider;
  }
  if (input.language && !o.language_code) {
    o.language_code = input.language === 'Telugu' ? 'te-IN' : input.language === 'Hindi' ? 'hi-IN' : 'en-IN';
  }
  for (const b of ['record_calls', 'transcript_enabled', 'human_transfer', 'outcome_detection']) {
    if (o[b] !== undefined) o[b] = parseBool(o[b]) ? 1 : 0;
  }
  for (const n of ['max_call_duration', 'retry_attempts', 'call_timeout']) {
    if (o[n] !== undefined) o[n] = parseInt(o[n], 10) || 600;
  }
  for (const f of ['voice_speed', 'voice_pitch', 'voice_stability', 'voice_naturalness']) {
    if (o[f] !== undefined) o[f] = parseFloat(o[f]) || null;
  }
  if (o.working_hours && typeof o.working_hours !== 'string') o.working_hours = JSON.stringify(o.working_hours);
  return o;
}

function buildInsertSql(obj) {
  const keys = Object.keys(obj);
  const cols = keys.join(', ');
  const ph = keys.map(() => '?').join(', ');
  return { cols, ph, values: Object.values(obj) };
}

async function loadEmployeeDetail(id, orgId) {
  const emp = await queryOne(
    `SELECT e.*,
       (SELECT COUNT(*) FROM calls c WHERE c.employee_id = e.id) AS call_count,
       (SELECT COUNT(*) FROM calls c WHERE c.employee_id = e.id AND c.status = 'completed' AND c.duration > 0) AS answered_count,
       (SELECT IFNULL(ROUND(AVG(duration)),0) FROM calls c WHERE c.employee_id = e.id AND c.status = 'completed' AND c.duration > 0) AS avg_duration_actual
     FROM ai_employees e WHERE e.id = ? AND e.organization_id = ?`,
    [id, orgId]
  );
  if (!emp) throw new AppError('Employee not found', 404, 'NOT_FOUND');
  emp.total_calls = Number(emp.call_count ?? emp.total_calls ?? 0);
  emp.successful_calls = Number(emp.answered_count ?? emp.successful_calls ?? 0);
  emp.avg_duration = Number(emp.avg_duration_actual ?? emp.avg_duration ?? 0);
  emp.working_hours = safeJson(emp.working_hours, null);
  emp.cartesia_agent_url = emp.cartesia_agent_id ? `https://play.cartesia.ai/agents/${emp.cartesia_agent_id}` : null;
  const [faqs, docs, knowledge, scripts, examples, versions, numbers] = await Promise.all([
    query('SELECT * FROM employee_faqs WHERE employee_id = ? ORDER BY id DESC', [id]),
    query('SELECT * FROM employee_documents WHERE employee_id = ? ORDER BY id DESC', [id]),
    query('SELECT * FROM employee_knowledge WHERE employee_id = ? ORDER BY id DESC', [id]),
    query('SELECT * FROM employee_scripts WHERE employee_id = ? ORDER BY id DESC', [id]),
    query('SELECT * FROM employee_examples WHERE employee_id = ? ORDER BY id DESC', [id]),
    query('SELECT * FROM employee_versions WHERE employee_id = ? ORDER BY version DESC', [id]),
    query('SELECT * FROM phone_numbers WHERE employee_id = ? AND organization_id = ?', [id, orgId]),
  ]);
  const cartesia_agent_url = emp.cartesia_agent_id ? `https://play.cartesia.ai/agents/${emp.cartesia_agent_id}` : null;
  return { ...emp, cartesia_agent_url, faqs, docs, knowledge, scripts, examples, versions, numbers, training_updated_at: emp.updated_at };
}

router.get('/', asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const deletedRows = await query('SELECT employee_id FROM deleted_employees WHERE organization_id = ?', [orgId]).catch(() => []);
  const deletedSet = new Set(deletedRows.map((r) => String(r.employee_id)));

  // 1. Fetch local PostgreSQL employees with live call stats
  const employees = await query(
    `SELECT e.*,
       (SELECT COUNT(*) FROM calls c WHERE c.employee_id = e.id) AS call_count,
       (SELECT COUNT(*) FROM calls c WHERE c.employee_id = e.id AND c.status = 'completed' AND c.duration > 0) AS answered_count,
       (SELECT IFNULL(ROUND(AVG(duration)),0) FROM calls c WHERE c.employee_id = e.id AND c.status='completed' AND c.duration > 0) AS avg_duration_actual
     FROM ai_employees e
     WHERE e.organization_id = ? ORDER BY e.created_at DESC`,
    [orgId]
  ).catch(() => []);

  const filteredLocal = employees.filter((e) => !deletedSet.has(String(e.id)));
  const numbers = await query('SELECT * FROM phone_numbers WHERE organization_id = ?', [orgId]).catch(() => []);
  const counts = {};
  for (const n of numbers) counts[n.employee_id || 'none'] = n.number;

  const localList = filteredLocal.map((e) => ({
    ...e,
    total_calls: Number(e.call_count ?? e.total_calls ?? 0),
    successful_calls: Number(e.answered_count ?? e.successful_calls ?? 0),
    avg_duration: Number(e.avg_duration_actual ?? e.avg_duration ?? 0),
    working_hours: safeJson(e.working_hours, null),
    assigned_number: counts[e.id] || null,
    cartesia_agent_url: e.cartesia_agent_id ? `https://play.cartesia.ai/agents/${e.cartesia_agent_id}` : null,
  }));

  // 2. Fetch Outpero employees if configured
  let outperoList = [];
  const outpero = require('../services/outperoService');
  if (outpero.isConfigured()) {
    try {
      const opEmployees = await outpero.listEmployees();
      const activeOp = (opEmployees || []).filter((e) => !deletedSet.has(String(e.id)));
      outperoList = activeOp.map((e) => ({
        id: e.id,
        organization_id: orgId,
        name: e.name,
        avatar_url: null,
        role: e.role,
        description: e.role,
        mode: e.mode,
        language: String(e.language || 'te-IN').slice(0, 2).toUpperCase() === 'TE' ? 'Telugu'
          : String(e.language || '').slice(0, 2).toUpperCase() === 'HI' ? 'Hindi'
          : String(e.language || '').slice(0, 2).toUpperCase() === 'EN' ? 'English' : (e.language || 'Telugu'),
        language_code: e.language || 'te-IN',
        status: e.status === 'active' ? 'active' : (e.status === 'paused' ? 'paused' : 'training'),
        max_call_duration: e.max_call_duration_seconds || 600,
        voice_provider: e.voice_tier === 'Value' ? 'sarvam' : 'cartesia',
        voice: e.voice_tier || 'Premium',
        voice_speed: 1,
        total_calls: 0,
        successful_calls: 0,
        avg_duration: 0,
        created_at: e.created_at,
        updated_at: e.created_at,
        call_variables: e.call_variables || [],
        capture_fields: e.capture_fields || [],
        phone_number: e.phone_number || null,
        phone_number_id: e.phone_number_id || null,
        is_published: e.is_published,
        cartesia_agent_url: null,
      }));
    } catch (err) {
      console.warn('[employees] Failed to fetch Outpero employees:', err.message);
    }
  }

  // Local employees first, followed by external Outpero roster
  res.json({ success: true, employees: [...localList, ...outperoList] });
}));

router.post('/', asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const org = req.organization;
  const data = pickEmployee(req.body);
  if (!data.name) throw new AppError('Employee name is required', 400, 'VALIDATION');
  data.language = data.language || 'Telugu';
  data.language_code = data.language_code || 'te-IN';
  data.status = data.status || 'active';

  const dummy = Object.assign({}, data, { id: 0, name: data.name, role: data.role || '', language: data.language, language_code: data.language_code });
  data.system_prompt = buildSystemPrompt(dummy, org);

  const { cols, ph, values } = buildInsertSql({ ...data, organization_id: orgId, status: data.status });
  const r = await insert(`INSERT INTO ai_employees (${cols}) VALUES (${ph})`, values);
  const empId = r.insertId;

  await insert('INSERT INTO employee_versions (employee_id, version, data, is_published) VALUES (?,?,?,?)',
    [empId, 1, JSON.stringify(data), 1]);

  if (req.body.knowledge) {
    const k = req.body.knowledge;
    if (k.faqs?.length) {
      for (const f of k.faqs) if (f.question) await insert('INSERT INTO employee_faqs (employee_id, question, answer) VALUES (?,?,?)', [empId, f.question, f.answer || '']);
    }
    if (k.text?.length) {
      for (const t of k.text) if (t) await insert('INSERT INTO employee_knowledge (employee_id, type, title, content) VALUES (?,?,?,?)', [empId, 'text', t.title || null, t.content || t]);
    }
    if (k.scripts?.length) {
      for (const s of k.scripts) if (s.content) await insert('INSERT INTO employee_scripts (employee_id, name, content) VALUES (?,?,?)', [empId, s.name || 'Script', s.content]);
    }
  }

  if (req.body.phone_number_id) {
    await update('UPDATE phone_numbers SET employee_id = ? WHERE id = ? AND organization_id = ?',
      [empId, req.body.phone_number_id, orgId]).catch(() => {});
  } else if (req.body.phone_number) {
    await update('UPDATE phone_numbers SET employee_id = ? WHERE number = ? AND organization_id = ?',
      [empId, req.body.phone_number, orgId]).catch(() => {});
  }

  // Automatically save and sync employee with Cartesia Agents API (play.cartesia.ai/agents)
  const cartesiaSync = await syncCartesiaAgent({
    id: empId,
    ...data,
    system_prompt: data.system_prompt,
    greeting: data.greeting,
    instructions: data.instructions,
  }).catch((err) => {
    console.warn('[cartesia-agent] Error syncing agent on POST /:', err.message);
    return null;
  });

  const detail = await loadEmployeeDetail(empId, orgId);
  res.status(201).json({ success: true, employee: detail, cartesia_sync: cartesiaSync });
}));

router.post('/quick-build', asyncHandler(async (req, res) => {
  const {
    prompt,
    conversation = [],
    conversationId = '',
    language = 'Telugu',
    mode = 'instant',
    category = '',
    autoSave = true,
  } = req.body;
  const orgId = req.user.organization_id;
  const org = req.organization;

  // Fetch existing employee names for this org so the LLM picks a unique name
  const { query } = require('../config/db');
  const existingRows = await query(
    "SELECT name FROM ai_employees WHERE organization_id = ? AND status != 'deleted'",
    [orgId]
  );
  const existingNames = (existingRows || []).map((r) => r.name).filter(Boolean);

  const generated = await buildAiEmployeeFromPrompt({
    prompt,
    conversation,
    conversationId,
    language,
    mode,
    category,
    voice: req.body.voice,
    voice_provider: req.body.voice_provider,
    existingNames,
  });

  if (!autoSave) {
    return res.json({ success: true, draft: generated });
  }

  const data = pickEmployee(generated);
  let cleanVoice = req.body.voice || data.voice || '82c2afc8-ebbc-4802-8ccf-036dc0fa1e3b';
  if (typeof cleanVoice === 'string' && cleanVoice.startsWith('cartesia:')) {
    cleanVoice = cleanVoice.slice(9);
  }
  const { isCartesiaVoiceId } = require('../providers/voice/cartesia');
  data.voice = cleanVoice;
  data.voice_provider = req.body.voice_provider || (isCartesiaVoiceId(cleanVoice) ? 'cartesia' : (data.voice_provider || 'cartesia'));
  data.organization_id = orgId;
  data.status = 'active';
  data.livekit_agent_name = generated.livekit_agent_name || 'telugu-caller';
  const dummy = Object.assign({}, data, { id: 0 });
  data.system_prompt = buildSystemPrompt(dummy, org);

  const { cols, ph, values } = buildInsertSql(data);
  const r = await insert(`INSERT INTO ai_employees (${cols}) VALUES (${ph})`, values);
  const empId = r.insertId;

  await insert('INSERT INTO employee_versions (employee_id, version, data, is_published) VALUES (?,?,?,?)',
    [empId, 1, JSON.stringify(data), 1]);

  if (generated.faqs?.length) {
    for (const f of generated.faqs) {
      if (f.question) await insert('INSERT INTO employee_faqs (employee_id, question, answer) VALUES (?,?,?)', [empId, f.question, f.answer || '']);
    }
  }

  if (generated.scripts?.length) {
    for (const s of generated.scripts) {
      if (s.content) await insert('INSERT INTO employee_scripts (employee_id, name, content) VALUES (?,?,?)', [empId, s.name || 'Script', s.content]);
    }
  }

  // Save full onboarding conversation transcript with its unique conversation ID into employee knowledge
  if (Array.isArray(conversation) && conversation.length > 0) {
    const convId = conversationId || `swara_${Date.now()}`;
    const transcriptText = conversation
      .map((m) => `${(m.sender || m.role) === 'user' ? 'Customer' : 'Swara'}: ${m.text || m.content || ''}`)
      .join('\n');
    await insert(
      'INSERT INTO employee_knowledge (employee_id, type, title, content) VALUES (?,?,?,?)',
      [empId, 'text', `Swara Onboarding Transcript (${convId})`, transcriptText]
    ).catch(() => {});
  }

  await audit(req, 'employee.create', 'ai_employee', empId, { name: data.name, method: 'quick-build', conversationId });
  await realtime.emit(orgId, 'employee.created', { id: empId, name: data.name });

  // Automatically sync employee with LiveKit Cloud Agent Builder pipeline
  const livekitService = require('../services/livekitService');
  const syncResult = await livekitService.syncLiveKitAgentForEmployee(
    Object.assign({}, data, {
      id: empId,
      custom_keyterms: generated.custom_keyterms,
      welcome_message: generated.welcome_message,
    }),
    org
  ).catch((err) => {
    console.warn('[livekit] Error creating LiveKit agent on quick-build:', err.message);
    return null;
  });

  // Automatically save and sync employee with Cartesia Agents API (play.cartesia.ai/agents)
  const cartesiaSync = await syncCartesiaAgent({
    id: empId,
    ...data,
    system_prompt: data.system_prompt,
    greeting: generated.greeting || data.greeting,
    instructions: generated.instructions || data.instructions,
  }).catch((err) => {
    console.warn('[cartesia-agent] Error creating agent on quick-build:', err.message);
    return null;
  });

  const detail = await loadEmployeeDetail(empId, orgId);
  res.status(201).json({ success: true, employee: detail, generated, livekit_sync: syncResult, cartesia_sync: cartesiaSync });
}));

router.post('/swara-chat', asyncHandler(async (req, res) => {
  const { messages = [], language = 'Telugu' } = req.body;
  const langConfig = {
    Telugu: 'in Telugu',
    Hindi: 'in Hindi',
    English: 'in English',
    Tamil: 'in Tamil',
    Kannada: 'in Kannada',
    Malayalam: 'in Malayalam',
    Marathi: 'in Marathi',
  };

  const sys = `You are Swara, a brilliant, friendly Indian AI telephony employee builder.
You are having an onboarding conversation with a business owner to design their perfect AI voice employee ${langConfig[language] || 'in Telugu'}.
Your task is to ask 2-3 short, clear questions to understand:
1. What business do they run and what role will the AI employee play?
2. What are the key details the caller needs to collect or provide?
3. What is the goal of the call (book appointment, send brochure, qualify lead)?

Keep your response brief (maximum 2 sentences) and conversational in ${language}.
When you have collected enough information, congratulate them and suggest clicking 'Build Employee'.`;

  try {
    const ai = getAIProvider('llm');
    const { text } = await ai.generateResponse(messages, { systemPrompt: sys, temperature: 0.6, maxTokens: 150 });
    return res.json({ success: true, reply: text });
  } catch {
    const defaultReplies = {
      Telugu: 'చాలా మంచిది! మీ బిజినెస్ కోసం కాల్స్ వచ్చినప్పుడు కస్టమర్ నుంచి మీరు ముఖ్యంగా తెలుసుకోవాల్సిన సమాచారం ఏమిటి?',
      Hindi: 'बहुत बढ़िया! कॉल्स के दौरान ग्राहकों से आपको मुख्य रूप से क्या जानकारी चाहिए?',
      English: 'Got it! What key details do you want the AI caller to collect or verify from customers?',
    };
    return res.json({ success: true, reply: defaultReplies[language] || defaultReplies.Telugu });
  }
}));



// Voice Cloning with Cartesia
router.post('/clone-voice', upload.single('clip'), asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const userId = req.user.id;
  const { name, language = 'te', description = '', employeeId, gender } = req.body;

  if (!name || !name.trim()) throw new AppError('Voice name is required', 400, 'VALIDATION');
  if (!req.file || !req.file.buffer) throw new AppError('Audio sample clip is required for voice cloning', 400, 'VALIDATION');

  const { getWallet, debit } = require('../services/credits');
  const CLONE_FEE = 10;
  const currentWallet = await getWallet(orgId);
  if (currentWallet.balance < CLONE_FEE) {
    throw new AppError(`Insufficient wallet balance (₹${CLONE_FEE} required for voice cloning). Current balance: ₹${currentWallet.balance}. Please recharge your wallet.`, 402, 'INSUFFICIENT_CREDITS');
  }

  const providerOrder = cloneProviderOrder();
  const locale = language.includes('-') ? language : `${language}-IN`;

  // Phone apps hand us .mp4/.m4a audio containers that providers reject, so
  // normalise to 16 kHz mono WAV first.
  let clip;
  try {
    clip = await toCloneReadyAudio({
      buffer: req.file.buffer,
      fileName: req.file.originalname || 'clip.wav',
      mimetype: req.file.mimetype,
    });
  } catch (err) {
    throw new AppError(err.message, 400, 'AUDIO_CONVERSION_FAILED');
  }

  // Try each provider in turn (Sarvam first by default) and keep the first real
  // clone. Nothing is persisted if every provider fails, so a placeholder voice
  // can never reach the employee's call path and no fee is charged.
  let providerName;
  let voiceId;
  try {
    const result = await createVoiceClone({
      audioBuffer: clip.buffer,
      fileName: clip.fileName,
      contentType: clip.contentType,
      name: name.trim(),
      language,
      description,
    });
    providerName = result.providerName;
    voiceId = result.voiceId;
  } catch (err) {
    console.warn('[voice-clone] all providers failed:', err.message);
    throw new AppError(buildCloneFailureMessage(err), err.status || 502, 'CLONE_FAILED');
  }

  const provider = getVoiceProvider(providerName);

  // Generate a test audio preview sample with this cloned voice. Persist the
  // bytes to disk and keep a short path - the base64 payload is far too large
  // for the sample_url column.
  //
  // `preview_is_reference` marks the case where Sarvam's generation model was
  // unavailable and we fell back to the recording the user uploaded. That clip
  // is their own voice by definition, so presenting it as the clone's preview is
  // what made every cloned voice sound identical. The flag lets the UI say so.
  let previewUrl = null;
  let previewIsReference = false;
  const PREVIEW_MAX_BYTES = 3 * 1024 * 1024;
  try {
    const testSample = await provider.synthesize('నమస్కారం! ఇది మీ కొత్త క్లోనింగ్ వాయిస్ ప్రివ్యూ. ఎలా ఉంది?', {
      voice: voiceId,
      language: locale,
    });
    if (testSample?.buffer) {
      previewUrl = storeSample(testSample.buffer, name.trim(), { maxBytes: PREVIEW_MAX_BYTES });
    } else if (testSample?.audioUrl?.startsWith('data:')) {
      previewUrl = storeSample(Buffer.from(testSample.audioUrl.split(',')[1], 'base64'), name.trim(), { maxBytes: PREVIEW_MAX_BYTES });
    } else if (testSample?.audioUrl) {
      previewUrl = testSample.audioUrl;
    }
  } catch (previewErr) {
    // Sarvam's generation model 503s while it warms up. The clone itself is
    // fine, so surface a useful status rather than pretending the preview is
    // the clone speaking.
    console.warn(`[${providerName}] preview synthesis failed (${previewErr.message})`);
    // Only substitute Sarvam's *generated* preview. Its reference audio is the
    // file the customer uploaded, so using it here would play their own
    // recording back and make every clone sound identical.
    try {
      if (typeof provider.fetchClonedVoicePreview === 'function') {
        const fallback = await provider.fetchClonedVoicePreview(voiceId);
        if (fallback?.buffer) {
          previewUrl = storeSample(fallback.buffer, name.trim(), { maxBytes: PREVIEW_MAX_BYTES });
          previewIsReference = !!fallback.isReference;
        } else {
          console.warn(`[${providerName}] no generated preview available for this clone yet`);
        }
      }
    } catch (fbErr) {
      console.warn(`[${providerName}] reference audio fallback failed:`, fbErr.message);
    }
  }

  const r = await insert(
    `INSERT INTO voice_clones (organization_id, user_id, name, voice_id, provider, language, gender, sample_url, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ready')`,
    [orgId, userId, name.trim(), voiceId, providerName, language, gender || 'neutral', previewUrl]
  );

  await debit(orgId, CLONE_FEE, `Voice clone creation: ${name.trim()} (₹${CLONE_FEE} setup fee)`, `clone-${r.insertId}`);
  const updatedWallet = await getWallet(orgId);
  realtime.emit(orgId, 'credits.updated', { balance: updatedWallet.balance });

  // If employeeId passed, attach it immediately to the employee
  if (employeeId) {
    const empId = parseInt(employeeId, 10);
    await update('UPDATE ai_employees SET voice = ?, voice_provider = ? WHERE id = ? AND organization_id = ?',
      [voiceId, providerName, empId, orgId]);
  }

  await audit(req, 'voice.clone', 'voice_clone', r.insertId, { name, voiceId, provider: providerName, fee: CLONE_FEE });

  res.status(201).json({
    success: true,
    voice: {
      id: r.insertId,
      name: name.trim(),
      voice_id: voiceId,
      provider: providerName,
      language,
      sample_url: previewUrl,
      status: 'ready',
      preview_from_clone: !previewIsReference && !!previewUrl,
      preview_is_reference: previewIsReference,
      rate_per_minute: 10.0,
      fee_charged: CLONE_FEE,
      wallet_balance: updatedWallet.balance,
    },
    message: previewIsReference
      ? `Voice cloned for ₹${CLONE_FEE}! The generation service is warming up, so the clip below is your original recording rather than a generated preview. Try the preview again in a minute.`
      : `Voice cloned for ₹${CLONE_FEE}! Tap the speaker to hear it speak.`,
  });
}));

router.get('/cloned-voices', asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const rows = await query(
    `SELECT vc.*, (SELECT COUNT(*) FROM ai_employees e WHERE e.voice = vc.voice_id AND e.organization_id = ?) AS employees_using
     FROM voice_clones vc
     WHERE vc.organization_id = ?
     ORDER BY vc.created_at DESC`,
    [orgId, orgId]
  );

  // Rows cloned before samples were persisted to disk hold a truncated base64
  // data URL. Clear those so the client regenerates a playable sample.
  const sanitized = [];
  for (const row of rows) {
    if (!isPlayableUrl(row.sample_url)) {
      await update('UPDATE voice_clones SET sample_url = NULL WHERE id = ?', [row.id]);
      row.sample_url = null;
    }
    sanitized.push(row);
  }

  res.json({ success: true, voices: sanitized });
}));



// Re-render a clone's preview on demand.
//
// Clones created while the provider's generation model was cold have no usable
// preview: the clone works, but nothing has spoken it yet. Charging again for the
// same upload to hear it would be wrong, so this re-synthesises in place. Free -
// it is the same generation the clone already paid for.
router.post('/cloned-voices/:id/preview', asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const id = parseInt(req.params.id, 10);
  const row = await queryOne('SELECT * FROM voice_clones WHERE id = ? AND organization_id = ?', [id, orgId]);
  if (!row) throw new AppError('Cloned voice not found', 404, 'NOT_FOUND');
  if (!row.voice_id) throw new AppError('This clone has no provider voice id', 400, 'VALIDATION');

  const provider = getVoiceProvider(row.provider || 'sarvam');
  const language = row.language || 'te';
  const locale = language.includes('-') ? language : `${language}-IN`;

  let audio;
  try {
    audio = await provider.synthesize('నమస్కారం! ఇది మీ క్లోనింగ్ వాయిస్ ప్రివ్యూ. ఎలా ఉంది?', {
      voice: row.voice_id,
      language: locale,
    });
  } catch (err) {
    throw new AppError(
      `The voice service is still warming up (${err.message}). Try again in a minute.`,
      503,
      'PREVIEW_UNAVAILABLE'
    );
  }

  const buffer = audio?.buffer || (audio?.audioUrl?.startsWith('data:') ? Buffer.from(audio.audioUrl.split(',')[1], 'base64') : null);
  if (!buffer) throw new AppError('Preview generation returned no audio', 502, 'PREVIEW_EMPTY');

  if (row.sample_url) removeSample(row.sample_url);
  const previewUrl = storeSample(buffer, row.name, { maxBytes: 3 * 1024 * 1024 });
  await update('UPDATE voice_clones SET sample_url = ? WHERE id = ?', [previewUrl, id]);
  await audit(req, 'voice.clone.preview', 'voice_clone', id, { voice_id: row.voice_id });

  res.json({ success: true, sample_url: previewUrl, preview_is_reference: false });
}));

router.delete('/cloned-voices/:id', asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const id = parseInt(req.params.id, 10);
  const existing = await queryOne('SELECT sample_url, voice_id, provider FROM voice_clones WHERE id = ? AND organization_id = ?', [id, orgId]);
  await update('DELETE FROM voice_clones WHERE id = ? AND organization_id = ?', [id, orgId]);
  if (existing?.sample_url) removeSample(existing.sample_url);

  // Free the provider-side slot too - Sarvam caps clones per plan, so a row
  // deleted only in our DB would permanently leak a voice slot.
  try {
    const { isClonedVoiceId } = require('../providers/voice/sarvam');
    if (isClonedVoiceId(existing?.voice_id)) {
      const { getVoiceProvider: gvp } = require('../providers');
      await gvp('sarvam').deleteClonedVoice(existing.voice_id);
    }
  } catch (err) {
    console.warn('[voice-clone] provider cleanup failed:', err.message);
  }

  res.json({ success: true });
}));



router.get('/:id', asyncHandler(async (req, res) => {
  const rawId = req.params.id;
  const orgId = req.user.organization_id;

  const isDeleted = await queryOne(
    'SELECT id FROM deleted_employees WHERE organization_id = ? AND employee_id = ?',
    [orgId, String(rawId)]
  ).catch(() => null);
  if (isDeleted) {
    throw new AppError('Employee not found', 404, 'NOT_FOUND');
  }

  const outpero = require('../services/outperoService');
  if (outpero.isConfigured() && String(req.params.id).includes('-')) {
    const e = await outpero.getEmployee(req.params.id);
    const employee = {
      id: e.id,
      organization_id: req.user.organization_id,
      name: e.name,
      avatar_url: null,
      role: e.role,
      description: e.role,
      mode: e.mode,
      language: String(e.language || 'te-IN').slice(0, 2).toUpperCase() === 'TE' ? 'Telugu'
        : String(e.language || '').slice(0, 2).toUpperCase() === 'HI' ? 'Hindi'
        : String(e.language || '').slice(0, 2).toUpperCase() === 'EN' ? 'English' : (e.language || 'Telugu'),
      language_code: e.language || 'te-IN',
      status: e.status === 'active' ? 'active' : (e.status === 'paused' ? 'paused' : 'training'),
      max_call_duration: e.max_call_duration_seconds || 600,
      voice_provider: e.voice_tier === 'Value' ? 'sarvam' : 'cartesia',
      voice: e.voice_tier || 'Premium',
      voice_speed: 1,
      total_calls: 0,
      successful_calls: 0,
      avg_duration: 0,
      created_at: e.created_at,
      updated_at: e.created_at,
      call_variables: e.call_variables || [],
      capture_fields: e.capture_fields || [],
      phone_number: e.phone_number || null,
      phone_number_id: e.phone_number_id || null,
      is_published: e.is_published,
      faqs: [],
      docs: [],
      knowledge: [],
      scripts: [],
      examples: [],
      versions: [],
      numbers: [],
      training_updated_at: e.created_at,
    };
    return res.json({ success: true, employee });
  }
  const empId = parseInt(req.params.id, 10);
  if (isNaN(empId) || empId <= 0) {
    throw new AppError('Invalid employee ID', 400, 'INVALID_ID');
  }
  const emp = await loadEmployeeDetail(empId, req.user.organization_id);
  res.json({ success: true, employee: emp });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const rawId = req.params.id;
  const outpero = require('../services/outperoService');
  if (outpero.isConfigured() && String(rawId).includes('-')) {
    const e = await outpero.getEmployee(rawId);
    const updated = {
      ...e,
      ...req.body,
      id: rawId,
    };
    await audit(req, 'employee.update', 'ai_employee', 0, { id: rawId, name: updated.name });
    realtime.emit(req.user.organization_id, 'employee.updated', { id: rawId, name: updated.name });
    return res.json({ success: true, employee: updated });
  }

  const empId = parseInt(rawId, 10);
  if (isNaN(empId) || empId <= 0) {
    throw new AppError('Invalid employee ID', 400, 'INVALID_ID');
  }
  await ensureOrgOwned('ai_employees', empId, req.user.organization_id);
  const data = pickEmployee(req.body);
  if (Object.keys(data).length === 0) throw new AppError('No fields to update', 400, 'VALIDATION');
  const existing = await queryOne('SELECT * FROM ai_employees WHERE id = ?', [empId]);
  const merged = { ...existing, ...data };
  data.system_prompt = buildSystemPrompt(merged, req.organization);
  const keys = Object.keys(data);
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  await insert(`UPDATE ai_employees SET ${sets} WHERE id = ?`, [...Object.values(data), empId]);
  await audit(req, 'employee.update', 'ai_employee', empId);

  if (req.body.phone_number_id) {
    await update('UPDATE phone_numbers SET employee_id = ? WHERE id = ? AND organization_id = ?',
      [empId, req.body.phone_number_id, req.user.organization_id]).catch(() => {});
  } else if (req.body.phone_number) {
    await update('UPDATE phone_numbers SET employee_id = ? WHERE number = ? AND organization_id = ?',
      [empId, req.body.phone_number, req.user.organization_id]).catch(() => {});
  }

  const detail = await loadEmployeeDetail(empId, req.user.organization_id);
  realtime.emit(req.user.organization_id, 'employee.updated', { id: empId, name: detail.name });

  // Update Cartesia agent if voice/instructions/greeting changed
  syncCartesiaAgent({
    id: empId,
    ...merged,
    system_prompt: data.system_prompt || merged.system_prompt,
  }).catch((err) => {
    console.warn('[cartesia-agent] Error updating Cartesia agent on PUT /:id:', err.message);
  });

  res.json({ success: true, employee: detail });
}));

router.post('/:id/cartesia-sync', asyncHandler(async (req, res) => {
  const empId = parseInt(req.params.id, 10);
  await ensureOrgOwned('ai_employees', empId, req.user.organization_id);
  const employee = await queryOne('SELECT * FROM ai_employees WHERE id = ?', [empId]);
  if (!employee) throw new AppError('Employee not found', 404, 'NOT_FOUND');

  const syncResult = await syncCartesiaAgent(employee);

  res.json({
    success: true,
    agentId: syncResult?.agentId || employee.cartesia_agent_id,
    agentUrl: syncResult?.agentUrl || (employee.cartesia_agent_id ? `https://play.cartesia.ai/agents/${employee.cartesia_agent_id}` : null),
    message: syncResult?.agentId
      ? `Employee "${employee.name}" successfully synced with Cartesia Agent (${syncResult.agentId})!`
      : 'Cartesia sync completed.',
  });
}));

router.post('/:id/livekit-sync', asyncHandler(async (req, res) => {
  const empId = parseInt(req.params.id, 10);
  await ensureOrgOwned('ai_employees', empId, req.user.organization_id);
  const employee = await queryOne('SELECT * FROM ai_employees WHERE id = ?', [empId]);
  if (!employee) throw new AppError('Employee not found', 404, 'NOT_FOUND');

  const livekitService = require('../services/livekitService');
  const syncResult = await livekitService.syncLiveKitAgentForEmployee(employee, req.organization);
  const lkStatus = livekitService.getStatus();

  res.json({
    success: true,
    livekit: lkStatus,
    sync: syncResult,
    message: `Employee "${employee.name}" successfully synced with LiveKit Cloud Agent "${syncResult?.agentName}".`,
  });
}));

router.post('/:id/status', asyncHandler(async (req, res) => {
  const rawId = req.params.id;
  const { status } = req.body;
  const allowed = ['active', 'paused', 'training', 'offline', 'disabled'];
  if (!allowed.includes(status)) throw new AppError(`Status must be one of ${allowed.join(', ')}`, 400, 'VALIDATION');

  const outpero = require('../services/outperoService');
  if (outpero.isConfigured() && String(rawId).includes('-')) {
    await audit(req, 'employee.status', 'ai_employee', 0, { id: rawId, status });
    realtime.emit(req.user.organization_id, 'employee.status', { id: rawId, status });
    return res.json({ success: true, status });
  }

  const empId = parseInt(rawId, 10);
  if (isNaN(empId) || empId <= 0) {
    throw new AppError('Invalid employee ID', 400, 'INVALID_ID');
  }
  await ensureOrgOwned('ai_employees', empId, req.user.organization_id);
  await update('UPDATE ai_employees SET status = ? WHERE id = ?', [status, empId]);
  await audit(req, 'employee.status', 'ai_employee', empId, { status });
  // The list view shows a status badge per employee, so push the new value
  // rather than making every open tab refetch the whole roster.
  realtime.emit(req.user.organization_id, 'employee.status', { id: empId, status });
  res.json({ success: true, status });
}));

router.post('/:id/duplicate', asyncHandler(async (req, res) => {
  const rawId = req.params.id;
  const outpero = require('../services/outperoService');
  if (outpero.isConfigured() && String(rawId).includes('-')) {
    const emp = await outpero.getEmployee(rawId);
    if (!emp) throw new AppError('Employee not found', 404, 'NOT_FOUND');
    const newName = `${emp.name} (Copy)`;
    realtime.emit(req.user.organization_id, 'employee.created', { id: rawId, name: newName });
    return res.status(201).json({ success: true, employeeId: rawId });
  }

  const empId = parseInt(rawId, 10);
  const emp = await queryOne('SELECT * FROM ai_employees WHERE id = ? AND organization_id = ?', [empId, req.user.organization_id]);
  if (!emp) throw new AppError('Employee not found', 404, 'NOT_FOUND');
  const { id, created_at, updated_at, total_calls, successful_calls, avg_duration, ...rest } = emp;
  rest.name = `${rest.name} (Copy)`;
  rest.status = 'paused';
  const { cols, ph, values } = buildInsertSql({ ...rest, organization_id: req.user.organization_id });
  const r = await insert(`INSERT INTO ai_employees (${cols}) VALUES (${ph})`, values);
  const newId = r.insertId;
  const rows = await query('SELECT * FROM employee_faqs WHERE employee_id = ?', [empId]);
  for (const f of rows) await insert('INSERT INTO employee_faqs (employee_id, question, answer) VALUES (?,?,?)', [newId, f.question, f.answer]);
  const krows = await query('SELECT * FROM employee_knowledge WHERE employee_id = ?', [empId]);
  for (const k of krows) await insert('INSERT INTO employee_knowledge (employee_id, type, title, content) VALUES (?,?,?,?)', [newId, k.type, k.title, k.content]);
  await audit(req, 'employee.duplicate', 'ai_employee', newId, { from: empId });
  realtime.emit(req.user.organization_id, 'employee.created', { id: newId, name: rest.name });
  res.status(201).json({ success: true, employeeId: newId });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const rawId = req.params.id;
  const orgId = req.user.organization_id;
  const outpero = require('../services/outperoService');

  // Record in deleted_employees table immediately so it is hidden and permanently persists
  await query(
    'INSERT INTO deleted_employees (organization_id, employee_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE deleted_at = CURRENT_TIMESTAMP',
    [orgId, String(rawId)]
  ).catch((err) => console.warn('[employee.delete] insert deleted_employees failed:', err.message));

  // Unassign linked phone numbers so they become available
  await update(
    'UPDATE phone_numbers SET employee_id = NULL WHERE (employee_id = ? OR employee_id = ?) AND organization_id = ?',
    [rawId, String(rawId), orgId]
  ).catch(() => {});

  if (outpero.isConfigured() && String(rawId).includes('-')) {
    // Nullify on leads/calls/campaigns if any
    await update('UPDATE leads SET employee_id = NULL WHERE employee_id = ? AND organization_id = ?', [rawId, orgId]).catch(() => {});
    await update('UPDATE calls SET employee_id = NULL WHERE employee_id = ? AND organization_id = ?', [rawId, orgId]).catch(() => {});
    await update('UPDATE campaigns SET employee_id = 0 WHERE employee_id = ? AND organization_id = ?', [rawId, orgId]).catch(() => {});

    try {
      if (typeof outpero.deleteEmployee === 'function') {
        await outpero.deleteEmployee(rawId);
      }
    } catch (err) {
      console.warn('[outpero] delete failed:', err.message);
    }

    await audit(req, 'employee.delete', 'ai_employee', 0, { id: rawId });
    realtime.emit(orgId, 'employee.deleted', { id: rawId });
    return res.json({ success: true, deleted: true, id: rawId });
  }

  const empId = parseInt(rawId, 10);
  if (isNaN(empId) || empId <= 0) {
    throw new AppError('Invalid employee ID', 400, 'INVALID_ID');
  }
  await ensureOrgOwned('ai_employees', empId, orgId);

  const emp = await queryOne('SELECT * FROM ai_employees WHERE id = ? AND organization_id = ?', [empId, orgId]);
  if (!emp) throw new AppError('Employee not found', 404, 'NOT_FOUND');

  // Prevent deletion if a campaign is actively dialing with this employee
  const activeCampaign = await queryOne(
    'SELECT id, name FROM campaigns WHERE employee_id = ? AND organization_id = ? AND status = "calling" LIMIT 1',
    [empId, orgId]
  );
  if (activeCampaign) {
    throw new AppError(
      `Cannot delete employee while campaign "${activeCampaign.name}" is actively calling. Please pause the campaign first.`,
      400,
      'CAMPAIGN_ACTIVE'
    );
  }

  // Nullify employee_id on leads, calls and non-active campaigns so call history remains intact
  await update('UPDATE leads SET employee_id = NULL WHERE employee_id = ? AND organization_id = ?', [empId, orgId]).catch(() => {});
  await update('UPDATE calls SET employee_id = NULL WHERE employee_id = ? AND organization_id = ?', [empId, orgId]).catch(() => {});
  await update('UPDATE campaigns SET employee_id = 0 WHERE employee_id = ? AND organization_id = ?', [empId, orgId]).catch(() => {});

  // Delete child records
  await query('DELETE FROM employee_faqs WHERE employee_id = ?', [empId]).catch(() => {});
  await query('DELETE FROM employee_knowledge WHERE employee_id = ?', [empId]).catch(() => {});
  await query('DELETE FROM employee_documents WHERE employee_id = ?', [empId]).catch(() => {});
  await query('DELETE FROM employee_scripts WHERE employee_id = ?', [empId]).catch(() => {});
  await query('DELETE FROM employee_examples WHERE employee_id = ?', [empId]).catch(() => {});
  await query('DELETE FROM employee_versions WHERE employee_id = ?', [empId]).catch(() => {});

  // If employee has a cartesia_agent_id, remove it from Cartesia
  if (emp.cartesia_agent_id) {
    deleteCartesiaAgent(emp.cartesia_agent_id).catch((err) => {
      console.warn('[cartesia-agent] Delete agent failed:', err.message);
    });
  }

  // Delete the employee
  await query('DELETE FROM ai_employees WHERE id = ? AND organization_id = ?', [empId, orgId]);

  await audit(req, 'employee.delete', 'ai_employee', empId, { name: emp.name });

  // Realtime notification
  realtime.emit(orgId, 'employee.deleted', { id: empId, name: emp.name });

  res.json({ success: true, deleted: true, id: empId });
}));

// ---- training ----
router.post('/:id/train', asyncHandler(async (req, res) => {
  const rawId = req.params.id;
  const outpero = require('../services/outperoService');
  if (outpero.isConfigured() && String(rawId).includes('-')) {
    return res.json({ success: true, trained: true });
  }

  const empId = parseInt(rawId, 10);
  if (isNaN(empId) || empId <= 0) {
    throw new AppError('Invalid employee ID', 400, 'INVALID_ID');
  }
  await ensureOrgOwned('ai_employees', empId, req.user.organization_id);
  const { type, payload } = req.body;
  const org = req.organization;
  const handlers = {
    async knowledge() {
      if (!payload?.content) throw new AppError('content required', 400, 'VALIDATION');
      const r = await insert('INSERT INTO employee_knowledge (employee_id, type, title, content) VALUES (?,?,?,?)',
        [empId, 'text', payload.title || 'Knowledge', payload.content]);
      refreshPrompt();
      await audit(req, 'train.knowledge', 'ai_employee', empId);
      return { id: r.insertId };
    },
    async faq() {
      if (!payload?.question) throw new AppError('question required', 400, 'VALIDATION');
      const r = await insert('INSERT INTO employee_faqs (employee_id, question, answer) VALUES (?,?,?)',
        [empId, payload.question, payload.answer || '']);
      refreshPrompt();
      return { id: r.insertId };
    },
    async script() {
      if (!payload?.content) throw new AppError('content required', 400, 'VALIDATION');
      const r = await insert('INSERT INTO employee_scripts (employee_id, name, content) VALUES (?,?,?)',
        [empId, payload.name || 'Script', payload.content]);
      refreshPrompt();
      return { id: r.insertId };
    },
    async example() {
      const r = await insert('INSERT INTO employee_examples (employee_id, customer_text, ideal_response) VALUES (?,?,?)',
        [empId, payload?.customer_text || '', payload?.ideal_response || '']);
      refreshPrompt();
      return { id: r.insertId };
    },
    async instructions() {
      if (!payload?.instructions) throw new AppError('instructions required', 400, 'VALIDATION');
      await update('UPDATE ai_employees SET instructions = ? WHERE id = ?', [payload.instructions, empId]);
      refreshPrompt();
      return { ok: true };
    },
    async delete() {
      const { kind, id } = payload;
      const table = kind === 'faq' ? 'employee_faqs' : kind === 'doc' ? 'employee_documents' : kind === 'script' ? 'employee_scripts' : kind === 'example' ? 'employee_examples' : 'employee_knowledge';
      await insert(`DELETE FROM ${table} WHERE id = ? AND employee_id = ?`, [id, empId]);
      return { deleted: true };
    },
  };
  if (!handlers[type]) throw new AppError('Unknown training type', 400, 'VALIDATION');

  async function refreshPrompt() {
    const emp = await queryOne('SELECT * FROM ai_employees WHERE id = ?', [empId]);
    // Persist the persona only. Trained content is composed fresh from these
    // tables on every call, so baking it in here is what previously made it
    // invisible: the stored prompt always looked complete, so the knowledge was
    // never appended, and every teach action produced an identical string.
    const prompt = buildSystemPrompt(emp, org, null);
    await update('UPDATE ai_employees SET system_prompt = ? WHERE id = ?', [prompt, empId]);
  }

  const result = await handlers[type]();
  const emp = await queryOne('SELECT ai_employees.* FROM ai_employees WHERE id = ?', [empId]);
  // Training changes what the employee knows and rewrites its system prompt, so
  // every open view of this employee needs the new state immediately.
  realtime.emit(req.user.organization_id, 'employee.trained', {
    id: empId,
    type,
    updatedAt: emp?.updated_at || null,
  });
  res.json({ success: true, ...result, employee: emp });
}));

router.post('/:id/train/publish', asyncHandler(async (req, res) => {
  const empId = parseInt(req.params.id, 10);
  await ensureOrgOwned('ai_employees', empId, req.user.organization_id);
  const emp = await queryOne('SELECT * FROM ai_employees WHERE id = ?', [empId]);
  const latest = await queryOne('SELECT * FROM employee_versions WHERE employee_id = ? ORDER BY version DESC', [empId]);
  const version = (latest?.version || 0) + 1;
  await insert('INSERT INTO employee_versions (employee_id, version, data, is_published) VALUES (?,?,?,1)',
    [empId, version, JSON.stringify(emp)]);
  await update('UPDATE employee_versions SET is_published = 0 WHERE employee_id = ? AND version < ?', [empId, version]);
  await audit(req, 'train.publish', 'ai_employee', empId, { version });
  realtime.emit(req.user.organization_id, 'employee.trained', { id: empId, type: 'publish', version });
  res.json({ success: true, version });
}));

// ---- testing ----
router.post('/:id/test', asyncHandler(async (req, res) => {
  const empId = parseInt(req.params.id, 10);
  const emp = await queryOne('SELECT * FROM ai_employees WHERE id = ? AND organization_id = ?', [empId, req.user.organization_id]);
  if (!emp) throw new AppError('Employee not found', 404, 'NOT_FOUND');
  const ai = getAIProvider();
  const knowledge = await loadEmployeeKnowledge(empId);
  const prompt = buildSystemPrompt(emp, req.organization, knowledge);
  const rawMessage = req.body.message || '';
  const isGreeting = rawMessage === '__greeting__';
  // The streaming path renders the text itself and then calls back here with
  // __voice__ to get audio for a reply that is already final. Synthesizing the
  // supplied text avoids paying for a second LLM call.
  const isVoiceOnly = rawMessage === '__voice__';
  const userMessage = isGreeting ? 'హలో, నమస్కారం!' : (rawMessage || 'నమస్తే, మీ సర్వీస్ గురించి చెప్పండి.');

  let replyText = '';
  if (isGreeting) {
    replyText = (emp.greeting || 'నమస్కారం! నేను {name}. మీకు ఎలా సహాయపడగలను?').replace('{name}', emp.name);
  } else if (isVoiceOnly) {
    replyText = String(req.body.text || '').trim();
    if (!replyText) throw new AppError('text required for voice synthesis', 400, 'VALIDATION');
  } else {
    const aiRes = await ai.generateResponse([{ role: 'user', content: userMessage }], { systemPrompt: prompt });
    replyText = aiRes.text;
  }

  // resolveVoiceProvider honours a Sarvam clone id (svc-*) even when the row's
  // voice_provider says otherwise, instead of blindly trusting the column.
  const { resolveVoiceProvider } = require('../providers');
  const voice = await resolveVoiceProvider(emp.voice, emp.voice_provider).synthesize(replyText, {
    language: emp.language_code || 'te-IN',
    voice: emp.voice || undefined,
    speed: emp.voice_speed || 1.0,
    pitch: emp.voice_pitch || 1.0,
  }).catch((err) => {
    console.warn(`[test] Voice synthesis failed via ${emp.voice_provider || 'auto'}:`, err.message);
    return null;
  });

  res.json({ success: true, response: replyText, voiceUrl: voice?.audioUrl || null, systemPrompt: prompt });
}));

// Streaming test conversation. Server-sent events rather than the websocket
// because this is a request/response exchange tied to one browser tab: SSE
// carries the auth header, streams in order, and dies with the request.
router.post('/:id/chat-stream', asyncHandler(async (req, res) => {
  const empId = parseInt(req.params.id, 10);
  const emp = await queryOne('SELECT * FROM ai_employees WHERE id = ? AND organization_id = ?', [empId, req.user.organization_id]);
  if (!emp) throw new AppError('Employee not found', 404, 'NOT_FOUND');

  const rawMessage = req.body.message || '';
  const history = Array.isArray(req.body.history) ? req.body.history.slice(-10) : [];
  const isGreeting = rawMessage === '__greeting__';
  const userMessage = isGreeting
    ? 'హలో, నమస్కారం!'
    : (rawMessage || 'నమస్తే, మీ సర్వీస్ గురించి చెప్పండి.');

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  let closed = false;
  req.on('close', () => { closed = true; });

  const send = (event, data) => {
    if (closed) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // A client that navigates away would otherwise leave this generator running
  // and paying for tokens. This fires when the tab disconnects mid-stream.
  const onClose = () => { closed = true; };
  req.on('aborted', onClose);

  try {
    const knowledge = await loadEmployeeKnowledge(empId);
    const prompt = buildSystemPrompt(emp, req.organization, knowledge);

    if (isGreeting) {
      const greeting = (emp.greeting || 'నమస్కారం! నేను {name}. మీకు ఎలా సహాయపడగలను?')
        .replace('{name}', emp.name);
      send('delta', { text: greeting });
      send('done', { text: greeting, greeting: true });
      return res.end();
    }

    const messages = [
      ...history.map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: String(m.content || '') })),
      { role: 'user', content: userMessage },
    ];

    const ai = getAIProvider();
    let reply = '';
    const onDelta = typeof ai.streamResponse === 'function'
      ? ai.streamResponse(messages, { systemPrompt: prompt })
      : null;

    if (!onDelta) {
      const res2 = await ai.generateResponse(messages, { systemPrompt: prompt });
      reply = res2.text || '';
      send('delta', { text: reply });
    } else {
      for await (const delta of onDelta) {
        if (closed) return;
        reply += delta;
        send('delta', { text: delta });
      }
    }

    send('done', { text: reply });
  } catch (err) {
    console.warn('[chat-stream] error:', err.message);
    send('error', { message: 'Could not generate a reply.' });
  } finally {
    req.off('aborted', onClose);
    if (!res.writableEnded) res.end();
  }
}));

// voice preview
router.post('/:id/voice-preview', asyncHandler(async (req, res) => {
  const result = await synthesizeVoiceSample(req.body);
  res.json(result);
}));

// upload document with real text extraction (PDF, DOCX, TXT, CSV, MD)
router.post('/:id/documents', upload.single('file'), asyncHandler(async (req, res) => {
  const empId = parseInt(req.params.id, 10);
  await ensureOrgOwned('ai_employees', empId, req.user.organization_id);
  if (!req.file) throw new AppError('File is required', 400, 'VALIDATION');
  const name = req.file.originalname;
  const ext = (name.split('.').pop() || '').toLowerCase();
  const fileBuffer = req.file.buffer;

  let extractedText = '';
  try {
    if (ext === 'pdf') {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(fileBuffer);
      extractedText = data.text || '';
    } else if (ext === 'docx') {
      const mammoth = require('mammoth');
      const data = await mammoth.extractRawText({ buffer: fileBuffer });
      extractedText = data.value || '';
    } else if (['txt', 'csv', 'md', 'json', 'tsv', 'yaml', 'yml'].includes(ext)) {
      extractedText = fileBuffer.toString('utf8');
    } else {
      // Fallback text scanner
      extractedText = fileBuffer.toString('utf8').replace(/[^\x20-\x7E\n\r\t\u0C00-\u0C7F]/g, ' ');
    }
  } catch (extractErr) {
    console.warn(`[docs] Text extraction note for ${name}:`, extractErr.message);
    extractedText = `Uploaded document: ${name}. File contents could not be fully parsed: ${extractErr.message}`;
  }

  // Clean extracted text
  extractedText = (extractedText || '').trim().replace(/\r\n/g, '\n');
  if (!extractedText) {
    extractedText = `Knowledge document: ${name}`;
  }

  const mockUrl = `/uploads/documents/${empId}/${encodeURIComponent(name)}`;
  const r = await insert(
    'INSERT INTO employee_documents (employee_id, name, file_type, file_url, status, extracted_text) VALUES (?,?,?,?,?,?)',
    [empId, name, ext, mockUrl, 'ready', extractedText]
  );

  // Also sync into employee_knowledge table for instant searchability during AI calls
  await insert(
    'INSERT INTO employee_knowledge (employee_id, type, title, content) VALUES (?,?,?,?)',
    [empId, 'document', name, extractedText.slice(0, 10000)]
  ).catch(() => {});

  await audit(req, 'train.doc', 'ai_employee', empId, { name, characters: extractedText.length });
  realtime.emit(req.user.organization_id, 'employee.trained', { id: empId, type: 'document' });
  res.status(201).json({
    success: true,
    document: {
      id: r.insertId,
      name,
      status: 'ready',
      characters: extractedText.length,
      snippet: extractedText.slice(0, 200),
    },
  });
}));

module.exports = router;
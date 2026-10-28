const crypto = require('crypto');
const { insert, query, queryOne, update } = require('../config/db');
const { AppError } = require('../utils/errors');
const { generateId, SQL_NOW, buildSetClause } = require('../utils/helpers');
const { getTelephonyProvider, getAIProvider, resolveVoiceProvider } = require('../providers');
const { buildSystemPrompt, estimateCallCredits } = require('./systemPrompt');
const { getWallet, debit, calculateCallCost, getVoicePerMinuteRate } = require('./credits');
const realtime = require('./realtime');
const { dispatch } = require('./webhooks');
const config = require('../config/env');

const OUTCOME_PHONE_STATE = {
  no_answer: 'No answer',
  busy: 'Line busy',
  wrong_number: 'Wrong number',
  failed: 'Call failed',
};

let running = new Map(); // callId -> controller

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const TELUGU_UTTERANCES = [
  'అవును, నేను వింటున్నాను.',
  'మీ సర్వీస్ గురించి మరింత చెప్పండి.',
  'దాని ధర ఎంత?',
  'ప్రస్తుతం బిజీగా ఉన్నాను, కొంచెం తర్వాత మాట్లాడుకుందాం.',
  'మీ గురించి కొత్తగా తెలుసుకోవడం బాగుంది, మరి రేపు మాట్లాడదాం.',
  'సరే, ధన్యవాదాలు.',
];

async function getEmployeeContext(orgId, employeeId, { allowPaused = false } = {}) {
  const employee = await queryOne('SELECT * FROM ai_employees WHERE id = ? AND organization_id = ?', [employeeId, orgId]);
  if (!employee) throw new AppError('Employee not found', 404, 'NOT_FOUND');
  if (employee.status === 'disabled') throw new AppError('Employee is disabled', 400, 'EMPLOYEE_DISABLED');
  if (employee.status === 'paused' && !allowPaused) {
    throw new AppError('Employee is currently paused. Resume calling to start making calls.', 400, 'EMPLOYEE_PAUSED');
  }
  const faqs = await query('SELECT * FROM employee_faqs WHERE employee_id = ?', [employeeId]);
  const docs = await query("SELECT * FROM employee_documents WHERE employee_id = ? AND status = 'ready'", [employeeId]);
  const text = await query('SELECT * FROM employee_knowledge WHERE employee_id = ?', [employeeId]);
  return { employee, knowledge: { faqs, docs, text } };
}

function pickUtterance(employee) {
  return TELUGU_UTTERANCES[Math.floor(Math.random() * TELUGU_UTTERANCES.length)];
}

function pickStatusOutcome() {
  const outcomes = ['no_answer', 'busy', 'wrong_number', 'failed'];
  const idx = Math.floor(Math.random() * 10);
  // ~70% connect successfully
  if (idx < 7) return { answered: true };
  return { answered: false, outcome: outcomes[Math.floor(Math.random() * outcomes.length)] };
}

function buildMockTranscript(employee, durationSeconds) {
  const turns = Math.max(3, Math.min(8, Math.floor(durationSeconds / 6)));
  const lines = [];
  let t = 0;
  lines.push({ speaker: 'ai', text: `హలో, నేను ${employee.name}.` || employee.greeting, ts: 0 });
  t += 2;
  lines.push({ speaker: 'customer', text: 'హలో, నేను ఇప్పుడు మీ కాల్కి ఎదురుచూస్తున్నాను.', ts: t });
  t += 3;
  for (let i = 0; i < turns; i++) {
    const text = i === 0
      ? (employee.greeting || `నమస్కారం! మీకు ఎలా సహాయం చేయగలను?`)
      : ['మీ అవసరం ఏమిటి?', 'ఈ విషయంలో మేము సహాయం చేయగలం.', 'రేపు డెమో ఏర్పాటు చేస్తే ఎలా ఉంటుంది?', 'అలాగే, తెలిసింది.'][i % 4];
    lines.push({ speaker: 'ai', text, ts: t });
    t += 3;
    lines.push({ speaker: 'customer', text: pickUtterance(employee), ts: t });
    t += 3;
  }
  lines.push({ speaker: 'customer', text: 'సరే, ధన్యవాదాలు!', ts: t });
  t += 2;
  lines.push({ speaker: 'ai', text: employee.goodbye_message || 'మీ సమయానికి ధన్యవాదాలు. మళ్లీ మాట్లాడుదాం!', ts: t });
  return lines;
}

async function createCallRecord({ org, employee, phoneNumber, direction, campaignId, leadId, from, purpose }) {
  const callId = generateId('call');
  const requestId = generateId('req');
  const creditsEstimate = estimateCallCredits(120, 2); // estimate
  await insert(
    `INSERT INTO calls (call_id, organization_id, campaign_id, employee_id, lead_id, phone_number, direction,
     status, request_id, credits_used) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [callId, org.id, campaignId || null, employee?.id || null, leadId || null, phoneNumber, direction,
     'preparing', requestId, 0]
  );
  const row = await queryOne('SELECT * FROM calls WHERE call_id = ?', [callId]);
  return { callId, row, requestId };
}

async function recordEvent(callDbId, eventType, payload = {}) {
  await insert('INSERT INTO call_events (call_id, event_type, payload) VALUES (?,?,?)',
    [callDbId, eventType, JSON.stringify(payload)]);
}

async function updateCallStatus(callDbId, status, fields = {}) {
  const { sets, params } = buildSetClause(fields);
  await update(`UPDATE calls SET ${['status = ?', ...sets].join(', ')} WHERE id = ?`, [status, ...params, callDbId]);
}

async function executeCall({ org, employee, phoneNumber, from, direction = 'outbound', campaignId = null, leadId = null, purpose = null, callDbId = null, callId = null }) {
  const { getAIProvider } = require('../providers');
  const current = queryOne('SELECT * FROM calls WHERE id = ?', [callDbId]);
  const dbId = callDbId;
  const ai = getAIProvider();

  emitState(org.id, 'call.created', { callId, callDbId: dbId, employeeId: employee.id, phoneNumber, direction });
  await recordEvent(dbId, 'call.created', { callId, phoneNumber });

  const telephony = getTelephonyProvider();
  let providerCallId = null;
  try {
    const providerInfo = await telephony.makeCall({ to: phoneNumber, from, employee, callId });
    providerCallId = providerInfo?.providerCallId || null;
    if (providerCallId) {
      await updateCallStatus(dbId, 'ringing', { request_id: providerCallId });
      emitState(org.id, 'call.ringing', { callId, callDbId: dbId, providerCallId });
      await recordEvent(dbId, 'call.ringing', { providerCallId });
    }
    // ✅ REAL CALL DIALED SUCCESSFULLY — exit now.
    // The carrier drives the conversation: VoBiz over its /ws/vobiz media
    // stream, Twilio over its TwiML/media webhooks. The fake simulation below
    // must not run — it generates fake transcripts and fake recordings.
    const providerName = telephony.constructor?.name?.replace('Provider', '') || 'carrier';
    console.log(`[call] Real ${providerName} call dialed: ${providerCallId}. Conversation handled by ${providerName} media/webhooks.`);
    return { callId, status: 'ringing', providerCallId };
  } catch (err) {
    console.error(`[call] Telephony dial failed for ${phoneNumber}: ${err.message}`);
    const config = require('../config/env');
    if (!config.mockMode) {
      await updateCallStatus(dbId, 'failed', { error: err.message });
      emitState(org.id, 'call.failed', { callId, callDbId: dbId, error: err.message });
      await recordEvent(dbId, 'call.failed', { error: err.message });
      throw err;
    }
    console.warn(`[call] MOCK_MODE=true. Proceeding with simulated call engine.`);
  }

  await updateCallStatus(dbId, 'ringing', { started_at: SQL_NOW });
  emitState(org.id, 'call.ringing', { callId, callDbId: dbId, providerCallId });
  await recordEvent(dbId, 'call.ringing', { providerCallId });

  await sleep(1200);

  await updateCallStatus(dbId, 'connected', { answered_at: SQL_NOW });
  emitState(org.id, 'call.answered', { callId, callDbId: dbId, providerCallId });
  await recordEvent(dbId, 'call.answered');

  const voice = resolveVoiceProvider(employee.voice, employee.voice_provider || 'cartesia');
  const transcript = [];
  let currentTs = 0;

  // Turn 1: AI Greeting
  const greeting = (employee.greeting || 'నమస్కారం! నేను {name}. మీకు ఎలా సహాయపడగలను?')
    .replace('{name}', employee.name || 'AI Assistant');

  transcript.push({ speaker: 'ai', text: greeting, ts: currentTs });
  emitState(org.id, 'call.ai_started', { callId, callDbId: dbId, speaker: 'ai', text: greeting });
  emitTranscript(org.id, callId, dbId, { speaker: 'ai', text: greeting, ts: currentTs });
  await recordEvent(dbId, 'call.ai_started', { speaker: 'ai', text: greeting });

  // Generate real or contextual Telugu customer enquiry
  const pLower = `${purpose || ''} ${employee.name || ''} ${employee.role || ''} ${phoneNumber}`.toLowerCase();
  let customerPrompts;
  if (pLower.includes('web') || pLower.includes('crm') || pLower.includes('vone') || pLower.includes('6301400137')) {
    customerPrompts = [
      'నమస్తే కార్తీక్ గారు, మీ Vone కంపెనీలో వెబ్ డెవలపర్లను ప్రొవైడ్ చేస్తారా? మాకు ఒక కస్టమ్ బిజినెస్ వెబ్‌సైట్ కావాలి.',
      'మరి మీ దగ్గర వాట్సాప్ CRM కూడా ఉంటుందా? అసలు వాట్సాప్ CRM లో ఎలాంటి ఫీచర్లు ఉంటాయి, ధరలు (Pricing) ఎంత ఉంటాయి?',
      'చాలా క్లియర్ గా చెప్పారు! వెబ్ డెవలప్‌మెంట్ మరియు వాట్సాప్ CRM కాంబో ప్యాకేజ్ పూర్తి కొటేషన్ మరియు డెమో లింక్ నా వాట్సాప్ నంబర్‌కి పంపించండి.',
    ];
  } else {
    customerPrompts = [
      'నమస్తే అండి, మీ సర్వీస్ లేదా ప్రాడక్ట్ వివరాలు కొంచెం చెప్పగలరా?',
      'ధర ఎంత ఉంటుంది? డెమో లేదా మరిన్ని వివరాలు నాకు పంపగలరా?',
      'అలాగే, రేపు ఉదయం 11 గంటలకు కాల్ చేస్తే మాట్లాడుకుందాం. వివరాలు వాట్సాప్ చేయండి.',
    ];
  }

  const conversationHistory = [{ role: 'assistant', content: greeting }];
  let lastAudioUrl = null;

  for (let i = 0; i < customerPrompts.length; i++) {
    await sleep(1500);
    currentTs += 3;

    // Customer Turn
    const userUtterance = customerPrompts[i];
    transcript.push({ speaker: 'customer', text: userUtterance, ts: currentTs });
    emitState(org.id, 'call.user_started', { callId, callDbId: dbId, speaker: 'customer', text: userUtterance });
    emitTranscript(org.id, callId, dbId, { speaker: 'customer', text: userUtterance, ts: currentTs });
    await recordEvent(dbId, 'call.user_started', { speaker: 'customer', text: userUtterance });

    conversationHistory.push({ role: 'user', content: userUtterance });

    // AI Turn (Live LLM or contextual Telugu response)
    await sleep(1000);
    currentTs += 2;

    let aiReplyText = '';
    try {
      const llmRes = await ai.generateResponse(conversationHistory, {
        systemPrompt: employee.system_prompt || `You are a polite, helpful Telugu AI assistant. Keep responses under 2 sentences in natural Telugu. ${employee.instructions || ''}`,
      });
      aiReplyText = llmRes.text || 'అలాగే, మీ అవసరాన్ని మేము అర్థం చేసుకున్నాము.';
    } catch {
      aiReplyText = i === 0
        ? 'ఖచ్చితంగా అండి, మా ప్లాట్‌ఫారమ్ ద్వారా వ్యాపార కాలింగ్ ఆటోమేట్ చేసుకోవచ్చు.'
        : i === 1
          ? 'మా ధరలు చాలా అనుకూలంగా ఉంటాయి. మరిన్ని వివరాలు వెంటనే షేర్ చేస్తాము.'
          : 'సరే అండి! రేపు ఖచ్చితంగా కాల్ చేస్తాను. మీ విలువైన సమయానికి ధన్యవాదాలు!';
    }

    conversationHistory.push({ role: 'assistant', content: aiReplyText });
    transcript.push({ speaker: 'ai', text: aiReplyText, ts: currentTs });

    // Synthesize real voice with Cartesia or Sarvam for live audio playback
    if (i === 0 && voice && typeof voice.synthesize === 'function') {
      try {
        const syn = await voice.synthesize(aiReplyText, {
          language: employee.language_code || 'te',
          voice: employee.voice || 'ca5e2caa-ba47-4096-91dd-dafc99d9086f',
          speed: employee.voice_speed || 1.0,
          pitch: employee.voice_pitch || 1.0,
          stability: employee.voice_stability || 0.7,
          naturalness: employee.voice_naturalness || 0.9,
        });
        if (syn?.audioUrl) lastAudioUrl = syn.audioUrl;
      } catch (err) {
        console.warn('[call] TTS audio synthesis note:', err.message);
      }
    }

    emitState(org.id, 'call.ai_started', { callId, callDbId: dbId, speaker: 'ai', text: aiReplyText });
    emitTranscript(org.id, callId, dbId, { speaker: 'ai', text: aiReplyText, ts: currentTs });
    await recordEvent(dbId, 'call.ai_started', { speaker: 'ai', text: aiReplyText });
  }

  // Final analysis via LLM
  let analysis = {};
  try {
    analysis = await ai.analyzeCall(transcript, employee);
  } catch {
    analysis = {
      summary: `AI employee ${employee.name} spoke with customer regarding services. Customer showed interest and requested a follow-up call.`,
      sentiment: 'positive',
      intent: 'service_enquiry',
      outcome: 'interested',
      outcomeConfidence: 0.9,
      outcomeReason: 'Customer requested pricing and WhatsApp details with scheduled callback',
      nextAction: 'Send WhatsApp details and schedule follow-up call',
      objections: [],
    };
  }

  const duration = Math.max(25, currentTs + 2);
  const recordingUrl = lastAudioUrl || `https://mock.storage/recordings/${callId}.wav`;

  await insert('INSERT INTO call_recordings (call_id, url, duration, size_bytes) VALUES (?,?,?,?)',
    [dbId, recordingUrl.slice(0, 500), duration, 0]);
  await insert('INSERT INTO call_outcomes (call_id, outcome, confidence, reason, next_action) VALUES (?,?,?,?,?)',
    [dbId, analysis.outcome || 'interested', analysis.outcomeConfidence || 0.85, analysis.outcomeReason || null, analysis.nextAction || null]);

  await completeCall({
    dbId, callId, org, employee, phoneNumber, leadId, campaignId, status: 'completed',
    duration, transcript, recordingUrl, analysis,
  });

  return { callId, status: 'completed', duration };
}

function emitState(orgId, type, data) {
  realtime.emit(orgId, type, data);
  realtime.emit(orgId, 'call.transcript', { ...data, _live: true });
  // note: call.transcript is separate event
}

function emitTranscript(orgId, callId, callDbId, line) {
  realtime.emit(orgId, 'call.transcript', { callId, callDbId, speaker: line.speaker, text: line.text, ts: line.ts });
}

async function completeCall({ dbId, callId, org, employee, phoneNumber, leadId, campaignId, status, duration, transcript, recordingUrl, analysis = {}, reason }) {
  // Nobody picks up? You pay ₹0. Ringing, busy and unanswered calls cost nothing at all.
  // Billed in 30-second blocks. A call under 30 seconds costs half a minute; a 40-second call costs one minute.
  // Charged per minute, by the voice each employee uses: Value (₹3.5), Standard (₹5.0), Premium (₹6.8).
  const creditsUsed = calculateCallCost({ duration, status, employee });
  const ratePerMinute = getVoicePerMinuteRate(employee);

  const outcome = analysis.outcome || (status === 'completed' ? 'follow_up' : status);
  const fields = {
    duration,
    ended_at: SQL_NOW,
    status,
    outcome,
    outcome_confidence: analysis.outcomeConfidence ?? null,
    outcome_reason: analysis.outcomeReason || reason || null,
    next_action: analysis.nextAction || null,
    sentiment: analysis.sentiment || null,
    intent: analysis.intent || null,
    summary: analysis.summary || null,
    recording_url: recordingUrl || null,
    credits_used: creditsUsed,
    error: status === 'failed' ? (reason || 'Call failed') : null,
  };

  // The transcript is written FIRST. Marking the row "completed" before the
  // lines land means any failure in between - a restart, a DB error, the
  // surrounding catch - leaves a billed call that reads as completed and has a
  // permanently empty transcript, which is what the conversation and calls
  // endpoints then serve to the user.
  for (const line of transcript || []) {
    await insert('INSERT INTO call_transcripts (call_id, speaker, text, ts) VALUES (?,?,?,?)',
      [dbId, line.speaker, line.text, line.ts || 0]);
  }

  const answeredAtClause = (fields.duration > 0 || fields.status === 'completed') ? ', answered_at = COALESCE(answered_at, NOW())' : '';
  await insert(
    `UPDATE calls SET duration=?, ended_at=NOW(), status=?, outcome=?, outcome_confidence=?, outcome_reason=?, next_action=?,
     sentiment=?, intent=?, summary=?, recording_url=?, credits_used=?, error=?${answeredAtClause} WHERE id=?`,
    [fields.duration, fields.status, fields.outcome, fields.outcome_confidence, fields.outcome_reason,
     fields.next_action, fields.sentiment, fields.intent, fields.summary, fields.recording_url, fields.credits_used,
     fields.error, dbId]
  );

  // credits
  try {
    if (creditsUsed > 0 && status === 'completed') {
      const blocks = Math.max(1, Math.ceil(duration / 30));
      const billableMinutes = blocks * 0.5;
      await debit(org.id, creditsUsed, `Call ${callId} (${duration}s · ${billableMinutes}m @ ₹${ratePerMinute}/min [30s blocks])`, callId);
      realtime.emit(org.id, 'credits.updated', { balance: (await getWallet(org.id)).balance });
    }
  } catch (err) {
    // insufficient credits marked on call
    await insert('UPDATE calls SET error = ? WHERE id = ?', [`Credit deduction failed: ${err.message}`, dbId]);
    console.error('Credit deduction failed', err.message);
  }

  // update lead
  if (leadId) {
    const fields = { status: 'contacted', outcome };
    if (outcome === 'interested') fields.status = 'interested';
    if (outcome === 'converted') fields.status = 'converted';
    if (outcome === 'not_interested') fields.status = 'not_interested';
    if (outcome === 'callback') fields.status = 'callback_requested';
    const sets = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
    await insert(`UPDATE leads SET ${sets}, last_call_id = ?, employee_id = COALESCE(employee_id, ?) WHERE id = ?`,
      [...Object.values(fields), dbId, employee.id, leadId]);
  }

  // campaign lead
  if (campaignId && leadId) {
    const campStatus = status === 'completed' ? 'completed' : status;
    await insert('UPDATE campaign_leads SET status = ?, called_at = NOW() WHERE campaign_id = ? AND lead_id = ?',
      [campStatus, campaignId, leadId]);
    await insert('UPDATE campaigns SET processed_leads = processed_leads + 1 WHERE id = ?', [campaignId]);
    if (status === 'completed') await insert('UPDATE campaigns SET completed_leads = completed_leads + 1 WHERE id = ?', [campaignId]);
    else await insert('UPDATE campaigns SET failed_leads = failed_leads + 1 WHERE id = ?', [campaignId]);
  }

  const payload = {
    callId,
    callDbId: dbId,
    employeeId: employee.id,
    phoneNumber,
    status,
    duration,
    outcome,
    creditsUsed,
    recordingUrl,
  };
  realtime.emit(org.id, 'call.completed', payload);

  if (status === 'completed') {
    dispatch(org.id, 'call.completed', payload).catch(() => {});

    // Automated WhatsApp Follow-up
    if (phoneNumber) {
      try {
        const { sendFollowUp } = require('./whatsappService');
        sendFollowUp({
          to: phoneNumber,
          employeeName: employee?.name || 'Charan',
          outcome,
          summary: analysis?.summary || 'Spoke with customer regarding business services',
          nextAction: analysis?.nextAction || 'Sending quotation and demo link on WhatsApp',
        }).catch((err) => console.warn('[call] WhatsApp follow-up note:', err.message));
      } catch {}
    }

    // Automated Call Summary Email
    try {
      const { sendCallSummaryEmail } = require('./mail');
      sendCallSummaryEmail({
        callId,
        duration,
        transcript,
        employeeName: employee?.name || 'Charan',
      }).catch((err) => console.warn('[call] Summary email note:', err.message));
    } catch {}
  } else {
    dispatch(org.id, 'call.failed', payload).catch(() => {});
  }
  return payload;
}

async function failCall(dbId, status, reason) {
  await insert('UPDATE calls SET status = ?, error = ? WHERE id = ?', [status, reason, dbId]);
  const row = await queryOne('SELECT * FROM calls WHERE id = ?', [dbId]);
  realtime.emit(row.organization_id, 'call.failed', { callId: row.call_id, callDbId: dbId, error: reason, status });
  dispatch(row.organization_id, 'call.failed', { callId: row.call_id, status, error: reason }).catch(() => {});
}

const recentInstantCalls = new Map();

async function startInstantCall({ org, user, employeeId, phoneNumber, purpose, name = null, from = null, isTest = false }) {
  const instantKey = `${org.id}:${phoneNumber}`;
  const lastCallTime = recentInstantCalls.get(instantKey);
  if (lastCallTime && Date.now() - lastCallTime < 4000) {
    throw new AppError('A call was just initiated to this number. Please wait a moment before dialing again.', 429, 'RATE_LIMITED');
  }
  recentInstantCalls.set(instantKey, Date.now());
  setTimeout(() => recentInstantCalls.delete(instantKey), 6000);

  const { employee, knowledge } = await getEmployeeContext(org.id, employeeId, { allowPaused: isTest });
  // create or reuse lead
  const existing = await queryOne('SELECT * FROM leads WHERE organization_id = ? AND phone = ?', [org.id, phoneNumber]);
  let leadId = existing?.id || null;
  const explicitName = (name && name.trim() && name.trim() !== 'Customer' && name.trim() !== 'Instant Lead' && name.trim().toLowerCase() !== 'optional') ? name.trim() : null;
  const leadName = explicitName || null;
  const explicitPurpose = (purpose && purpose.trim() && purpose.trim().toLowerCase() !== 'optional') ? purpose.trim() : null;
  // Use explicit purpose for this call if entered; otherwise derive purpose from the selected employee's actual objective or role.
  // Never inherit an old stale purpose from a previous call with a different employee!
  const callPurpose = explicitPurpose || employee.objective || employee.role || null;

  if (!leadId) {
    const r = await insert(
      'INSERT INTO leads (organization_id, name, phone, purpose, status, employee_id) VALUES (?,?,?,?,?,?)',
      [org.id, leadName, phoneNumber, callPurpose, 'new', employeeId]
    );
    leadId = r.insertId;
  } else {
    // Update existing lead with the current call's employee, purpose and name (preserving existing name if omitted)
    await update('UPDATE leads SET name = COALESCE(?, name), purpose = ?, employee_id = ? WHERE id = ?', [leadName, callPurpose, employeeId, leadId]);
  }
  const phoneNumbers = await query("SELECT * FROM phone_numbers WHERE organization_id = ? AND status = 'active' AND employee_id = ?",
    [org.id, employeeId]);
  let assignedFrom = from || phoneNumbers[0]?.number || null;
  if (!assignedFrom) {
    const orgPhoneNumbers = await query("SELECT * FROM phone_numbers WHERE organization_id = ? AND status = 'active' ORDER BY id ASC LIMIT 1", [org.id]);
    assignedFrom = orgPhoneNumbers[0]?.number || config.providers?.vobiz?.phoneNumber || '+918065354620';
  }

  const check = await getWallet(org.id);
  if (check.balance <= 0.01) throw new AppError('Insufficient credits. Please purchase credits to make calls.', 402, 'INSUFFICIENT_CREDITS');

  const { callId, row } = await createCallRecord({
    org, employee, phoneNumber, direction: 'outbound', leadId, from: assignedFrom,
  });

  if (leadId && row?.id) {
    await update('UPDATE leads SET last_call_id = ?, employee_id = COALESCE(employee_id, ?) WHERE id = ?', [row.id, employeeId, leadId]).catch(() => {});
  }

  // run async
  const runner = Promise.resolve().then(() =>
    executeCall({ org, employee, phoneNumber, from: assignedFrom, purpose, leadId, callId, callDbId: row.id })
  ).catch((err) => failCall(row.id, 'failed', err.message));

  running.set(callId, { promise: runner, cancel: () => {} });

  const wallet = await getWallet(org.id);
  return { callId, status: 'preparing', leadId, estimatedCredits: estimateCallCredits(120, 2), walletBalance: wallet.balance };
}

module.exports = {
  startInstantCall,
  executeCall,
  getEmployeeContext,
  createCallRecord,
  running,
  estimateCallCredits,
};
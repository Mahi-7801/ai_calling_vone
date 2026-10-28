const { safeJson } = require('../utils/helpers');

const REAL_HUMAN_TELUGU = `మీరు ఒక నిజమైన, ఆప్యాయమైన మరియు అత్యంత సహజమైన మానవ ప్రతినిధిగా (Professional Human Telecaller) ఫోన్‌లో మాట్లాడుతున్నారు.
ఎప్పుడూ రోబోట్, కంప్యూటర్ లేదా AI లాగా మాట్లాడవద్దు.

# PROJECT: HUMAN BEHAVIOR-BASED AI TELECALLER SYSTEM

1. పాత్ర మరియు ఉద్దేశ్యం (Role & Objective):
- కస్టమర్ మనోభావాలు, ఆసక్తి స్థాయి, సందేహాలు, సంకోచాలను అర్థం చేసుకుని గౌరవంగా, నమ్మకంగా, నెమ్మదిగా మాట్లాడండి.
- కస్టమర్‌పై ఒత్తిడి తీసుకురాకుండా, వారి అవసరాన్ని ముందుగా అర్థం చేసుకుని సరైన తదుపరి చర్యను (Next Step) మాత్రమే ప్రతిపాదించండి.

2. మానవ ప్రవర్తనా నియమాలు (Human Behavior Rules):
- నియమం 1: తొలి పరిచయం & అనుమతి (First Impression & Permission):
  * గౌరవప్రదమైన పలకరింపుతో ప్రారంభించండి ("నమస్కారం అండి! నా పేరు...").
  * మాట్లాడటానికి అనుమతి అడగండి ("మీతో ఒక్క నిమిషం మాట్లాడవచ్చా అండి?").
  * కాల్ చేయడానికి గల కారణాన్ని కేవలం ఒక్క చిన్న వాక్యంలో స్పష్టంగా చెప్పండి.
- నియమం 2: ఒకేసారి ఒకే చిన్న ప్రశ్న (One Question at a Time):
  * ఎప్పుడూ ఒకే టర్న్‌లో ఒక చిన్న ప్రశ్న మాత్రమే అడగండి.
  * కస్టమర్ సమాధానం చెప్పేంతవరకు ఓపికగా ఆగండి. వారి మాటను మధ్యలో అడ్డుకోవద్దు.
  * కస్టమర్ సమాధానాన్ని బట్టి మాత్రమే తదుపరి ప్రశ్నను నిర్ణయించండి.
- నియమం 3: కస్టమర్ మూడ్ అర్థం చేసుకోవడం (Customer Mood Classification):
  * కస్టమర్ స్పందనను బట్టి వర్గీకరించండి: Interested, Curious, Neutral, Busy, Confused, Hesitant, Frustrated, Uninterested, Ready to proceed.
- నియమం 4: కస్టమర్ ప్రవర్తనకు అనుగుణంగా స్పందించడం (Adapt to Customer Behavior):
  * ఆసక్తిగా ఉంటే (Interested): తదుపరి వివరాలు తెలిపి 2 నిర్దిష్ట సమయాలతో ఉచిత డెమో క్లాస్ / అపాయింట్‌మెంట్ ఆఫర్ చేయండి (ఉదా: "రేపు సాయంత్రం 5:30కి లేదా శనివారం ఉదయం 10:00కి").
  * బిజీగా ఉంటే (Busy): క్షమాపణ చెప్పి, మరొకసారి ఎప్పుడు కాల్ చేయాలో అనువైన సమయం కనుక్కోండి.
  * గందరగోళంగా ఉంటే (Confused): అతి సులువైన మాటల్లో వివరించండి.
  * సందేహిస్తుంటే (Hesitant): వారి అసలైన సందేహాన్ని కనుక్కొని నిజాయితీగా సమాధానం ఇవ్వండి. ఎప్పుడూ తొందరపెట్టవద్దు.
  * అసహనంగా ఉంటే (Frustrated): ప్రశాంతంగా ఉండి, అసౌకర్యాన్ని అంగీకరించండి. వాదించవద్దు.
  * ఆసక్తి లేకపోతే (Uninterested): వారి నిర్ణయాన్ని గౌరవించి, వెంటనే కాల్ ముగించండి.
- నియమం 5: యాక్టివ్ లిజనింగ్ (Active Listening):
  * కస్టమర్ పేరు (గారు), అవసరాలు, కోర్సు/సేవ గుర్తుంచుకోండి.
  * సహజమైన స్పందనలు వాడండి: "అర్థమైందండి", "ఖచ్చితంగా అండి", "చాలా మంచిది అండి".
- నియమం 6: అభ్యంతరాల పరిష్కారం (Objection Handling):
  * ధర / ఫీజు ఎక్కువంటే: ఫీజులు బ్యాచ్ మరియు డ్యూరేషన్‌పై ఆధారపడి ఉంటాయని తెలిపి, ముందుగా ఉచిత డెమో క్లాస్‌లో పాల్గొని ఫ్యాకల్టీని చూడమని చెప్పండి.
  * ఆలోచించుకుంటాం / పేరెంట్స్‌తో మాట్లాడాలంటే: గౌరవించి, పేరెంట్స్ కూడా డెమో క్లాస్‌లో పాల్గొనవచ్చని చెప్పండి.
  * వివరాలు పంపమంటే: ఏ వివరాలు కావాలో తెలుసుకుని వాట్సాప్‌లో పంపుతామని చెప్పి, డెమో స్లాట్ నిర్ధారించండి.
  * నంబర్ ఎలా వచ్చిందంటే: ఆన్‌లైన్ పోర్టల్‌లో ఉచిత మెటీరియల్ / డెమో కోసం రిజిస్టర్ చేసుకున్న వివరాల ఆధారంగా కాల్ చేశామని నిజాయితీగా చెప్పండి.

3. సంభాషణ శైలి & స్వర నియమాలు (Voice & Tone Rules):
- 100% తెలుగు లిపిలోనే రాయండి. ఆంగ్ల అక్షరాలు, సంఖ్యలు సంఖ్యలుగా కాకుండా మాటల్లో పలకండి.
- కేవలం 1 లేదా 2 చిన్న వాక్యాలు మాత్రమే మాట్లాడండి (గరిష్టంగా 15-20 పదాలు).
- వాక్యాలలో సహజమైన శ్వాస విరామాల కోసం కామా (,) వాడండి.
- ఎమోజీలు, నక్షత్రాలు (*), బుల్లెట్ పాయింట్లు వంటివి వాడవద్దు.

4. కాల్ ముగింపు నియమాలు (Call Ending Rules - Most Important):
- కస్టమర్ ఆసక్తి లేదని చెబితే ("వద్దు", "నాకు వద్దు", "ఇంట్రెస్ట్ లేదు", "not interested"):
  * ఇక ఎలాంటి ప్రశ్నలు అడగవద్దు.
  * కేవలం ఈ ఒక్క మాట మాత్రమే చెప్పండి: "సరే అండి, మీ సమయానికి ధన్యవాదాలు. ఉంటానండి."
  * ఆపై వెంటనే కాల్ ముగించండి.
- "కాల్ కట్ చేయండి" లేదా "ఫోన్ పెట్టేయండి" అన్న వెంటనే కూడా గౌరవంగా కాల్ ముగించండి.`;

const BASE_TELUGU = REAL_HUMAN_TELUGU;

// Per-source slice caps. The prompt is sent on every single turn of a live call,
// and input token count is the primary driver of time-to-first-token, so an
// unbounded document dump costs latency on every reply.
const DOC_TEXT_LIMIT = 3000;
const SCRIPT_TEXT_LIMIT = 2000;
const TOTAL_KNOWLEDGE_LIMIT = 12000;

/**
 * Render everything taught through Train Employees into one block.
 *
 * This used to live inside the "no stored prompt" branch, so an employee that
 * had a system_prompt persisted at creation time never got any of it - the whole
 * training feature wrote rows the model could not read. It is now a separate
 * step that always runs.
 */
function buildKnowledgeBlock(knowledge) {
  if (!knowledge) return '';

  const sections = [];
  const rows = (v) => (Array.isArray(v) ? v : v ? [v] : []);

  for (const k of rows(knowledge.text)) {
    if (!k) continue;
    sections.push(typeof k === 'string'
      ? `Knowledge: ${k}`
      : `Knowledge: ${k.title ? `[${k.title}] ` : ''}${k.content || ''}`);
  }

  const qa = (knowledge.faqs || [])
    .filter((f) => f && (f.question || f.answer))
    .map((f) => `Q: ${f.question || ''}\nA: ${f.answer || ''}`);
  if (qa.length) sections.push(`Company FAQs:\n${qa.join('\n')}`);

  for (const s of knowledge.scripts || []) {
    if (s?.content) sections.push(`Script (${s.name || 'Script'}):\n${String(s.content).slice(0, SCRIPT_TEXT_LIMIT)}`);
  }

  const examples = (knowledge.examples || [])
    .filter((e) => e && (e.customer_text || e.ideal_response))
    .map((e) => `Customer: ${e.customer_text || ''}\nIdeal reply: ${e.ideal_response || ''}`);
  if (examples.length) sections.push(`Conversation examples:\n${examples.join('\n')}`);

  for (const d of knowledge.docs || []) {
    if (d?.extracted_text) sections.push(`Document (${d.name}):\n${String(d.extracted_text).slice(0, DOC_TEXT_LIMIT)}`);
  }

  return sections.join('\n\n').slice(0, TOTAL_KNOWLEDGE_LIMIT);
}

function buildSystemPrompt(employee, org = {}, knowledge = null, lead = null) {
  let prompt = '';
  let stored = typeof employee?.system_prompt === 'string' ? employee.system_prompt.trim() : '';

  if (stored) {
    stored = stored
      .replace(/You are an AI voice employee at a real company\./gi, `You are a real, warm, natural human telephony advisor at ${org.name || 'our company'}. NEVER speak, act, or sound like an artificial intelligence, robot, or automated assistant. You are a genuine human colleague having a real, polite phone conversation.`)
      .replace(/మీరు ఒక ప్రొఫెషనల్ తెలుగు AI ఉద్యోగి\./gi, 'మీరు ఒక నిజమైన, ఆప్యాయమైన కంపెనీ రిప్రజెంటేటివ్.')
      .replace(/AI ఉద్యోగి/gi, 'కంపెనీ ప్రతినిధి')
      .replace(/AI అసిస్టెంట్/gi, 'కన్సల్టెంట్');
  }

  if (stored.length > 20) {
    // The persisted prompt holds persona and behavioural rules only. Trained
    // content is composed fresh on every request so that teaching the employee
    // something takes effect on the very next turn.
    prompt = stored;
    if (!prompt.includes('నిజమైన మనుషుల సహజమైన సంభాషణ నియమాలు')) {
      prompt = `${prompt}\n\n${REAL_HUMAN_TELUGU}`;
    }
  } else {
    const sections = [
      `You are a real, warm, natural human telephony advisor at ${org.name || 'our company'}. NEVER speak, act, or sound like an artificial intelligence, robot, or automated assistant. You are a genuine human colleague having a real, polite phone conversation.`
    ];
    sections.push(`Company: ${org.name || 'the company'}`);
    if (org.business_type) sections.push(`Business type: ${org.business_type}`);
    if (org.calling_purpose) sections.push(`Calling purpose: ${org.calling_purpose}`);

    sections.push(`Employee name: ${employee.name}`);
    if (employee.role) sections.push(`Role: ${employee.role}`);
    if (employee.department) sections.push(`Department: ${employee.department}`);
    sections.push(`Primary language: ${employee.language} (${employee.language_code || 'te-IN'})`);
    if (employee.personality) sections.push(`Personality: ${employee.personality}`);
    if (employee.tone) sections.push(`Tone: ${employee.tone}`);
    if (employee.speaking_style) sections.push(`Speaking style: ${employee.speaking_style}`);
    if (employee.formality) sections.push(`Formality: ${employee.formality}`);
    if (employee.persona) sections.push(`Persona: ${employee.persona}`);

    if (employee.greeting) sections.push(`Greeting: "${employee.greeting}"`);
    if (employee.objective) sections.push(`Call objective: ${employee.objective}`);
    if (employee.goodbye_message) sections.push(`Goodbye message: "${employee.goodbye_message}"`);
    if (employee.never_say) sections.push(`Never say: ${employee.never_say}`);
    if (employee.instructions) sections.push(`Behavioral instructions: ${employee.instructions}`);

    sections.push(REAL_HUMAN_TELUGU);
    prompt = sections.join('\n\n');
  }

  const knowledgeBlock = buildKnowledgeBlock(knowledge);
  if (knowledgeBlock) {
    prompt = `${prompt}\n\n--- TRAINED KNOWLEDGE (use these facts to answer) ---\n${knowledgeBlock}`;
  }

  // Inject dynamic lead name & reason for the call across all employees
  const rawLeadName = (lead?.name || '').trim();
  const rawPurpose = (lead?.purpose || '').trim();
  const leadName = rawLeadName && rawLeadName !== 'Customer' && rawLeadName !== 'Instant Lead' ? rawLeadName : '';
  const lang = (employee?.language_code || 'te').toLowerCase();
  const honorific = leadName ? (lang.startsWith('hi') ? `${leadName} जी` : lang.startsWith('en') ? leadName : `${leadName} గారు`) : '';

  if (leadName) {
    prompt = prompt.replace(/\{lead_name\}|\{customer_name\}|\{lead\}|\{customer\}/gi, honorific);
  }
  if (rawPurpose) {
    prompt = prompt.replace(/\{purpose\}|\{reason\}/gi, rawPurpose);
  }

  if (leadName || rawPurpose) {
    const leadSection = `
--- SPECIFIC CALL INSTRUCTIONS & LEAD CONTEXT ---
Target Customer Name: ${leadName ? `${leadName} (${honorific})` : 'Valued Customer'}
Reason for this Call / Inquiry: "${rawPurpose || 'General business inquiry'}"
CRITICAL RULES FOR THIS LEAD:
1. Always address the customer with respect by their name ("${honorific || 'అండి'}") throughout the conversation.
2. The customer reached out / needs assistance regarding: "${rawPurpose || 'our services'}".
3. Frame and ask all your questions around their specific reason ("${rawPurpose || 'their requirements'}"). Ask clear, focused qualifying questions to understand their exact needs, timeline, and how we can best assist them.
4. Do NOT ask unrelated or generic questions. Every question must guide this specific customer ("${honorific || 'the customer'}") forward on their inquiry.`;

    prompt = `${prompt}\n\n${leadSection}`;
  }

  return prompt;
}

function estimateCallCredits(durationSeconds, creditPerMinute = 2) {
  return Math.max(1, Math.round((durationSeconds / 60) * creditPerMinute * 100) / 100);
}

/**
 * Read everything an employee has been taught. Used by every live-call path so
 * no caller has to remember to pass `knowledge` to buildSystemPrompt - which is
 * exactly how it came to be silently dropped.
 *
 * Required lazily so this module stays usable in contexts without a DB handle.
 */
async function loadEmployeeKnowledge(employeeId) {
  if (!employeeId) return null;
  const { query } = require('../config/db');
  const [text, faqs, docs, scripts, examples] = await Promise.all([
    query('SELECT * FROM employee_knowledge WHERE employee_id = ?', [employeeId]),
    query('SELECT * FROM employee_faqs WHERE employee_id = ?', [employeeId]),
    query("SELECT * FROM employee_documents WHERE employee_id = ? AND status = 'ready'", [employeeId]),
    query('SELECT * FROM employee_scripts WHERE employee_id = ?', [employeeId]),
    query('SELECT * FROM employee_examples WHERE employee_id = ?', [employeeId]),
  ]);
  return { text, faqs, docs, scripts, examples };
}

module.exports = { buildSystemPrompt, buildKnowledgeBlock, loadEmployeeKnowledge, estimateCallCredits, BASE_TELUGU };
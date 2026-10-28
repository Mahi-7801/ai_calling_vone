const { query, queryOne } = require('../src/config/db');

async function updateAllToVone() {
  console.log('>>> Updating Organization and Employee records to Vone and Charan...');

  // 1. Update Organization
  await query("UPDATE organizations SET name = 'Vone' WHERE id = 1");
  console.log('[db] Organization 1 name set to "Vone"');

  // 2. Update Employee 3 (Charan)
  const charanGreeting = 'నమస్కారం అండి! నేను Vone నుండి చరణ్ మాట్లాడుతున్నాను. మీరు మా వెబ్ డెవలప్‌మెంట్ మరియు వాట్సాప్ CRM సేవల గురించి ఎంక్వైరీ చేసినందుకు ధన్యవాదాలు. మీకు ఎలాంటి వివరాలు కావాలో చెప్పండి.';
  const charanSystemPrompt = `You are Charan (చరణ్), a professional and friendly Telugu AI voice consultant representing Vone.
Company: Vone
Agent Name: Charan (చరణ్)
Role: Web Development & WhatsApp CRM Consultant

Services & Pricing:
- Web Development: Starter Website from ₹15,000. Custom React/Next.js/Full-Stack from ₹35,000. Dedicated expert developers available.
- WhatsApp CRM: Setup ₹9,999. Monthly maintenance ₹1,499. Features: Official WhatsApp API, automatic lead capture, 24/7 chatbot, bulk messaging, order notifications.
- Combo Package: Web Development + WhatsApp CRM for ₹24,999.

Guidelines:
1. Speak in pure, polite, and natural conversational Telugu. Always address the customer with respect using 'అండి'.
2. Listen carefully to what the customer says and answer their specific question directly.
3. Keep answers concise (1-2 sentences) so the customer can converse easily over the phone.
4. If customer greets (hello/hi/నమస్తే): Warmly greet them and ask how you can help.
5. If customer asks about IT company/business fit: Assure them that Vone provides tailored solutions for their specific business needs.
6. Do not repeat the same question. Answer their question first.`;

  await query(`
    UPDATE ai_employees
    SET name = 'Charan',
        greeting = ?,
        system_prompt = ?,
        description = 'Official Telugu AI Consultant for Vone handling enquiries for Web Development, WhatsApp CRM, and pricing.'
    WHERE id = 3
  `, [charanGreeting, charanSystemPrompt]);
  console.log('[db] Employee 3 updated to Charan at Vone');

  // 3. Update FAQs for Employee 3
  await query(`
    UPDATE employee_faqs
    SET answer = 'అవును అండి! మా Vone కంపెనీ ద్వారా అనుభవజ్ఞులైన ఫుల్-స్టాక్ వెబ్ డెవలపర్లను మరియు కస్టమ్ వెబ్‌సైట్ డెవలప్‌మెంట్ సర్వీసులను అందిస్తున్నాము. బిజినెస్ వెబ్‌సైట్‌లు, ఈ-కామర్స్ మరియు కస్టమ్ సాఫ్ట్‌వేర్ తయారు చేస్తాము.'
    WHERE id = 3
  `);
  await query(`
    UPDATE employee_faqs
    SET answer = 'మా Vone వాట్సాప్ CRM లో అఫీషియల్ వాట్సాప్ API, ఆటోమేటిక్ లీడ్ క్యాప్చర్, 24/7 ఆటో-చాట్‌బాట్, బల్క్ మెసేజింగ్, ఆర్డర్ నోటిఫికేషన్లు మరియు టీమ్ షేర్డ్ ఇన్‌బాక్స్ ఫీచర్లు ఉంటాయి.'
    WHERE id = 4
  `);
  await query(`
    UPDATE employee_faqs
    SET answer = 'స్టార్టర్ బిజినెస్ వెబ్‌సైట్ ₹15,000 నుండి, కస్టమ్ వెబ్ అప్లికేషన్ ₹35,000 నుండి ప్రారంభమవుతాయి. వాట్సాప్ CRM సెటప్ ₹9,999 నుండి లభిస్తుంది. వెబ్ మరియు CRM కాంబో ప్యాకేజ్ కేవలం ₹24,999 మాత్రమే.'
    WHERE id = 5
  `);

  // 4. Update Knowledge
  await query(`
    UPDATE employee_knowledge
    SET content = 'Vone is a premier IT solutions provider offering: 1) Full-Stack Web Development (React, Next.js, Node.js, MySQL/PostgreSQL), 2) WhatsApp CRM & Marketing Automation with Official WhatsApp Business API, 3) AI Voice Calling & Customer Support Automation. Pricing: Web Starter @ ₹15k, Web Pro @ ₹35k, WhatsApp CRM @ ₹9,999. Contact: info@vone.in / Phone: +91 6301400137.'
    WHERE employee_id = 3
  `);
  console.log('[db] Updated FAQs and Knowledge base to Vone');

  const emp = await queryOne('SELECT id, name, greeting FROM ai_employees WHERE id = 3');
  const org = await queryOne('SELECT id, name FROM organizations WHERE id = 1');
  console.log('>>> Verification:');
  console.log('Organization:', org);
  console.log('Employee:', emp);
  process.exit(0);
}

updateAllToVone().catch((err) => {
  console.error('Update error:', err);
  process.exit(1);
});

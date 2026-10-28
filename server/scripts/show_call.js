const { query, queryOne } = require('../src/config/db');

async function showCall() {
  const call = await queryOne('SELECT * FROM calls ORDER BY id DESC LIMIT 1');
  if (!call) return;
  const transcripts = await query('SELECT speaker, text, ts FROM call_transcripts WHERE call_id = ? ORDER BY id ASC', [call.id]);
  const outcome = await queryOne('SELECT * FROM call_outcomes WHERE call_id = ?', [call.id]);

  console.log('===============================================================');
  console.log(`  VONE AI CALL REPORT: ${call.call_id}`);
  console.log(`  To Phone: ${call.phone_number}`);
  console.log(`  Status: ${call.status}`);
  console.log(`  Outcome: ${call.outcome}`);
  console.log(`  Duration: ${call.duration} seconds`);
  console.log(`  Summary: ${call.summary}`);
  console.log('===============================================================\n');

  for (const t of transcripts) {
    const role = t.speaker === 'ai' ? 'కార్తీక్ (Vone AI)' : 'కస్టమర్ (6301400137)';
    console.log(`[${role}] [${t.ts}s]:`);
    console.log(`"${t.text}"\n`);
  }

  process.exit(0);
}

showCall();

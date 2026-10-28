const { TwilioProvider } = require('../src/providers/telephony/twilio');
const { queryOne } = require('../src/config/db');

async function makeVoneCall(toNumber = '+916301400137') {
  console.log(`[vone-call] Fetching Charan from Vone Digitals...`);
  const emp = await queryOne('SELECT * FROM ai_employees WHERE id = 3');
  const twilio = new TwilioProvider();

  console.log(`[vone-call] Initiating two-way AI call to ${toNumber}...`);
  console.log(`[vone-call] Agent: ${emp.name} | Voice: ${emp.voice}`);

  const callId = 'call_charan_' + Date.now();
  const res = await twilio.makeCall({
    to: toNumber,
    from: twilio.fromNumber,
    employee: emp,
    callId,
  });

  console.log('====================================================');
  console.log('  CALL SUCCESSFULLY INITIATED!');
  console.log(`  SID: ${res.providerCallId}`);
  console.log(`  Status: ${res.status}`);
  console.log(`  Audio: ${res.audioUrl}`);
  console.log('====================================================');
  console.log('\nCall Instructions:');
  console.log('1. Answer the call on your phone.');
  console.log('2. Press "1" when Twilio prompts trial confirmation.');
  console.log('3. Charan will greet you from Vone Digitals in pure Telugu.');
  console.log('4. Speak naturally (e.g. ask for Web Development or WhatsApp CRM).');
  console.log('5. Charan will listen, remember your context, and answer intelligently without infinite loops!\n');

  // Poll status for 30s
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const s = await twilio.getCallStatus(res.providerCallId);
    console.log(`[Status ${(i + 1) * 2}s] ${s.status} (Duration: ${s.duration}s)`);
    if (s.status === 'completed') break;
  }
  process.exit(0);
}

const targetNumber = process.argv[2] || '+916301400137';
makeVoneCall(targetNumber).catch((err) => {
  console.error('[vone-call] Error:', err);
  process.exit(1);
});

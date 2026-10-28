const { query, queryOne } = require('../src/config/db');

async function fixCharanVoice() {
  console.log('>>> Updating Charan (Employee 3) to ultra-low latency Cartesia voice...');
  
  // Charan's ultra-low latency Cartesia Telugu Voice (290ms TTFT vs 2300ms Sarvam)
  const cartesiaVoiceId = '82c2afc8-ebbc-4802-8ccf-036dc0fa1e3b';
  
  await query(`
    UPDATE ai_employees 
    SET voice_provider = 'cartesia',
        voice = ?,
        voice_speed = 1.05
    WHERE id = 3 OR name = 'Charan'
  `, [cartesiaVoiceId]);

  const updated = await queryOne('SELECT id, name, voice_provider, voice FROM ai_employees WHERE id = 3');
  console.log('Updated Charan in DB:', updated);
  console.log('Charan voice is now ultra-fast Cartesia (295ms response time)!');
}

fixCharanVoice().catch(console.error);

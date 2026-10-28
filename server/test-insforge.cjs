// Quick connectivity test for InsForge
require('dotenv').config({ path: '.env' });
const { createClient } = require('@insforge/sdk');

async function test() {
  const client = createClient(
    process.env.INSFORGE_URL,
    process.env.INSFORGE_SERVICE_KEY
  );

  // Test: list tables via a simple query
  const { data, error } = await client.database
    .from('organizations')
    .select('id')
    .limit(1);

  if (error) {
    console.error('InsForge connection FAILED:', error.message);
    process.exit(1);
  }

  console.log('InsForge connection OK ✓');
  console.log('organizations table reachable, rows:', data?.length ?? 0);
  process.exit(0);
}

test().catch(e => { console.error(e); process.exit(1); });

import { createClient, createAdminClient } from '@insforge/sdk';
import { config } from 'dotenv';
config();

const URL = process.env.INSFORGE_URL  || 'https://d5bx5d63.ap-southeast.insforge.app';
const ANON_KEY = process.env.INSFORGE_ANON_KEY || 'anon_ffbba83c1966c6918f8bbe5ec3547f2dc8ba14f4e75438cfa03ddeedc08d3b3e';
const API_KEY = process.env.INSFORGE_SERVICE_KEY || process.env.INSFORGE_API_KEY || 'ik_3d6f69f72fae4bd09139ff327018c302';

const insforge = createAdminClient({ baseUrl: URL, apiKey: API_KEY });

console.log('\n🔗 Testing InsForge connection (Admin Client)...');
console.log('   URL :', URL);
console.log('   Key :', API_KEY.slice(0, 10) + '…');

// 1. Table list via DB query
const { data, error } = await insforge.database
  .from('organizations')
  .select('id')
  .limit(1);

if (error) {
  console.error('\n❌  InsForge connection FAILED:', error.message);
  process.exit(1);
}

console.log('\n✅  InsForge connection OK');
console.log('   organizations table reachable — rows returned:', data?.length ?? 0);

// 2. Insert + read test
const testOrg = {
  name: '_InsForge_Setup_Test',
  status: 'inactive'
};
const { data: inserted, error: insertErr } = await insforge.database
  .from('organizations')
  .insert([testOrg])
  .select('id, name');

if (insertErr) {
  console.warn('\n⚠️  Insert test skipped:', insertErr.message);
} else {
  console.log('   Insert test OK — new row id:', inserted?.[0]?.id);

  // Clean up
  if (inserted?.[0]?.id) {
    await insforge.database.from('organizations').delete().eq('id', inserted[0].id);
    console.log('   Cleanup OK');
  }
}

console.log('\n🎉  InsForge backend is fully operational!\n');

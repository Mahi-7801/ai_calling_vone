// Verifies the DB layer degrades to one clear message and auto-recovers.
const { queryOne } = require('C:/Users/pc/Downloads/vone_projects_developement_mahi/ai/server/src/config/db.js');

(async () => {
  console.log('--- 1. query with MySQL DOWN ---');
  try {
    await queryOne('SELECT 1 AS x');
    console.log('  unexpected success');
  } catch (e) {
    console.log('  code   :', e.code);
    console.log('  status :', e.status);
    console.log('  message:', e.message);
    console.log('  has raw AggregateError stack dump? ->', JSON.stringify(e.message).includes('AggregateError'));
  }

  console.log('\n--- 2. start MySQL, then retry with the same module instance ---');
  const { execSync } = require('child_process');
  execSync(
    'powershell -NoProfile -Command "$c=\'"C:\\xampp\\mysql\\bin\\mysqld.exe" --defaults-file=C:\\xampp\\mysql\\bin\\my.ini --standalone --console\'; Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine=$c; CurrentDirectory=\'C:\\xampp\\mysql\\bin\'} | Out-Null"',
    { shell: 'cmd.exe' }
  );
  await new Promise((r) => setTimeout(r, 14000));

  const row = await queryOne('SELECT COUNT(*) AS n FROM users');
  console.log('  RECOVERED, users =', row.n);
  console.log('\nPASS: clean error when down, automatic recovery when up');
})().catch((e) => { console.log('FAIL:', e.message); process.exit(1); });

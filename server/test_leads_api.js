const { query } = require('./src/config/db');

async function check() {
  const lc = await query('SELECT * FROM lead_contacts');
  console.log('lead_contacts rows:', lc.length, lc);

  const calls = await query('SELECT id, phone_number, customer_name, purpose, outcome, status, sentiment FROM calls ORDER BY id DESC LIMIT 10');
  console.log('calls rows:', calls.length, calls);
}

check().catch(console.error);

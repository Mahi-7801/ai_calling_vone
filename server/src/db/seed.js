const bcrypt = require('bcryptjs');
const { migrate } = require('./schema');
const { query, insert } = require('../config/db');

async function seed() {
  await migrate();

  // Default admin settings (configurable pricing etc.)
  const adminCount = await query('SELECT COUNT(*) AS c FROM admin_settings');
  if (adminCount[0].c === 0) {
    await insert(
      `INSERT INTO admin_settings (section, data) VALUES (?, ?)`,
      ['pricing', JSON.stringify({
        creditPerMinute: 2,
        packages: [
          { key: 'starter', name: 'Starter', price: 999, credits: 500 },
          { key: 'growth', name: 'Growth', price: 2999, credits: 2000 },
          { key: 'business', name: 'Business', price: 7999, credits: 6000 },
          { key: 'enterprise', name: 'Enterprise', price: 19999, credits: 20000 },
        ],
      })]
    );
    await insert(`INSERT INTO admin_settings (section, data) VALUES (?, ?)`, ['providers', JSON.stringify({
      telephony: 'vobiz',
      voice: 'cartesia',
      ai: 'llm',
      payment: 'razorpay',
    })]);
    console.log('  ok  admin_settings seeded');
  }

  // If any organization already exists, skip demo seeding completely
  const existingOrgs = await query('SELECT COUNT(*) AS c FROM organizations');
  if (existingOrgs[0].c > 0) {
    console.log('Database already has active organizations. Skipping mock data.');
    return;
  }

  const orgRes = await insert(
    'INSERT INTO organizations (name, business_type, calling_purpose, preferred_language, credit_balance) VALUES (?, ?, ?, ?, ?)',
    ['Telugu AI Calling Demo', 'Technology', 'Sales & Lead Generation', 'Telugu', 1000]
  );
  const orgId = orgRes.insertId;

  const passwordHash = await bcrypt.hash('demo1234', 10);
  const adminPasswordHash = await bcrypt.hash('admin1234', 10);
  const userRes = await insert(
    'INSERT INTO users (organization_id, role, name, email, password_hash, email_verified_at, first_login, status) VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)',
    [orgId, 'owner', 'Demo User', 'demo@aicalling.local', passwordHash, 0, 'active']
  );
  const userId = userRes.insertId;

  await insert(
    'INSERT INTO users (organization_id, role, name, email, password_hash, email_verified_at, first_login, status) VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)',
    [orgId, 'admin', 'Platform Superadmin', 'admin@aicalling.local', adminPasswordHash, 0, 'active']
  );

  await insert('INSERT INTO organization_members (organization_id, user_id, role) VALUES (?, ?, ?)', [orgId, userId, 'owner']);
  await insert('INSERT INTO credit_wallets (organization_id, balance, lifetime_used, lifetime_purchased) VALUES (?, ?, ?, ?)', [orgId, 1000, 0, 1000]);
  await insert('INSERT INTO credit_transactions (organization_id, type, amount, balance_after, description, reference) VALUES (?, ?, ?, ?, ?, ?)',
    [orgId, 'credit', 1000, 1000, 'Welcome credits', 'seed-welcome']);

  // No mock employees, leads, calls or fake numbers are seeded.
  // The system only serves real-time data created by authenticated users.
  console.log('Seed complete. Ready for real user employees and carrier data.');
}

if (require.main === module) {
  seed().then(() => process.exit(0)).catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}

module.exports = { seed };
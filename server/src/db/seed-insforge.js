const bcrypt = require('bcryptjs');
const db = require('../config/db');

async function seed() {
  console.log('Seeding InsForge database...');

  // 1. Admin settings
  const adminCount = await db.query('SELECT COUNT(*) AS c FROM admin_settings');
  const count = Number(adminCount[0]?.c || 0);
  if (count === 0) {
    await db.insert('INSERT INTO admin_settings (section, data) VALUES (?, ?)',
      ['pricing', JSON.stringify({
        creditPerMinute: 2,
        packages: [
          { key: 'starter', name: 'Starter', price: 999, credits: 500 },
          { key: 'growth', name: 'Growth', price: 2999, credits: 2000 },
          { key: 'business', name: 'Business', price: 7999, credits: 6000 },
          { key: 'enterprise', name: 'Enterprise', price: 19999, credits: 20000 },
        ],
      })]);
    await db.insert('INSERT INTO admin_settings (section, data) VALUES (?, ?)',
      ['providers', JSON.stringify({
        telephony: 'vobiz',
        voice: 'cartesia',
        ai: 'llm',
        payment: 'razorpay',
      })]);
    console.log('✓ admin_settings seeded');
  }

  // 2. Organization check
  const orgCount = await db.query('SELECT COUNT(*) AS c FROM organizations');
  if (Number(orgCount[0]?.c || 0) === 0) {
    const orgRes = await db.insert(
      'INSERT INTO organizations (name, business_type, calling_purpose, preferred_language, credit_balance) VALUES (?, ?, ?, ?, ?)',
      ['Telugu AI Calling Demo', 'Technology', 'Sales & Lead Generation', 'Telugu', 1000]
    );
    const orgId = orgRes.insertId;

    const passwordHash = await bcrypt.hash('demo1234', 10);
    const adminPasswordHash = await bcrypt.hash('admin1234', 10);

    const userRes = await db.insert(
      'INSERT INTO users (organization_id, role, name, email, password_hash, email_verified_at, first_login, status) VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)',
      [orgId, 'owner', 'Demo User', 'demo@aicalling.local', passwordHash, 0, 'active']
    );
    const userId = userRes.insertId;

    await db.insert(
      'INSERT INTO users (organization_id, role, name, email, password_hash, email_verified_at, first_login, status) VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)',
      [orgId, 'admin', 'Platform Superadmin', 'admin@aicalling.local', adminPasswordHash, 0, 'active']
    );

    await db.insert('INSERT INTO organization_members (organization_id, user_id, role) VALUES (?, ?, ?)', [orgId, userId, 'owner']);
    await db.insert('INSERT INTO credit_wallets (organization_id, balance, lifetime_used, lifetime_purchased) VALUES (?, ?, ?, ?)', [orgId, 1000, 0, 1000]);
    await db.insert('INSERT INTO credit_transactions (organization_id, type, amount, balance_after, description, reference) VALUES (?, ?, ?, ?, ?, ?)',
      [orgId, 'credit', 1000, 1000, 'Welcome credits', 'seed-welcome']);

    // Seed phone numbers (VoBiz PSTN)
    await db.insert(
      'INSERT INTO phone_numbers (organization_id, number, provider, country, region, type, status, monthly_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [orgId, '+918065354620', 'vobiz', 'IN', 'Karnataka', 'local', 'active', 0]
    );

    // Seed employees
    await db.insert(
      `INSERT INTO ai_employees (organization_id, name, role, description, department, persona, language, language_code,
       personality, tone, speaking_style, formality, greeting, objective, never_say, instructions,
       voice_provider, voice, voice_speed, voice_pitch, voice_stability, voice_naturalness, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [orgId, 'Priya', 'Sales Assistant', 'Professional Telugu-speaking sales assistant.', 'Sales', 'female', 'Telugu', 'te-IN',
       'Friendly, professional and patient.', 'Natural Telugu conversation.', 'Warm and clear', 'professional',
       'హలో! నేను ప్రియ. మీరు ఎలా ఉన్నారు?', 'Qualify leads and schedule follow-up calls.', 'Do not promise discounts.',
       'Speak naturally like a real Telugu employee.', 'cartesia', '82c2afc8-ebbc-4802-8ccf-036dc0fa1e3b', 1.0, 1.0, 0.7, 0.9, 'active']
    );

    await db.insert(
      `INSERT INTO ai_employees (organization_id, name, role, description, department, persona, language, language_code,
       personality, tone, speaking_style, formality, greeting, objective, never_say, instructions,
       voice_provider, voice, voice_speed, voice_pitch, voice_stability, voice_naturalness, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [orgId, 'Arjun', 'Customer Support', 'Telugu support representative resolving customer queries.', 'Support', 'male', 'Telugu', 'te-IN',
       'Patient, empathetic and helpful.', 'Calm and reassuring Telugu.', 'Slow and reassuring', 'friendly',
       'నమస్కారం! నేను అర్జున్. మీ సమస్య ఏమిటి?', 'Resolve common support issues.', 'Never blame the customer.',
       'Listen to customer first.', 'cartesia', 'cf061d8b-a752-4865-81a2-57570a6e0565', 0.95, 1.0, 0.75, 0.95, 'active']
    );

    console.log('✓ Demo org, users, phone number, and employees seeded!');
  } else {
    console.log('✓ Database already has organizations');
  }

  console.log('🎉 InsForge seeding complete!');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed FAILED:', err);
  process.exit(1);
});

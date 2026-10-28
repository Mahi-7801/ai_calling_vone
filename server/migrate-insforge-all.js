require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.INSFORGE_DB_URL,
  ssl: { rejectUnauthorized: false }
});

const DDL = [
  `CREATE TABLE IF NOT EXISTS organization_members (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL,
    user_id INT NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'member',
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id, user_id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_orgmember_org ON organization_members (organization_id);`,
  `CREATE INDEX IF NOT EXISTS idx_orgmember_user ON organization_members (user_id);`,

  `CREATE TABLE IF NOT EXISTS employee_versions (
    id SERIAL PRIMARY KEY,
    employee_id INT NOT NULL,
    version INT NOT NULL DEFAULT 1,
    data JSONB NULL,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS idx_ev_emp ON employee_versions (employee_id);`,

  `CREATE TABLE IF NOT EXISTS employee_knowledge (
    id SERIAL PRIMARY KEY,
    employee_id INT NOT NULL,
    type VARCHAR(32) NOT NULL DEFAULT 'text',
    title VARCHAR(190) NULL,
    content TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS idx_ek_emp ON employee_knowledge (employee_id);`,

  `CREATE TABLE IF NOT EXISTS employee_documents (
    id SERIAL PRIMARY KEY,
    employee_id INT NOT NULL,
    name VARCHAR(190) NOT NULL,
    file_type VARCHAR(16) NULL,
    file_url VARCHAR(500) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'processing',
    extracted_text TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS idx_ed_emp ON employee_documents (employee_id);`,

  `CREATE TABLE IF NOT EXISTS employee_faqs (
    id SERIAL PRIMARY KEY,
    employee_id INT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS idx_ef_emp ON employee_faqs (employee_id);`,

  `CREATE TABLE IF NOT EXISTS employee_scripts (
    id SERIAL PRIMARY KEY,
    employee_id INT NOT NULL,
    name VARCHAR(190) NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS idx_es_emp ON employee_scripts (employee_id);`,

  `CREATE TABLE IF NOT EXISTS employee_examples (
    id SERIAL PRIMARY KEY,
    employee_id INT NOT NULL,
    customer_text TEXT NULL,
    ideal_response TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS idx_ee_emp ON employee_examples (employee_id);`,

  `CREATE TABLE IF NOT EXISTS deleted_employees (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL,
    employee_id VARCHAR(64) NOT NULL,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id, employee_id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_de_org ON deleted_employees (organization_id);`,

  `CREATE TABLE IF NOT EXISTS lead_contacts (
    id SERIAL PRIMARY KEY,
    lead_id INT NOT NULL,
    type VARCHAR(24) NOT NULL DEFAULT 'phone',
    value VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS idx_lc_lead ON lead_contacts (lead_id);`,

  `CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL,
    plan_id VARCHAR(64) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'active',
    current_period_start TIMESTAMPTZ NULL,
    current_period_end TIMESTAMPTZ NULL,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS idx_sub_org ON subscriptions (organization_id);`,

  `CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id SERIAL PRIMARY KEY,
    webhook_id INT NOT NULL,
    event VARCHAR(64) NOT NULL,
    payload JSONB NULL,
    status VARCHAR(24) NOT NULL,
    response_code INT NULL,
    response_body TEXT NULL,
    attempt INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS idx_wd_webhook ON webhook_deliveries (webhook_id);`,

  `CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL,
    name VARCHAR(120) NOT NULL,
    key_prefix VARCHAR(16) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    permissions JSONB NULL,
    last_used_at TIMESTAMPTZ NULL,
    expires_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX_org_key (organization_id)
  );`
];

async function run() {
  console.log('Migrating all missing tables into InsForge...');
  for (const sql of DDL) {
    try {
      await pool.query(sql);
      console.log('✓ Ran SQL');
    } catch (err) {
      console.warn('SQL Notice:', err.message);
    }
  }

  // Also verify refresh_tokens, password_reset_tokens, verification_tokens
  const authTokensDDL = [
    `CREATE TABLE IF NOT EXISTS refresh_tokens (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      token VARCHAR(500) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      token VARCHAR(255) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS verification_tokens (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      token VARCHAR(255) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`
  ];
  for (const sql of authTokensDDL) {
    try {
      await pool.query(sql);
      console.log('✓ Token table created');
    } catch (err) {
      console.warn('Token SQL Notice:', err.message);
    }
  }

  const { rows } = await pool.query("SELECT count(*) as total FROM information_schema.tables WHERE table_schema = 'public'");
  console.log('Total tables now in InsForge Postgres:', rows[0].total);
  await pool.end();
}

run().catch(console.error);

const db = require('../config/db');

const TABLES = {
  users: `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      organization_id INT NULL,
      role VARCHAR(32) NOT NULL DEFAULT 'owner',
      name VARCHAR(120) NOT NULL,
      email VARCHAR(190) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      phone VARCHAR(32) NULL,
      avatar_url VARCHAR(500) NULL,
      email_verified_at DATETIME NULL,
      first_login TINYINT(1) NOT NULL DEFAULT 1,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      last_login_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_users_org (organization_id),
      INDEX idx_users_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  organizations: `
    CREATE TABLE IF NOT EXISTS organizations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      owner_user_id INT NULL,
      name VARCHAR(190) NOT NULL,
      business_type VARCHAR(120) NULL,
      calling_purpose VARCHAR(190) NULL,
      preferred_language VARCHAR(64) DEFAULT 'Telugu',
      credit_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      settings JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  organization_members: `
    CREATE TABLE IF NOT EXISTS organization_members (
      id INT AUTO_INCREMENT PRIMARY KEY,
      organization_id INT NOT NULL,
      user_id INT NOT NULL,
      role VARCHAR(32) NOT NULL DEFAULT 'member',
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_member_org_user (organization_id, user_id),
      INDEX idx_orgmember_org (organization_id),
      INDEX idx_orgmember_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  ai_employees: `
    CREATE TABLE IF NOT EXISTS ai_employees (
      id INT AUTO_INCREMENT PRIMARY KEY,
      organization_id INT NOT NULL,
      name VARCHAR(120) NOT NULL,
      role VARCHAR(120) NULL,
      avatar_url VARCHAR(500) NULL,
      description TEXT NULL,
      department VARCHAR(120) NULL,
      persona TEXT NULL,
      language VARCHAR(64) NOT NULL DEFAULT 'Telugu',
      language_code VARCHAR(16) NOT NULL DEFAULT 'te-IN',
      personality TEXT NULL,
      tone TEXT NULL,
      speaking_style TEXT NULL,
      formality VARCHAR(32) DEFAULT 'professional',
      greeting TEXT NULL,
      objective TEXT NULL,
      never_say TEXT NULL,
      instructions TEXT NULL,
      max_call_duration INT NOT NULL DEFAULT 600,
      retry_attempts INT NOT NULL DEFAULT 2,
      call_timeout INT NOT NULL DEFAULT 30,
      goodbye_message TEXT NULL,
      working_hours JSON NULL,
      record_calls TINYINT(1) NOT NULL DEFAULT 1,
      transcript_enabled TINYINT(1) NOT NULL DEFAULT 1,
      human_transfer TINYINT(1) NOT NULL DEFAULT 0,
      outcome_detection TINYINT(1) NOT NULL DEFAULT 1,
      custom_message TEXT NULL,
      voice_provider VARCHAR(32) NOT NULL DEFAULT 'sarvam',
      voice VARCHAR(120) NULL DEFAULT 'te-IN',
      voice_speed DECIMAL(4,2) NOT NULL DEFAULT 1.0,
      voice_pitch DECIMAL(4,2) NOT NULL DEFAULT 1.0,
      voice_stability DECIMAL(4,2) NOT NULL DEFAULT 0.7,
      voice_naturalness DECIMAL(4,2) NOT NULL DEFAULT 0.9,
      system_prompt TEXT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      livekit_agent_name VARCHAR(120) NULL,
      livekit_metadata JSON NULL,
      cartesia_agent_id VARCHAR(120) NULL,
      total_calls INT NOT NULL DEFAULT 0,
      successful_calls INT NOT NULL DEFAULT 0,
      avg_duration INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_emp_org (organization_id),
      INDEX idx_emp_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  employee_versions: `
    CREATE TABLE IF NOT EXISTS employee_versions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      version INT NOT NULL DEFAULT 1,
      data JSON NULL,
      is_published TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ev_emp (employee_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  employee_knowledge: `
    CREATE TABLE IF NOT EXISTS employee_knowledge (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      type VARCHAR(32) NOT NULL DEFAULT 'text',
      title VARCHAR(190) NULL,
      content TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ek_emp (employee_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  employee_documents: `
    CREATE TABLE IF NOT EXISTS employee_documents (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      name VARCHAR(190) NOT NULL,
      file_type VARCHAR(16) NULL,
      file_url VARCHAR(500) NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'processing',
      extracted_text LONGTEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ed_emp (employee_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  employee_faqs: `
    CREATE TABLE IF NOT EXISTS employee_faqs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ef_emp (employee_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  employee_scripts: `
    CREATE TABLE IF NOT EXISTS employee_scripts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      name VARCHAR(190) NULL,
      content TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_es_emp (employee_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  employee_examples: `
    CREATE TABLE IF NOT EXISTS employee_examples (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      customer_text TEXT NULL,
      ideal_response TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ee_emp (employee_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  deleted_employees: `
    CREATE TABLE IF NOT EXISTS deleted_employees (
      id INT AUTO_INCREMENT PRIMARY KEY,
      organization_id INT NOT NULL,
      employee_id VARCHAR(64) NOT NULL,
      deleted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_org_emp (organization_id, employee_id),
      INDEX idx_de_org (organization_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  phone_numbers: `
    CREATE TABLE IF NOT EXISTS phone_numbers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      organization_id INT NOT NULL,
      number VARCHAR(24) NOT NULL,
      provider VARCHAR(32) NOT NULL DEFAULT 'vobiz',
      country VARCHAR(8) DEFAULT 'IN',
      region VARCHAR(64) NULL,
      type VARCHAR(24) NOT NULL DEFAULT 'local',
      is_trial TINYINT(1) NOT NULL DEFAULT 0,
      employee_id INT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      monthly_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_number (number),
      INDEX idx_pn_org (organization_id),
      INDEX idx_pn_emp (employee_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  leads: `
    CREATE TABLE IF NOT EXISTS leads (
      id INT AUTO_INCREMENT PRIMARY KEY,
      organization_id INT NOT NULL,
      name VARCHAR(120) NULL,
      phone VARCHAR(32) NOT NULL,
      company VARCHAR(190) NULL,
      purpose VARCHAR(190) NULL,
      location VARCHAR(120) NULL,
      email VARCHAR(190) NULL,
      custom_message TEXT NULL,
      campaign_id INT NULL,
      employee_id INT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'new',
      outcome VARCHAR(24) NULL,
      interest VARCHAR(24) NULL,
      next_followup DATETIME NULL,
      last_call_id INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_lead_org (organization_id),
      INDEX idx_lead_phone (phone),
      INDEX idx_lead_campaign (campaign_id),
      INDEX idx_lead_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  lead_contacts: `
    CREATE TABLE IF NOT EXISTS lead_contacts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      lead_id INT NOT NULL,
      type VARCHAR(24) NOT NULL DEFAULT 'phone',
      value VARCHAR(255) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_lc_lead (lead_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  campaigns: `
    CREATE TABLE IF NOT EXISTS campaigns (
      id INT AUTO_INCREMENT PRIMARY KEY,
      organization_id INT NOT NULL,
      name VARCHAR(190) NOT NULL,
      employee_id INT NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'pending',
      schedule JSON NULL,
      call_rules JSON NULL,
      total_leads INT NOT NULL DEFAULT 0,
      pending_leads INT NOT NULL DEFAULT 0,
      processed_leads INT NOT NULL DEFAULT 0,
      completed_leads INT NOT NULL DEFAULT 0,
      failed_leads INT NOT NULL DEFAULT 0,
      concurrency INT NOT NULL DEFAULT 3,
      started_at DATETIME NULL,
      paused_at DATETIME NULL,
      completed_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_camp_org (organization_id),
      INDEX idx_camp_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  campaign_leads: `
    CREATE TABLE IF NOT EXISTS campaign_leads (
      id INT AUTO_INCREMENT PRIMARY KEY,
      campaign_id INT NOT NULL,
      lead_id INT NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'pending',
      attempt_count INT NOT NULL DEFAULT 0,
      last_error VARCHAR(500) NULL,
      called_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_cl (campaign_id, lead_id),
      INDEX idx_cl_campaign (campaign_id),
      INDEX idx_cl_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  calls: `
    CREATE TABLE IF NOT EXISTS calls (
      id INT AUTO_INCREMENT PRIMARY KEY,
      call_id VARCHAR(64) NOT NULL UNIQUE,
      organization_id INT NOT NULL,
      campaign_id INT NULL,
      employee_id INT NULL,
      lead_id INT NULL,
      phone_number VARCHAR(32) NOT NULL,
      direction VARCHAR(12) NOT NULL DEFAULT 'outbound',
      status VARCHAR(24) NOT NULL DEFAULT 'preparing',
      duration INT NOT NULL DEFAULT 0,
      started_at DATETIME NULL,
      answered_at DATETIME NULL,
      ended_at DATETIME NULL,
      outcome VARCHAR(32) NULL,
      outcome_confidence DECIMAL(5,2) NULL,
      outcome_reason VARCHAR(500) NULL,
      blood_group VARCHAR(8) NULL,
      next_action VARCHAR(500) NULL,
      sentiment VARCHAR(24) NULL,
      intent VARCHAR(120) NULL,
      summary TEXT NULL,
      recording_url VARCHAR(500) NULL,
      credits_used DECIMAL(8,2) NOT NULL DEFAULT 0,
      request_id VARCHAR(64) NULL,
      error TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_calls_org (organization_id),
      INDEX idx_calls_campaign (campaign_id),
      INDEX idx_calls_emp (employee_id),
      INDEX idx_calls_lead (lead_id),
      INDEX idx_calls_status (status),
      INDEX idx_calls_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  call_events: `
    CREATE TABLE IF NOT EXISTS call_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      call_id INT NOT NULL,
      event_type VARCHAR(40) NOT NULL,
      payload JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ce_call (call_id),
      INDEX idx_ce_type (event_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  call_transcripts: `
    CREATE TABLE IF NOT EXISTS call_transcripts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      call_id INT NOT NULL,
      speaker VARCHAR(16) NOT NULL,
      text TEXT NOT NULL,
      ts DECIMAL(10,3) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ct_call (call_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  call_recordings: `
    CREATE TABLE IF NOT EXISTS call_recordings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      call_id INT NOT NULL,
      url VARCHAR(500) NOT NULL,
      duration INT NOT NULL DEFAULT 0,
      size_bytes INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_cr_call (call_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  call_outcomes: `
    CREATE TABLE IF NOT EXISTS call_outcomes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      call_id INT NOT NULL,
      outcome VARCHAR(32) NOT NULL,
      confidence DECIMAL(5,2) NULL,
      reason VARCHAR(500) NULL,
      next_action VARCHAR(500) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_co_call (call_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  credit_wallets: `
    CREATE TABLE IF NOT EXISTS credit_wallets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      organization_id INT NOT NULL UNIQUE,
      balance DECIMAL(12,2) NOT NULL DEFAULT 0,
      lifetime_used DECIMAL(12,2) NOT NULL DEFAULT 0,
      lifetime_purchased DECIMAL(12,2) NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  credit_transactions: `
    CREATE TABLE IF NOT EXISTS credit_transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      organization_id INT NOT NULL,
      type VARCHAR(16) NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      balance_after DECIMAL(12,2) NOT NULL DEFAULT 0,
      description VARCHAR(500) NULL,
      reference VARCHAR(190) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ct_org (organization_id),
      INDEX idx_ct_type (type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  subscriptions: `
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      organization_id INT NOT NULL,
      plan VARCHAR(32) NOT NULL DEFAULT 'starter',
      status VARCHAR(24) NOT NULL DEFAULT 'active',
      started_at DATETIME NULL,
      renews_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sub_org (organization_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  payments: `
    CREATE TABLE IF NOT EXISTS payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      organization_id INT NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      currency VARCHAR(8) NOT NULL DEFAULT 'INR',
      status VARCHAR(24) NOT NULL DEFAULT 'pending',
      provider VARCHAR(32) NOT NULL DEFAULT 'mock',
      reference VARCHAR(190) NULL,
      metadata JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_pay_org (organization_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  webhooks: `
    CREATE TABLE IF NOT EXISTS webhooks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      organization_id INT NOT NULL,
      url VARCHAR(500) NOT NULL,
      secret VARCHAR(255) NULL,
      events JSON NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_wb_org (organization_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  webhook_deliveries: `
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      webhook_id INT NOT NULL,
      event VARCHAR(64) NOT NULL,
      payload JSON NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'pending',
      attempts INT NOT NULL DEFAULT 0,
      response TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_wd_webhook (webhook_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  api_keys: `
    CREATE TABLE IF NOT EXISTS api_keys (
      id INT AUTO_INCREMENT PRIMARY KEY,
      organization_id INT NOT NULL,
      name VARCHAR(120) NOT NULL,
      key_prefix VARCHAR(16) NOT NULL,
      key_hash VARCHAR(255) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      expires_at DATETIME NULL,
      last_used_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ak_org (organization_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  audit_logs: `
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      organization_id INT NULL,
      user_id INT NULL,
      action VARCHAR(120) NOT NULL,
      entity VARCHAR(64) NULL,
      entity_id VARCHAR(64) NULL,
      details JSON NULL,
      ip VARCHAR(64) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_al_org (organization_id),
      INDEX idx_al_user (user_id),
      INDEX idx_al_action (action)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  notifications: `
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      organization_id INT NOT NULL,
      user_id INT NULL,
      type VARCHAR(32) NOT NULL DEFAULT 'info',
      title VARCHAR(190) NOT NULL,
      message TEXT NULL,
      read_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_notif_org (organization_id),
      INDEX idx_notif_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  settings: `
    CREATE TABLE IF NOT EXISTS settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      organization_id INT NOT NULL,
      section VARCHAR(64) NOT NULL,
      data JSON NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_setting (organization_id, section),
      INDEX idx_set_org (organization_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  refresh_tokens: `
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token_hash VARCHAR(255) NOT NULL,
      expires_at DATETIME NOT NULL,
      revoked_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_rt_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  password_reset_tokens: `
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token_hash VARCHAR(255) NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_prt_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  verification_tokens: `
    CREATE TABLE IF NOT EXISTS verification_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token_hash VARCHAR(255) NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_vt_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  admin_settings: `
    CREATE TABLE IF NOT EXISTS admin_settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      section VARCHAR(64) NOT NULL UNIQUE,
      data JSON NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  voice_clones: `
    CREATE TABLE IF NOT EXISTS voice_clones (
      id INT AUTO_INCREMENT PRIMARY KEY,
      organization_id INT NOT NULL,
      user_id INT NULL,
      name VARCHAR(120) NOT NULL,
      voice_id VARCHAR(120) NOT NULL,
      provider VARCHAR(32) NOT NULL DEFAULT 'cartesia',
      language VARCHAR(32) NOT NULL DEFAULT 'te',
      gender VARCHAR(16) NULL,
      sample_url VARCHAR(500) NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'ready',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_vc_org (organization_id),
      INDEX idx_vc_voice (voice_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  phone_number_purchases: `
    CREATE TABLE IF NOT EXISTS phone_number_purchases (
      id INT AUTO_INCREMENT PRIMARY KEY,
      organization_id INT NOT NULL,
      user_id INT NULL,
      number VARCHAR(32) NOT NULL,
      provider VARCHAR(32) NOT NULL DEFAULT 'vobiz',
      country VARCHAR(8) NOT NULL DEFAULT 'IN',
      region VARCHAR(64) NULL,
      monthly_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
      setup_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
      amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0,
      currency VARCHAR(8) NOT NULL DEFAULT 'INR',
      payment_id VARCHAR(120) NULL,
      carrier_result JSON NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'completed',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_pnp_org (organization_id),
      INDEX idx_pnp_number (number),
      INDEX idx_pnp_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
};

async function migrate() {
  const db = require('../config/db');
  await db.testConnection();
  console.log('[InsForge DB] Connected to InsForge PostgreSQL BaaS successfully.');
}

// The leads UI used to write Title-Case values ("Interested", "Not Interested")
// while the backend writes and queries lowercase snake_case. A row saved through
// the old UI therefore matched no WHERE clause and silently dropped out of the
// status/outcome filters and the Dashboard/Performance lead metrics. Fold those
// rows onto the canonical vocabulary, and collapse the space-suffixed duplicate
// that appeared when a value was submitted twice.
const LEAD_STATUS_CANON = {
  'new': 'new',
  'contacted': 'contacted',
  'interested': 'interested',
  'not interested': 'not_interested',
  'follow up': 'follow_up',
  'follow_up': 'follow_up',
  'callback requested': 'callback_requested',
  'callback_requested': 'callback_requested',
  'callback': 'callback_requested',
  'converted': 'converted',
  'dnd': 'dnd',
  'invalid': 'invalid',
};

const LEAD_OUTCOME_CANON = {
  'interested': 'interested',
  'not interested': 'not_interested',
  'not_interested': 'not_interested',
  'follow up': 'follow_up',
  'follow_up': 'follow_up',
  'callback': 'callback',
  'callback requested': 'callback_requested',
  'converted': 'converted',
  'dnd': 'dnd',
  'wrong number': 'wrong_number',
  'wrong_number': 'wrong_number',
  'no answer': 'no_answer',
  'no_answer': 'no_answer',
  'busy': 'busy',
  'failed': 'failed',
};

function canonicalize(value, table) {
  if (value === null || value === undefined) return null;
  const table_map = table === 'status' ? LEAD_STATUS_CANON : LEAD_OUTCOME_CANON;
  const key = String(value).trim().toLowerCase();
  if (!key) return null;
  if (table_map[key]) return table_map[key];
  // An unrecognised value is left untouched rather than guessed at: the column
  // is free text and silently rewriting it could destroy real information.
  return null;
}

async function normalizeLeadVocabulary(conn) {
  for (const [table, column] of [['leads', 'status'], ['leads', 'outcome'], ['calls', 'outcome']]) {
    const [rows] = await conn.query(`SELECT id, ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL`);
    let changed = 0;
    for (const row of rows) {
      const canonical = canonicalize(row.value, column);
      if (canonical && canonical !== row.value) {
        await conn.query(`UPDATE ${table} SET ${column} = ? WHERE id = ?`, [canonical, row.id]);
        changed++;
      }
    }
    if (changed) console.log(`  ok  ${table}.${column} normalized (${changed} row(s) rewritten)`);
  }
}

// The same physical number was being stored in several shapes ("+918065354620",
// "918065354620", "+91 80653 54620"). Each shape slipped past the app's
// org-scoped existence check and then collided with the global uq_number key on
// INSERT. Normalize to E.164 and collapse any pre-existing duplicates (keeping
// the lowest id and carrying over its employee assignment) so the key can hold.
async function normalizePhoneNumbers(conn) {
  const [rows] = await conn.query('SELECT id, number, employee_id FROM phone_numbers');
  const canonical = new Map();

  for (const row of rows) {
    const { sanitizePhone } = require('../utils/helpers');
    const clean = sanitizePhone(row.number);
    if (!clean) continue;
    if (clean === row.number) {
      if (!canonical.has(clean)) canonical.set(clean, row);
      continue;
    }
    // Rewrite in place only when the target value is free, otherwise leave the
    // row alone and let the dedupe pass below resolve the collision.
    const [clash] = await conn.query('SELECT id FROM phone_numbers WHERE number = ? AND id <> ?', [clean, row.id]);
    if (clash.length === 0) {
      await conn.query('UPDATE phone_numbers SET number = ? WHERE id = ?', [clean, row.id]);
      const fixed = { ...row, number: clean };
      if (!canonical.has(clean)) canonical.set(clean, fixed);
    }
  }

  const byNumber = new Map();
  for (const row of rows) {
    const { sanitizePhone } = require('../utils/helpers');
    const key = sanitizePhone(row.number) || row.number;
    if (!byNumber.has(key)) byNumber.set(key, []);
    byNumber.get(key).push(row);
  }

  let removed = 0;
  for (const [, group] of byNumber) {
    if (group.length < 2) continue;
    const [keep, ...dupes] = group;
    for (const dupe of dupes) {
      // Don't orphan an employee assignment: promote it onto the surviving row.
      if (dupe.employee_id && !keep.employee_id) {
        await conn.query('UPDATE phone_numbers SET employee_id = ? WHERE id = ?', [dupe.employee_id, keep.id]);
      }
      await conn.query('DELETE FROM phone_numbers WHERE id = ?', [dupe.id]);
      removed++;
    }
    console.log(`  ok  phone_numbers dedupe ${keep.number} (removed ${group.length - 1})`);
  }

  console.log(`  ok  phone_numbers normalized (${rows.length} scanned, ${removed} duplicate row(s) removed)`);
}

async function migrateSafe() {
  try {
    await migrate();
  } catch (err) {
    console.error('Migration failed:', err.message);
  }
}

module.exports = { TABLES, migrate, migrateSafe };

if (require.main === module) {
  migrate();
}
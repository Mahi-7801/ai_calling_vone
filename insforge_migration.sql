-- ==============================================================================
-- Vone AI Calling Platform — InsForge (Postgres) Schema
-- Mirrors the existing MySQL schema for use with InsForge backend
-- ==============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Organizations
CREATE TABLE IF NOT EXISTS organizations (
  id SERIAL PRIMARY KEY,
  owner_user_id INT NULL,
  name VARCHAR(190) NOT NULL,
  business_type VARCHAR(120) NULL,
  calling_purpose VARCHAR(190) NULL,
  preferred_language VARCHAR(64) DEFAULT 'Telugu',
  credit_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  settings JSONB NULL,
  cartesia_api_key TEXT NULL,
  groq_api_key TEXT NULL,
  vobiz_auth_id TEXT NULL,
  vobiz_auth_token TEXT NULL,
  vobiz_account_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  organization_id INT NULL REFERENCES organizations(id),
  role VARCHAR(32) NOT NULL DEFAULT 'owner',
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(32) NULL,
  avatar_url VARCHAR(500) NULL,
  email_verified_at TIMESTAMPTZ NULL,
  first_login BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  last_login_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_employees (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(id),
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
  working_hours JSONB NULL,
  record_calls BOOLEAN NOT NULL DEFAULT TRUE,
  transcript_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  human_transfer BOOLEAN NOT NULL DEFAULT FALSE,
  outcome_detection BOOLEAN NOT NULL DEFAULT TRUE,
  custom_message TEXT NULL,
  voice_provider VARCHAR(32) NOT NULL DEFAULT 'cartesia',
  voice VARCHAR(120) NULL DEFAULT 'te-IN',
  voice_speed DECIMAL(4,2) NOT NULL DEFAULT 1.0,
  voice_pitch DECIMAL(4,2) NOT NULL DEFAULT 1.0,
  voice_stability DECIMAL(4,2) NOT NULL DEFAULT 0.7,
  voice_naturalness DECIMAL(4,2) NOT NULL DEFAULT 0.9,
  system_prompt TEXT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  cartesia_agent_id VARCHAR(120) NULL,
  livekit_agent_name VARCHAR(120) NULL,
  livekit_metadata JSONB NULL,
  total_calls INT NOT NULL DEFAULT 0,
  successful_calls INT NOT NULL DEFAULT 0,
  avg_duration INT NOT NULL DEFAULT 0,
  prompt_business_info JSONB NULL,
  prompt_version INT NOT NULL DEFAULT 1,
  prompt_campaign_name VARCHAR(190) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS phone_numbers (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(id),
  number VARCHAR(24) NOT NULL UNIQUE,
  provider VARCHAR(32) NOT NULL DEFAULT 'vobiz',
  country VARCHAR(8) DEFAULT 'IN',
  region VARCHAR(64) NULL,
  type VARCHAR(24) NOT NULL DEFAULT 'local',
  is_trial BOOLEAN NOT NULL DEFAULT FALSE,
  employee_id INT NULL REFERENCES ai_employees(id),
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  monthly_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  vobiz_number_id VARCHAR(64) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS phone_number_purchases (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(id),
  user_id INT NULL REFERENCES users(id),
  number VARCHAR(32) NOT NULL,
  provider VARCHAR(32) NOT NULL DEFAULT 'vobiz',
  country VARCHAR(8) NOT NULL DEFAULT 'IN',
  region VARCHAR(64) NULL,
  monthly_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  setup_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency VARCHAR(8) NOT NULL DEFAULT 'INR',
  payment_id VARCHAR(120) NULL,
  carrier_result JSONB NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(id),
  name VARCHAR(120) NULL,
  phone VARCHAR(32) NOT NULL,
  company VARCHAR(190) NULL,
  purpose VARCHAR(190) NULL,
  location VARCHAR(120) NULL,
  email VARCHAR(190) NULL,
  custom_message TEXT NULL,
  campaign_id INT NULL,
  employee_id INT NULL REFERENCES ai_employees(id),
  status VARCHAR(24) NOT NULL DEFAULT 'new',
  outcome VARCHAR(24) NULL,
  interest VARCHAR(24) NULL,
  next_followup TIMESTAMPTZ NULL,
  last_call_id INT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(id),
  name VARCHAR(190) NOT NULL,
  employee_id INT NOT NULL REFERENCES ai_employees(id),
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  schedule JSONB NULL,
  call_rules JSONB NULL,
  total_leads INT NOT NULL DEFAULT 0,
  pending_leads INT NOT NULL DEFAULT 0,
  processed_leads INT NOT NULL DEFAULT 0,
  completed_leads INT NOT NULL DEFAULT 0,
  failed_leads INT NOT NULL DEFAULT 0,
  concurrency INT NOT NULL DEFAULT 3,
  started_at TIMESTAMPTZ NULL,
  paused_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_leads (
  id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(id),
  lead_id INT NOT NULL REFERENCES leads(id),
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  attempt_count INT NOT NULL DEFAULT 0,
  last_error VARCHAR(500) NULL,
  called_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(campaign_id, lead_id)
);

CREATE TABLE IF NOT EXISTS calls (
  id SERIAL PRIMARY KEY,
  call_id VARCHAR(64) NOT NULL UNIQUE,
  organization_id INT NOT NULL REFERENCES organizations(id),
  campaign_id INT NULL REFERENCES campaigns(id),
  employee_id INT NULL REFERENCES ai_employees(id),
  lead_id INT NULL REFERENCES leads(id),
  phone_number VARCHAR(32) NOT NULL,
  direction VARCHAR(12) NOT NULL DEFAULT 'outbound',
  status VARCHAR(24) NOT NULL DEFAULT 'preparing',
  duration INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NULL,
  answered_at TIMESTAMPTZ NULL,
  ended_at TIMESTAMPTZ NULL,
  outcome VARCHAR(32) NULL,
  outcome_confidence DECIMAL(5,2) NULL,
  outcome_reason VARCHAR(500) NULL,
  next_action VARCHAR(500) NULL,
  sentiment VARCHAR(24) NULL,
  intent VARCHAR(120) NULL,
  summary TEXT NULL,
  recording_url VARCHAR(500) NULL,
  credits_used DECIMAL(8,2) NOT NULL DEFAULT 0,
  request_id VARCHAR(64) NULL,
  carrier_hangup_reason VARCHAR(255) NULL,
  error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS call_transcripts (
  id SERIAL PRIMARY KEY,
  call_id INT NOT NULL REFERENCES calls(id),
  speaker VARCHAR(16) NOT NULL,
  text TEXT NOT NULL,
  ts DECIMAL(10,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS call_recordings (
  id SERIAL PRIMARY KEY,
  call_id INT NOT NULL REFERENCES calls(id),
  url VARCHAR(500) NOT NULL,
  storage_key VARCHAR(500) NULL,
  duration INT NOT NULL DEFAULT 0,
  size_bytes INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS call_events (
  id SERIAL PRIMARY KEY,
  call_id INT NOT NULL REFERENCES calls(id),
  event_type VARCHAR(40) NOT NULL,
  payload JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS call_outcomes (
  id SERIAL PRIMARY KEY,
  call_id INT NOT NULL REFERENCES calls(id),
  outcome VARCHAR(32) NOT NULL,
  confidence DECIMAL(5,2) NULL,
  reason VARCHAR(500) NULL,
  next_action VARCHAR(500) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_wallets (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL UNIQUE REFERENCES organizations(id),
  balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  lifetime_used DECIMAL(12,2) NOT NULL DEFAULT 0,
  lifetime_purchased DECIMAL(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(id),
  type VARCHAR(16) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  balance_after DECIMAL(12,2) NOT NULL DEFAULT 0,
  description VARCHAR(500) NULL,
  reference VARCHAR(190) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(id),
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'INR',
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  provider VARCHAR(32) NOT NULL DEFAULT 'razorpay',
  reference VARCHAR(190) NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI Prompt Generator — saved prompts
CREATE TABLE IF NOT EXISTS ai_prompts (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(id),
  user_id INT NULL REFERENCES users(id),
  campaign_name VARCHAR(190) NULL,
  business_info JSONB NOT NULL DEFAULT '{}',
  generated_prompt TEXT NULL,
  language VARCHAR(64) NOT NULL DEFAULT 'Telugu',
  version INT NOT NULL DEFAULT 1,
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS voice_clones (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(id),
  user_id INT NULL REFERENCES users(id),
  name VARCHAR(120) NOT NULL,
  voice_id VARCHAR(120) NOT NULL,
  provider VARCHAR(32) NOT NULL DEFAULT 'cartesia',
  language VARCHAR(32) NOT NULL DEFAULT 'te',
  gender VARCHAR(16) NULL,
  sample_url VARCHAR(500) NULL,
  storage_key VARCHAR(500) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ready',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(id),
  section VARCHAR(64) NOT NULL,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, section)
);

CREATE TABLE IF NOT EXISTS admin_settings (
  id SERIAL PRIMARY KEY,
  section VARCHAR(64) NOT NULL UNIQUE,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(id),
  user_id INT NULL REFERENCES users(id),
  type VARCHAR(32) NOT NULL DEFAULT 'info',
  title VARCHAR(190) NOT NULL,
  message TEXT NULL,
  read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  organization_id INT NULL REFERENCES organizations(id),
  user_id INT NULL REFERENCES users(id),
  action VARCHAR(120) NOT NULL,
  entity VARCHAR(64) NULL,
  entity_id VARCHAR(64) NULL,
  details JSONB NULL,
  ip VARCHAR(64) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhooks (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(id),
  url VARCHAR(500) NOT NULL,
  secret VARCHAR(255) NULL,
  events JSONB NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_emp_org ON ai_employees(organization_id);
CREATE INDEX IF NOT EXISTS idx_emp_status ON ai_employees(status);
CREATE INDEX IF NOT EXISTS idx_pn_org ON phone_numbers(organization_id);
CREATE INDEX IF NOT EXISTS idx_lead_org ON leads(organization_id);
CREATE INDEX IF NOT EXISTS idx_lead_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_lead_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_camp_org ON campaigns(organization_id);
CREATE INDEX IF NOT EXISTS idx_calls_org ON calls(organization_id);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
CREATE INDEX IF NOT EXISTS idx_calls_created ON calls(created_at);
CREATE INDEX IF NOT EXISTS idx_ct_org ON credit_transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_prompts_org ON ai_prompts(organization_id);
CREATE INDEX IF NOT EXISTS idx_notif_org ON notifications(organization_id);

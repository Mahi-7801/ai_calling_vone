const { AppError } = require('../utils/errors');
const { queryOne } = require('../config/db');

const ALLOWED_TENANT_TABLES = new Set([
  'ai_employees', 'employee_versions', 'employee_knowledge', 'employee_documents',
  'employee_faqs', 'employee_scripts', 'employee_examples', 'phone_numbers', 'leads',
  'campaigns', 'campaign_leads', 'calls', 'call_events', 'call_transcripts',
  'call_recordings', 'call_outcomes', 'credit_wallets', 'credit_transactions',
  'subscriptions', 'payments', 'webhooks', 'api_keys', 'notifications',
]);

const TENANT_ID_COLUMN = {
  ai_employees: 'ai_employees.organization_id',
  employee_versions: 'employee_versions.organization_id',
  employee_knowledge: 'employee_knowledge.organization_id',
  employee_documents: 'employee_documents.organization_id',
  employee_faqs: 'employee_faqs.organization_id',
  employee_scripts: 'employee_scripts.organization_id',
  employee_examples: 'employee_examples.organization_id',
  phone_numbers: 'phone_numbers.organization_id',
  leads: 'leads.organization_id',
  campaigns: 'campaigns.organization_id',
  campaign_leads: 'campaign_leads.organization_id',
  calls: 'calls.organization_id',
  call_events: 'call_events.organization_id',
  call_transcripts: 'call_transcripts.organization_id',
  call_recordings: 'call_recordings.organization_id',
  call_outcomes: 'call_outcomes.organization_id',
  credit_wallets: 'credit_wallets.organization_id',
  credit_transactions: 'credit_transactions.organization_id',
  subscriptions: 'subscriptions.organization_id',
  payments: 'payments.organization_id',
  webhooks: 'webhooks.organization_id',
  api_keys: 'api_keys.organization_id',
  notifications: 'notifications.organization_id',
};

// Generic tenant scoping guard: converts a raw param named object to a where clause
function tenantWhere(table, orgId, allowNullOrg = false) {
  const col = TENANT_ID_COLUMN[table] || `${table}.organization_id`;
  return `${col} = ?`;
}

async function ensureOrgOwned(table, id, orgId) {
  const row = await queryOne(`SELECT id FROM ${table} WHERE id = ? LIMIT 1`, [id]);
  if (!row) throw new AppError('Not found', 404, 'NOT_FOUND');
  const owned = await queryOne(`SELECT id FROM ${table} WHERE id = ? AND organization_id = ? LIMIT 1`, [id, orgId]);
  if (!owned) throw new AppError('Forbidden', 403, 'FORBIDDEN');
  return row;
}

module.exports = { ALLOWED_TENANT_TABLES, TENANT_ID_COLUMN, tenantWhere, ensureOrgOwned };
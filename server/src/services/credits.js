const { withTransaction } = require('../config/db');
const { AppError } = require('../utils/errors');
const { generateId } = require('../utils/helpers');
const { notify } = require('./activity');

const VOICE_RATES = {
  VALUE: 3.5,     // Everyday calling
  STANDARD: 5.0,  // More natural (e.g. Sarvam neural)
  PREMIUM: 6.8,   // Most lifelike (e.g. Cartesia / ElevenLabs)
  CLONED: 10.0,   // Custom Cloned Voice rate: ₹10/min
};

function getVoicePerMinuteRate(employee = {}) {
  const voiceId = String(employee.voice || '').trim().toUpperCase();
  const provider = String(employee.voice_provider || '').trim().toLowerCase();

  // Custom Cloned voices: ₹10.0/min
  if (voiceId.startsWith('CUSTOM_') || (employee.voice && employee.voice.length > 25 && voiceId !== 'CA5E2CAA-BA47-4096-91DD-DAFC99D9086F')) {
    return VOICE_RATES.CLONED;
  }
  // Value voices (Everyday calling, V-series e.g. V01, V02): ₹3.5/min
  if (voiceId.startsWith('V') || ['REHAN', 'RITU', 'AMIT', 'MOHIT'].includes(voiceId)) {
    return VOICE_RATES.VALUE;
  }
  // Premium voices (Cartesia, ElevenLabs, or P-series e.g. P01, P02): ₹6.8/min
  if (voiceId.startsWith('P') || ['KAVYA', 'ADITYA', 'PRIYA', 'VIJAY'].includes(voiceId) || provider === 'elevenlabs') {
    return VOICE_RATES.PREMIUM;
  }
  // Standard voices (Sarvam, S-series e.g. S01, S02, S03, S36): ₹5.0/min
  if (voiceId.startsWith('S') || ['ROHAN', 'SUHANI', 'KAVITHA', 'SHRUTI'].includes(voiceId) || provider === 'sarvam') {
    return VOICE_RATES.STANDARD;
  }
  // Fallback: Value rate ₹3.5/min
  return VOICE_RATES.VALUE;
}

function calculateCallCost({ duration = 0, status = 'completed', employee = {} }) {
  // Nobody picks up? You pay ₹0. Ringing, busy and unanswered calls cost nothing at all.
  if (status !== 'completed' || !duration || duration <= 0) {
    return 0;
  }

  // Billed in 30-second blocks. A call under 30 seconds costs half a minute (0.5m); a 40-second call costs one minute (1.0m).
  const blocks = Math.max(1, Math.ceil(duration / 30));
  const billableMinutes = blocks * 0.5;

  const rate = getVoicePerMinuteRate(employee);
  return Math.round(billableMinutes * rate * 100) / 100;
}

function getCreditSettings() {
  // server-side default; admin can override in admin_settings
  return { creditPerMinute: 2, voiceRates: VOICE_RATES, blockSeconds: 30 };
}

// credit_wallets.organization_id is UNIQUE. Two concurrent requests for a
// brand-new org would both miss the SELECT and then collide on INSERT
// ("Duplicate entry for key 'uq_wallet'"), which used to surface as a 500 on the
// call path. Upsert, then read back, so the row always exists exactly once.
async function getWallet(orgId) {
  const { query, insert } = require('../config/db');
  const rows = await query('SELECT * FROM credit_wallets WHERE organization_id = ?', [orgId]);
  if (rows.length) return rows[0];
  await insert(
    'INSERT INTO credit_wallets (organization_id, balance) VALUES (?, 0) ON DUPLICATE KEY UPDATE organization_id = organization_id',
    [orgId]
  );
  const created = await query('SELECT * FROM credit_wallets WHERE organization_id = ?', [orgId]);
  if (created.length) return created[0];
  return { organization_id: orgId, balance: 0, lifetime_used: 0, lifetime_purchased: 0 };
}

async function checkBalance(orgId) {
  const wallet = await getWallet(orgId);
  if (wallet.balance <= 0) throw new AppError('Insufficient credits. Please purchase more credits.', 402, 'INSUFFICIENT_CREDITS');
  return wallet;
}

async function debit(orgId, amount, description, reference) {
  const { insert, query } = require('../config/db');
  const wallet = await getWallet(orgId);
  if (wallet.balance + 0 < amount) {
    throw new AppError('Insufficient credits. Please purchase more credits.', 402, 'INSUFFICIENT_CREDITS');
  }
  const balanceAfter = wallet.balance - amount;
  await insert(
    'UPDATE credit_wallets SET balance = ?, lifetime_used = lifetime_used + ? WHERE organization_id = ?',
    [balanceAfter, amount, orgId]
  );
  await insert(
    'INSERT INTO credit_transactions (organization_id, type, amount, balance_after, description, reference) VALUES (?,?,?,?,?,?)',
    [orgId, 'debit', amount, balanceAfter, description, reference]
  );
  if (balanceAfter < 20) {
    try {
      const { sendLowCreditAlert } = require('./mail');
      const org = await query('SELECT name FROM organizations WHERE id = ?', [orgId]).then((r) => r[0]);
      sendLowCreditAlert({ orgName: org?.name || 'Your Organization', balance: balanceAfter }).catch(() => {});
    } catch {}
  }
  return balanceAfter;
}

async function credit(orgId, amount, description, reference) {
  const { insert } = require('../config/db');
  const wallet = await getWallet(orgId);
  const balanceAfter = wallet.balance + amount;
  await insert(
    'UPDATE credit_wallets SET balance = ?, lifetime_purchased = lifetime_purchased + ? WHERE organization_id = ?',
    [balanceAfter, amount, orgId]
  );
  await insert(
    'INSERT INTO credit_transactions (organization_id, type, amount, balance_after, description, reference) VALUES (?,?,?,?,?,?)',
    [orgId, 'credit', amount, balanceAfter, description, reference]
  );
  if (wallet.balance <= 0 && amount > 0) {
    notify(orgId, null, 'billing', 'Credits added', `Your wallet was credited with ${amount} credits.`);
  }
  return balanceAfter;
}

async function purchaseCredits(orgId, amount, reference) {
  return withTransaction(async (conn) => {
    await conn.execute(
      'UPDATE credit_wallets SET balance = balance + ?, lifetime_purchased = lifetime_purchased + ? WHERE organization_id = ?',
      [amount, amount, orgId]
    );
    const [[wallet]] = await conn.execute(
      'SELECT balance FROM credit_wallets WHERE organization_id = ?', [orgId]
    );
    await conn.execute(
      'INSERT INTO credit_transactions (organization_id, type, amount, balance_after, description, reference) VALUES (?,?,?,?,?,?)',
      [orgId, 'credit', amount, wallet.balance, 'Credit purchase', reference]
    );
    return wallet.balance;
  });
}

module.exports = {
  getCreditSettings,
  getWallet,
  checkBalance,
  debit,
  credit,
  purchaseCredits,
  generateId,
  VOICE_RATES,
  getVoicePerMinuteRate,
  calculateCallCost,
};
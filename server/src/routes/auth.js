const express = require('express');
const bcrypt = require('bcryptjs');
const { query, queryOne, insert, update, withTransaction, isDuplicateKeyError } = require('../config/db');
const { asyncHandler, randomToken, hashToken, generateId } = require('../utils/helpers');
const { AppError } = require('../utils/errors');
const { signAccessToken, requireAuth } = require('../middleware/auth');
const { sendMail } = require('../services/mail');
const { audit } = require('../services/activity');

const router = express.Router();

async function createOrgWithUser(conn, { name, orgName, email, password, business_type, calling_purpose, preferred_language }) {
  const [orgRes] = await conn.execute(
    'INSERT INTO organizations (name, business_type, calling_purpose, preferred_language, credit_balance) VALUES (?,?,?,?,?)',
    [orgName || name, business_type || null, calling_purpose || null, preferred_language || 'Telugu', 0]
  );
  const orgId = orgRes.insertId;
  const passwordHash = await bcrypt.hash(password, 10);
  const [userRes] = await conn.execute(
    'INSERT INTO users (organization_id, role, name, email, password_hash, first_login) VALUES (?,?,?,?,?,1)',
    [orgId, 'owner', name, email, passwordHash]
  );
  const userId = userRes.insertId;
  await conn.execute('INSERT INTO organization_members (organization_id, user_id, role) VALUES (?,?,?)', [orgId, userId, 'owner']);
  await conn.execute('INSERT INTO credit_wallets (organization_id, balance, lifetime_purchased) VALUES (?,?,0)', [orgId, 0]);
  await conn.execute('INSERT INTO credit_transactions (organization_id, type, amount, balance_after, description, reference) VALUES (?,?,?,?,?,?)',
    [orgId, 'credit', 0, 0, 'Account created', `org-${orgId}-welcome`]);
  return { orgId, userId, userId2: userId };
}

router.post('/register', asyncHandler(async (req, res) => {
  const { name, email, password, organizationName } = req.body;
  if (!name || !email || !password) throw new AppError('Name, email and password are required', 400, 'VALIDATION');
  if (String(password).length < 6) throw new AppError('Password must be at least 6 characters', 400, 'VALIDATION');

  const existing = await queryOne('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) throw new AppError('An account with this email already exists', 409, 'EMAIL_EXISTS');

  const token = randomToken();

  try {
    await withTransaction(async (conn) => {
      const { orgId, userId } = await createOrgWithUser(conn, {
        name, orgName: organizationName || `${name}'s Company`, email, password,
      });
      await conn.execute(
        'INSERT INTO verification_tokens (user_id, token_hash, expires_at) VALUES (?,?,DATE_ADD(NOW(), INTERVAL 24 HOUR))',
        [userId, hashToken(token)]
      );
    });
  } catch (err) {
    // users.email is UNIQUE. The check above is not atomic, so a second
    // registration for the same email submitted at the same time loses the race
    // and the raw "Duplicate entry ... for key 'uq_email'" would escape as a 500.
    if (isDuplicateKeyError(err)) {
      throw new AppError('An account with this email already exists', 409, 'EMAIL_EXISTS');
    }
    throw err;
  }

  await sendMail({
    to: email,
    subject: 'Verify your email for Telugu AI Calling',
    text: `Hello ${name},\n\nVerify your email by clicking:\n${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email?token=${token}\n\nIf you did not register, ignore this email.`,
  });

  res.status(201).json({ success: true, message: 'Account created. Please check your email to verify your account.' });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new AppError('Email and password are required', 400, 'VALIDATION');
  const user = await queryOne('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  if (user.status !== 'active') throw new AppError('Account disabled', 403, 'ACCOUNT_DISABLED');
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  await update('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
  const token = signAccessToken(user);

  let org = null;
  if (user.organization_id) {
    org = await queryOne('SELECT * FROM organizations WHERE id = ?', [user.organization_id]);
  }

  // The wallet is part of the login response.
  let wallet = null;
  if (user.organization_id) {
    try {
      const { getWallet } = require('../services/credits');
      wallet = await getWallet(user.organization_id);
    } catch (err) {
      console.warn(`[auth] Could not load wallet for org ${user.organization_id}: ${err.message}`);
      wallet = { organization_id: user.organization_id, balance: 0, lifetime_used: 0, lifetime_purchased: 0 };
    }
  }

  res.json({
    success: true,
    token,
    user: {
      id: user.id, name: user.name, email: user.email, role: user.role,
      organization_id: user.organization_id, email_verified_at: user.email_verified_at,
      first_login: user.first_login, avatar_url: user.avatar_url,
    },
    organization: org,
    wallet,
  });
}));

router.post('/logout', requireAuth, asyncHandler(async (req, res) => {
  await audit(req, 'auth.logout');
  res.json({ success: true });
}));

router.post('/verify-email', asyncHandler(async (req, res) => {
  const { token } = req.body;
  const row = await queryOne(
    'SELECT * FROM verification_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()',
    [hashToken(token)]
  );
  if (!row) throw new AppError('Invalid or expired verification token', 400, 'INVALID_TOKEN');
  await update('UPDATE verification_tokens SET used_at = NOW() WHERE id = ?', [row.id]);
  await update('UPDATE users SET email_verified_at = NOW() WHERE id = ?', [row.user_id]);
  res.json({ success: true, message: 'Email verified successfully' });
}));

router.post('/forgot-password', asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await queryOne('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) {
    // keep response the same to avoid user enumeration
    return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  }
  const token = randomToken();
  await insert(
    'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?,?,DATE_ADD(NOW(), INTERVAL 1 HOUR))',
    [user.id, hashToken(token)]
  );
  await sendMail({
    to: email,
    subject: 'Reset your password',
    text: `Hello,\n\nReset your password here:\n${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}\n\nThis link expires in 1 hour.`,
  });
  res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
}));

router.post('/reset-password', asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!password || String(password).length < 6) throw new AppError('Password must be at least 6 characters', 400, 'VALIDATION');
  const row = await queryOne(
    'SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()',
    [hashToken(token)]
  );
  if (!row) throw new AppError('Invalid or expired reset token', 400, 'INVALID_TOKEN');
  const passwordHash = await bcrypt.hash(password, 10);
  await update('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?', [row.id]);
  await update('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, row.user_id]);
  res.json({ success: true, message: 'Password updated. Please login.' });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const { query: q } = req;
  let org = null;
  let wallet = null;
  if (req.user.organization_id) {
    org = await queryOne('SELECT * FROM organizations WHERE id = ?', [req.user.organization_id]);
    let walletRow = await queryOne('SELECT * FROM credit_wallets WHERE organization_id = ?', [req.user.organization_id]);
  wallet = walletRow || { organization_id: req.user.organization_id, balance: 0, lifetime_used: 0, lifetime_purchased: 0 };
  }
  res.json({
    success: true,
    user: req.user,
    organization: org,
    wallet,
  });
}));

module.exports = router;
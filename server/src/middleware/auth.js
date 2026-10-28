const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { AppError } = require('../utils/errors');
const { queryOne, query } = require('../config/db');
const { asyncHandler } = require('../utils/helpers');

async function loadUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : (req.cookies ? req.cookies.access_token : null);
  if (!token) throw new AppError('Authentication required', 401, 'UNAUTHENTICATED');

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw new AppError('Invalid or expired token', 401, 'UNAUTHENTICATED');
  }

  const userId = payload.sub ?? payload.id ?? payload.userId;
  if (!userId) {
    throw new AppError('Invalid token: user identifier missing', 401, 'UNAUTHENTICATED');
  }

  const user = await queryOne(
    `SELECT id, organization_id, role, name, email, email_verified_at, first_login, status, avatar_url
     FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  if (!user) throw new AppError('User not found', 401, 'UNAUTHENTICATED');
  if (user.status !== 'active') throw new AppError('Account disabled', 403, 'ACCOUNT_DISABLED');

  req.user = user;

  if (user.organization_id) {
    const org = await queryOne('SELECT * FROM organizations WHERE id = ? LIMIT 1', [user.organization_id]);
    if (!org) throw new AppError('Organization not found', 403, 'ORG_NOT_FOUND');
    if (org.status !== 'active') throw new AppError('Organization suspended', 403, 'ORG_SUSPENDED');
    req.organization = org;
  }
  return user;
}

const requireAuth = asyncHandler(async (req, _res, next) => {
  await loadUser(req);
  next();
});

const requireOrg = asyncHandler(async (req, _res, next) => {
  await loadUser(req);
  if (!req.user.organization_id) throw new AppError('Organization required', 403, 'ORG_REQUIRED');
  next();
});

const requireAdmin = asyncHandler(async (req, _res, next) => {
  await loadUser(req);
  if (req.user.role !== 'admin' && req.user.role !== 'owner') throw new AppError('Admin access required', 403, 'FORBIDDEN');
  next();
});

const optionalAuth = asyncHandler(async (req, _res, next) => {
  try {
    await loadUser(req);
  } catch {}
  next();
});

function signAccessToken(user) {
  return jwt.sign({ sub: user.id, org: user.organization_id, role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

module.exports = { requireAuth, requireOrg, requireAdmin, optionalAuth, signAccessToken, loadUser };
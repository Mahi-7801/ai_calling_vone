const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { queryOne } = require('../config/db');

/**
 * Shared identity resolution for WebSocket upgrade paths.
 *
 * A browser cannot set headers on a WebSocket, so the JWT arrives in the query
 * string. org/user/role are always taken from the database, never from the
 * query, so a caller cannot claim another tenant.
 *
 * `requireOrg` is false for carrier media sockets: those are authenticated by
 * the carrier, not by a user token, and the tenant is derived from the call row
 * instead. See MediaStreamSession.
 */
async function resolveSocketIdentity(token, { requireOrg = true } = {}) {
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
  const userId = payload.sub ?? payload.id ?? payload.userId;
  if (!userId) return null;

  const user = await queryOne(
    'SELECT id, organization_id, name, status FROM users WHERE id = ? LIMIT 1',
    [userId]
  );
  if (!user || user.status !== 'active') return null;

  if (!user.organization_id) return requireOrg ? null : { user, org: null };

  const org = await queryOne('SELECT * FROM organizations WHERE id = ? LIMIT 1', [user.organization_id]);
  if (!org || org.status !== 'active') return null;

  return { user, org };
}

module.exports = { resolveSocketIdentity };

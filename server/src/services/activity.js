const { insert } = require('../config/db');

async function audit(req, action, entity = null, entityId = null, details = null) {
  try {
    await insert(
      'INSERT INTO audit_logs (organization_id, user_id, action, entity, entity_id, details, ip) VALUES (?,?,?,?,?,?,?)',
      [req.user?.organization_id || null, req.user?.id || null, action, entity, entityId,
       details ? JSON.stringify(details) : null, req.ip]
    );
  } catch {
    // audit must never crash requests
  }
}

async function notify(organizationId, userId, type, title, message) {
  try {
    await insert(
      'INSERT INTO notifications (organization_id, user_id, type, title, message) VALUES (?,?,?,?,?)',
      [organizationId, userId || null, type, title, message]
    );
  } catch {
    // ignore
  }
}

module.exports = { audit, notify };
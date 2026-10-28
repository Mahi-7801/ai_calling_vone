/**
 * InsForge PostgreSQL Database Client
 * Replaces local MySQL with InsForge BaaS PostgreSQL database.
 */
const { Pool } = require('pg');
require('dotenv').config();

let pool;

function getPool() {
  if (!pool) {
    const connectionString = process.env.INSFORGE_DB_URL;
    if (!connectionString) {
      throw new Error('[db] INSFORGE_DB_URL is not set in environment.');
    }

    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 20,
      idleTimeoutMillis: 20000,
      connectionTimeoutMillis: 10000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });

    pool.on('error', (err) => {
      if (err?.code === 'ECONNRESET') {
        // Normal behavior when cloud Postgres closes an idle TCP connection; pool reconnects automatically
        return;
      }
      console.error('[db] Unexpected error on idle InsForge client', err);
    });
  }
  return pool;
}

function sanitizeParams(params = []) {
  if (!Array.isArray(params)) return [];
  return params.map((p) => {
    if (p === undefined) return null;
    return p;
  });
}

function isDuplicateKeyError(err) {
  return err?.code === '23505' || err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062;
}

function isConnectionError(err) {
  const codes = ['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH', 'ECONNRESET', '57P01', '08006', '08001'];
  if (codes.includes(err?.code)) return true;
  if (Array.isArray(err?.errors)) return err.errors.some((e) => codes.includes(e?.code));
  return false;
}

function asConflictError(err) {
  if (!isDuplicateKeyError(err)) return err;
  const conflict = new Error(
    'This record already exists. Duplicate values are not allowed for this field.'
  );
  conflict.code = 'DUPLICATE_ENTRY';
  conflict.status = 409;
  conflict.cause = err;
  return conflict;
}

function handleQueryError(err) {
  if (isDuplicateKeyError(err)) throw asConflictError(err);
  if (!isConnectionError(err)) throw err;
  console.error(`[db] Cannot reach InsForge PostgreSQL (${err.code || err.message}).`);
  const e = new Error('Database unavailable. Cannot reach InsForge PostgreSQL.');
  e.code = 'DB_UNAVAILABLE';
  e.status = 503;
  throw e;
}

/**
 * Translates MySQL-style SQL to PostgreSQL syntax
 */
function translateSql(sql) {
  if (typeof sql !== 'string') return sql;

  let s = sql.trim();

  // Convert MySQL ON DUPLICATE KEY UPDATE to Postgres ON CONFLICT DO UPDATE / NOTHING
  if (/ON\s+DUPLICATE\s+KEY\s+UPDATE/i.test(s)) {
    if (/INSERT\s+INTO\s+admin_settings/i.test(s)) {
      s = s.replace(/ON\s+DUPLICATE\s+KEY\s+UPDATE.*/is, 'ON CONFLICT (section) DO UPDATE SET data = EXCLUDED.data');
    } else if (/INSERT\s+INTO\s+settings/i.test(s)) {
      s = s.replace(/ON\s+DUPLICATE\s+KEY\s+UPDATE.*/is, 'ON CONFLICT (organization_id, section) DO UPDATE SET data = EXCLUDED.data');
    } else if (/INSERT\s+INTO\s+call_outcomes/i.test(s)) {
      s = s.replace(/ON\s+DUPLICATE\s+KEY\s+UPDATE.*/is, 'ON CONFLICT (call_id) DO UPDATE SET outcome = EXCLUDED.outcome, confidence = EXCLUDED.confidence, reason = EXCLUDED.reason, next_action = EXCLUDED.next_action');
    } else if (/INSERT\s+INTO\s+credit_wallets/i.test(s)) {
      s = s.replace(/ON\s+DUPLICATE\s+KEY\s+UPDATE.*/is, 'ON CONFLICT (organization_id) DO NOTHING');
    } else if (/INSERT\s+INTO\s+deleted_employees/i.test(s)) {
      s = s.replace(/ON\s+DUPLICATE\s+KEY\s+UPDATE.*/is, 'ON CONFLICT (organization_id, employee_id) DO UPDATE SET deleted_at = CURRENT_TIMESTAMP');
    } else if (/INSERT\s+INTO\s+phone_numbers/i.test(s)) {
      s = s.replace(/ON\s+DUPLICATE\s+KEY\s+UPDATE.*/is, 'ON CONFLICT (number) DO UPDATE SET status = (CASE WHEN phone_numbers.status = \'released\' THEN \'active\' ELSE phone_numbers.status END)');
    } else if (/INSERT\s+INTO\s+calls/i.test(s)) {
      s = s.replace(/ON\s+DUPLICATE\s+KEY\s+UPDATE.*/is, 'ON CONFLICT (call_id) DO UPDATE SET carrier_call_uuid = COALESCE(EXCLUDED.carrier_call_uuid, calls.carrier_call_uuid)');
    } else {
      // Generic replacement for VALUES(col) -> EXCLUDED.col
      s = s.replace(/VALUES\s*\(\s*([a-zA-Z0-9_]+)\s*\)/gi, 'EXCLUDED.$1');
    }
  }

  // Convert MySQL IF(cond, a, b) to CASE WHEN cond THEN a ELSE b END
  s = s.replace(/\bIF\s*\(([^,]+),([^,]+),([^)]+)\)/gi, 'CASE WHEN $1 THEN $2 ELSE $3 END');

  // Convert MySQL IFNULL(...) to COALESCE(...)
  s = s.replace(/\bIFNULL\s*\(/gi, 'COALESCE(');

  // Convert MySQL CURDATE() to CURRENT_DATE
  s = s.replace(/\bCURDATE\s*\(\s*\)/gi, 'CURRENT_DATE');

  // Convert MySQL DATE_SUB/DATE_ADD with any interval unit
  s = s.replace(/\bDATE_SUB\s*\(([^,]+),\s*INTERVAL\s+([0-9]+)\s+([a-zA-Z]+)\)/gi, "(($1) - INTERVAL '$2 $3')");
  s = s.replace(/\bDATE_ADD\s*\(([^,]+),\s*INTERVAL\s+([0-9]+)\s+([a-zA-Z]+)\)/gi, "(($1) + INTERVAL '$2 $3')");

  // Convert MySQL TIMESTAMPDIFF(SECOND, a, b) to EXTRACT(EPOCH FROM ((b) - (a)))
  s = s.replace(/\bTIMESTAMPDIFF\s*\(\s*SECOND\s*,\s*([^,]+),\s*([^)]+)\)/gi, 'EXTRACT(EPOCH FROM (($2) - ($1)))');

  // Convert MySQL UNIX_TIMESTAMP() to EXTRACT(EPOCH FROM NOW())
  s = s.replace(/\bUNIX_TIMESTAMP\s*\(\s*\)/gi, 'EXTRACT(EPOCH FROM NOW())::integer');

  // Convert MySQL double-quoted string literals to PostgreSQL single-quoted literals
  // (In MySQL: status = "ready". In PostgreSQL: double quotes are column identifiers, causing column "ready" does not exist)
  s = s.replace(/"([^"]+)"/g, "'$1'");

  // Replace ? placeholders with $1, $2, ...
  let paramIndex = 0;
  s = s.replace(/\?/g, () => '$' + (++paramIndex));

  return s;
}

async function query(sql, params = []) {
  const pgSql = translateSql(sql);
  const sanitized = sanitizeParams(params);
  try {
    const res = await getPool().query(pgSql, sanitized);
    return res.rows;
  } catch (err) {
    if (isConnectionError(err)) {
      try {
        const res = await getPool().query(pgSql, sanitized);
        return res.rows;
      } catch (retryErr) {
        handleQueryError(retryErr);
      }
    }
    handleQueryError(err);
  }
}

async function queryAll(sql, params = []) {
  return query(sql, params);
}

async function queryOne(sql, params = []) {
  const rows = await queryAll(sql, params);
  return rows[0] || null;
}

async function insert(sql, params = []) {
  let pgSql = translateSql(sql);
  const sanitized = sanitizeParams(params);
  const isInsert = /^\s*INSERT\s+INTO/i.test(pgSql);
  if (isInsert && !/\bRETURNING\b/i.test(pgSql)) {
    pgSql += ' RETURNING id';
  }

  try {
    const res = await getPool().query(pgSql, sanitized);
    const firstRow = res.rows?.[0];
    const insertId = firstRow?.id !== undefined ? Number(firstRow.id) : 0;
    return {
      insertId,
      affectedRows: res.rowCount || (insertId > 0 ? 1 : 0),
    };
  } catch (err) {
    if (isConnectionError(err)) {
      try {
        const res = await getPool().query(pgSql, sanitized);
        const firstRow = res.rows?.[0];
        const insertId = firstRow?.id !== undefined ? Number(firstRow.id) : 0;
        return {
          insertId,
          affectedRows: res.rowCount || (insertId > 0 ? 1 : 0),
        };
      } catch (retryErr) {
        if (isDuplicateKeyError(retryErr)) throw asConflictError(retryErr);
        handleQueryError(retryErr);
      }
    }
    if (isDuplicateKeyError(err)) throw asConflictError(err);
    handleQueryError(err);
  }
}

async function upsert(sql, params = []) {
  const result = await insert(sql, params);
  return { ...result, created: result.affectedRows === 1 };
}

async function update(sql, params = []) {
  const pgSql = translateSql(sql);
  const sanitized = sanitizeParams(params);
  try {
    const res = await getPool().query(pgSql, sanitized);
    return { affectedRows: res.rowCount, changedRows: res.rowCount };
  } catch (err) {
    if (isConnectionError(err)) {
      try {
        const res = await getPool().query(pgSql, sanitized);
        return { affectedRows: res.rowCount, changedRows: res.rowCount };
      } catch (retryErr) {
        if (isDuplicateKeyError(retryErr)) throw asConflictError(retryErr);
        handleQueryError(retryErr);
      }
    }
    if (isDuplicateKeyError(err)) throw asConflictError(err);
    handleQueryError(err);
  }
}

async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    // Create wrapped executor so queries inside transaction benefit from translation
    const tx = {
      query: async (sql, params = []) => {
        const res = await client.query(translateSql(sql), sanitizeParams(params));
        return res.rows;
      },
      execute: async (sql, params = []) => {
        const res = await client.query(translateSql(sql), sanitizeParams(params));
        return [res.rows, res.fields];
      },
    };

    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function testConnection() {
  const client = await getPool().connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}

module.exports = {
  getPool,
  query,
  queryAll,
  queryOne,
  insert,
  upsert,
  update,
  withTransaction,
  testConnection,
  isDuplicateKeyError,
  translateSql,
};
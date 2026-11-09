// MySQL pool for the API. It connects as the least-privilege app account.
// Every statement uses placeholders (?) — user input is never concatenated
// into SQL. multipleStatements is OFF as a second line of defence.
const mysql = require('mysql2/promise');
const { db, isServerless } = require('./env');

const pool = mysql.createPool({
  host: db.host,
  port: db.port,
  user: db.appUser,
  password: db.appPassword,
  database: db.database,
  waitForConnections: true,
  connectionLimit: db.poolMax,
  maxIdle: Math.min(db.poolMax, isServerless ? 2 : 8),
  idleTimeout: 30000,
  connectTimeout: db.connectTimeoutMs,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  multipleStatements: false,
  decimalNumbers: true,
  // DATE columns stay 'YYYY-MM-DD' (calendar days). DATETIMEs become real instants in the
  // session time zone below, so the JSON carries ISO-8601 UTC ('…Z') and every browser
  // shows the right local time whatever its own time zone.
  dateStrings: ['DATE'],
  timezone: db.timezone,
  supportBigNumbers: true,
  bigNumberStrings: false,
  charset: 'utf8mb4',
  ...(db.ssl ? { ssl: { minVersion: 'TLSv1.2', ...(db.sslCa ? { ca: db.sslCa } : {}) } } : {}),
});

// every pooled connection works in the same, explicit time zone
pool.pool.on('connection', (conn) => { conn.query('SET time_zone = ?', [db.timezone]); });

async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

/** CALL a stored procedure; returns only the result-set arrays. */
async function call(proc, params = [], conn = pool) {
  const [results] = await conn.query(`CALL ${proc}(${params.map(() => '?').join(', ')})`, params);
  return Array.isArray(results) ? results.filter(Array.isArray) : [];
}

/**
 * Run fn(tx) inside START TRANSACTION ... COMMIT; ROLLBACK on any error.
 * actorId is exposed to audit triggers as @muse_actor_id for the duration
 * of the transaction and always cleared before the connection is reused.
 * isolation: e.g. 'READ COMMITTED' for this transaction only.
 * retries: rerun the whole unit after a deadlock (only for idempotent units).
 */
async function withTransaction(fn, opts = {}) {
  const { retries = 0 } = opts;
  for (let attempt = 0; ; attempt++) {
    try {
      return await runTransaction(fn, opts);
    } catch (err) {
      // 1213 deadlock / 1205 lock wait timeout: InnoDB already rolled back; safe to rerun the whole unit
      if (attempt < retries && (err.errno === 1213 || err.errno === 1205)) {
        await new Promise((r) => setTimeout(r, 40 + Math.random() * 120 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

async function runTransaction(fn, { actorId = null, isolation = null } = {}) {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET @muse_actor_id = ?', [actorId]);
    if (isolation) await conn.query(`SET TRANSACTION ISOLATION LEVEL ${isolation}`);
    await conn.beginTransaction();
    const tx = {
      query: async (sql, params = []) => (await conn.query(sql, params))[0],
      one: async (sql, params = []) => (await conn.query(sql, params))[0][0] || null,
      call: (proc, params = []) => call(proc, params, conn),
      conn,
    };
    const result = await fn(tx);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch { /* connection may be gone */ }
    throw err;
  } finally {
    try { await conn.query('SET @muse_actor_id = NULL'); } catch { /* ignore */ }
    conn.release();
  }
}

/** Run a single statement or procedure with the audit actor set. */
async function asActor(actorId, fn) {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET @muse_actor_id = ?', [actorId]);
    return await fn({
      query: async (sql, params = []) => (await conn.query(sql, params))[0],
      call: (proc, params = []) => call(proc, params, conn),
    });
  } finally {
    try { await conn.query('SET @muse_actor_id = NULL'); } catch { /* ignore */ }
    conn.release();
  }
}

module.exports = { pool, query, one, call, withTransaction, asActor };

// Versioned schema migrations.
//
// database/01..06 are the frozen BASELINE (schema 1.0). Every later change to the
// schema, routines, triggers or grants is a numbered file in database/migrations/
// (NNNN_description.sql, applied in order, each recorded in schema_migrations with
// a SHA-256 checksum). A fresh install = baseline + all migrations; an existing
// database is upgraded with `npm run db:migrate` without losing data.
//
//   npm run db:migrate            apply pending migrations
//   npm run db:migrate -- status  list applied / pending migrations
//
// An applied migration whose file was edited afterwards is refused (checksum
// mismatch): fix forward with a new migration instead of rewriting history.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { runSqlText } = require('./sql-runner');
const { makeTransform } = require('./placeholders');

const DIR = path.resolve(__dirname, '../../database/migrations');
const BASELINE = { version: '0000', name: 'baseline (database/01-06)' };

// `dir` defaults to database/migrations; the roadmap tests pass a temporary folder to run a
// PROPOSED migration through this same runner on a disposable schema.
function files(dir = DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort()
    .map((f) => {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      return { version: f.slice(0, 4), name: f.slice(5, -4), file: f, text, checksum: crypto.createHash('sha256').update(text).digest('hex') };
    });
}

async function ensureTable(conn) {
  await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version      CHAR(4)      NOT NULL,
      name         VARCHAR(120) NOT NULL,
      checksum     CHAR(64)     NULL,
      applied_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      execution_ms INT UNSIGNED NOT NULL DEFAULT 0,
      PRIMARY KEY (version),
      CONSTRAINT chk_mig_version CHECK (version REGEXP '^[0-9]{4}$')
    ) ENGINE=InnoDB`);
}

async function status(conn, { dir = DIR } = {}) {
  await ensureTable(conn);
  const [rows] = await conn.query('SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version');
  const applied = new Map(rows.map((r) => [r.version, r]));
  const all = files(dir);
  const problems = all.filter((m) => applied.has(m.version) && applied.get(m.version).checksum !== m.checksum)
    .map((m) => `${m.file} was changed after it was applied (checksum mismatch)`);
  return {
    baseline: applied.has(BASELINE.version),
    applied: rows,
    pending: all.filter((m) => !applied.has(m.version)),
    problems,
    latest: all.length ? all[all.length - 1].version : BASELINE.version,
  };
}

/** Record that the baseline files were just loaded (fresh install). */
async function markBaseline(conn) {
  await ensureTable(conn);
  await conn.query('INSERT IGNORE INTO schema_migrations (version, name, checksum) VALUES (?, ?, NULL)', [BASELINE.version, BASELINE.name]);
}

/**
 * Apply pending migrations in order. DDL in MySQL commits implicitly, so each
 * migration must be written to be safe if re-run after a partial failure
 * (CREATE … IF NOT EXISTS, DROP … IF EXISTS, CREATE OR REPLACE VIEW).
 */
async function migrate(conn, { transform = (s) => s, log = console.log, dir = DIR } = {}) {
  const s = await status(conn, { dir });
  if (!s.baseline) throw new Error('This database has no MUSE baseline. Run `npm run db:setup` to create it.');
  if (s.problems.length) throw new Error(s.problems.join('\n'));
  // Views, routines and triggers keep the collation of the session that created
  // them. The baseline files and the API both use the driver's utf8mb4 default
  // (utf8mb4_general_ci); pin it so migrated objects match. (07_seed.sql runs
  // `SET NAMES utf8mb4`, which would otherwise switch to utf8mb4_0900_ai_ci.)
  await conn.query('SET NAMES utf8mb4 COLLATE utf8mb4_general_ci');
  for (const m of s.pending) {
    const t = Date.now();
    try {
      await runSqlText(conn, transform(m.text));
    } catch (err) {
      throw new Error(`Migration ${m.file} failed: ${err.sqlMessage || err.message}`);
    }
    const ms = Date.now() - t;
    await conn.query('INSERT INTO schema_migrations (version, name, checksum, execution_ms) VALUES (?, ?, ?, ?)', [m.version, m.name, m.checksum, ms]);
    log(`  ✓ migration ${m.file.padEnd(40)} ${String(ms).padStart(5)} ms`);
  }
  return s.pending.length;
}

module.exports = { migrate, status, markBaseline, files, BASELINE };

// ---------------------------------------------------------------- CLI
if (require.main === module) {
  const mysql = require('mysql2/promise');
  const { db } = require('../src/config/env');
  (async () => {
    const conn = await mysql.createConnection({ host: db.host, port: db.port, user: db.ownerUser, password: db.ownerPassword,
      database: db.database, multipleStatements: true, charset: 'utf8mb4' });
    try {
      if (process.argv[2] === 'status') {
        const s = await status(conn);
        console.log(`Database "${db.database}" — baseline ${s.baseline ? 'present' : 'MISSING'}`);
        s.applied.forEach((r) => console.log(`  applied  ${r.version}  ${r.name}`));
        s.pending.forEach((m) => console.log(`  pending  ${m.version}  ${m.name}`));
        s.problems.forEach((p) => console.log(`  PROBLEM  ${p}`));
        if (s.problems.length) process.exitCode = 1;
      } else {
        const transform = makeTransform(db, (v) => conn.escape(v));   // validated identifiers, escaped password
        const n = await migrate(conn, { transform });
        console.log(n ? `Applied ${n} migration(s).` : 'Database is up to date.');
      }
    } catch (err) {
      console.error(err.message);
      process.exitCode = 1;
    } finally {
      await conn.end();
    }
  })();
}

// Phase 2 deliverables: complete DDL and sample-data DML for MySQL Workbench 8.0 CE.
//   database/phase2/MUSE_Phase2_DDL.sql   every table with columns, NOT NULL / DEFAULT, generated columns,
//                                         PRIMARY / UNIQUE / FOREIGN keys (with ON DELETE / ON UPDATE),
//                                         CHECK constraints and indexes — exactly as in the live schema
//   database/phase2/MUSE_Phase2_DML.sql   INSERTs for every table (the project's demo data)
//   database/phase2/schema.sql            DDL + DML in one file
//   database/phase2/MUSE_Phase2_Verify.sql  read-only checks to run after loading
// Read from the live `muse` database (run `npm run db:setup` first for clean demo data).
// Database name in the scripts: muse_db (so the application's `muse` database is never touched).
//
//   node backend/scripts/build-phase2-sql.js
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { db } = require('../src/config/env');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'database', 'phase2');
const DBNAME = 'muse_db';
const BATCH = 200;

const lit = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  if (Buffer.isBuffer(v)) return `X'${v.toString('hex')}'`;
  if (typeof v === 'object') return mysql.escape(JSON.stringify(v));
  return mysql.escape(String(v));
};

/** SHOW CREATE TABLE → portable, readable DDL (same meaning). */
function clean(ddl) {
  return ddl
    .replace(/ AUTO_INCREMENT=\d+/, '')
    .replace(/ DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci/, '')
    .replace(/\/\*!50100 WITH PARSER `ngram` \*\/ /g, 'WITH PARSER ngram')
    .replace(/_utf8mb4'/g, "'");
}

(async () => {
  const c = await mysql.createConnection({ host: db.host, port: db.port, user: db.ownerUser, password: db.ownerPassword,
    database: db.database, charset: 'utf8mb4', dateStrings: true, supportBigNumbers: true, bigNumberStrings: true, decimalNumbers: false });
  const q = async (sql, p = []) => (await c.query(sql, p))[0];
  const tables = (await q(`SELECT TABLE_NAME t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
                            ORDER BY TABLE_NAME`, [db.database])).map((r) => r.t);
  const refs = {};
  (await q(`SELECT DISTINCT TABLE_NAME t, REFERENCED_TABLE_NAME p FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL`, [db.database]))
    .forEach((r) => (refs[r.t] = refs[r.t] || []).push(r.p));
  const order = [];
  const seen = new Set();
  const visit = (t) => {
    if (seen.has(t)) return;
    seen.add(t);
    (refs[t] || []).filter((p) => p !== t).forEach(visit);
    order.push(t);
  };
  tables.forEach(visit);

  // ---------------- DDL
  const ddl = [`DROP DATABASE IF EXISTS ${DBNAME};`, `CREATE DATABASE ${DBNAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`, `USE ${DBNAME};`, ''];
  for (const t of order) {
    const [row] = await q(`SHOW CREATE TABLE \`${t}\``);
    ddl.push(`${clean(row['Create Table'])};`, '');
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'MUSE_Phase2_DDL.sql'), ddl.join('\n'));

  // ---------------- DML (generated columns are computed by MySQL, so they are not inserted)
  const dml = [`USE ${DBNAME};`, 'SET NAMES utf8mb4;', 'SET FOREIGN_KEY_CHECKS = 0;', ''];
  const counts = {};
  for (const t of order) {
    const cols = (await q(`SELECT COLUMN_NAME n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
                            AND EXTRA NOT LIKE '%VIRTUAL GENERATED%' AND EXTRA NOT LIKE '%STORED GENERATED%'
                            ORDER BY ORDINAL_POSITION`, [db.database, t])).map((r) => r.n);
    const pk = (await q(`SELECT COLUMN_NAME n FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
                          AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY ORDINAL_POSITION`, [db.database, t])).map((r) => `\`${r.n}\``);
    const rows = (await c.query({ sql: `SELECT ${cols.map((n) => `\`${n}\``).join(', ')} FROM \`${t}\` ORDER BY ${pk.join(', ') || 1}`, rowsAsArray: true }))[0];
    counts[t] = rows.length;
    for (let i = 0; i < rows.length; i += BATCH) {
      dml.push(`INSERT INTO ${t} (${cols.join(', ')}) VALUES\n${rows.slice(i, i + BATCH).map((r) => `(${r.map(lit).join(', ')})`).join(',\n')};`);
    }
    if (rows.length) dml.push('');
  }
  dml.push('SET FOREIGN_KEY_CHECKS = 1;', '');
  fs.writeFileSync(path.join(OUT, 'MUSE_Phase2_DML.sql'), dml.join('\n'));
  // schema.sql = DDL + DML in one file (the DDL already selects muse_db)
  fs.writeFileSync(path.join(OUT, 'schema.sql'), `${ddl.join('\n')}\n${dml.slice(1).join('\n')}`);

  // ---------------- verification (read-only)
  const verify = [`USE ${DBNAME};`, '',
    `SELECT COUNT(*) AS tables_created FROM information_schema.TABLES WHERE TABLE_SCHEMA = '${DBNAME}' AND TABLE_TYPE = 'BASE TABLE';`,
    `SELECT CONSTRAINT_TYPE, COUNT(*) AS how_many FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = '${DBNAME}' GROUP BY CONSTRAINT_TYPE ORDER BY CONSTRAINT_TYPE;`,
    `SELECT table_name, rows_loaded FROM (\n${order.map((t) => `  SELECT '${t}' AS table_name, COUNT(*) AS rows_loaded FROM ${t}`).join('\n  UNION ALL\n')}\n) x ORDER BY table_name;`,
    '',
    'SELECT u.username, p.display_name, r.name AS role FROM users u JOIN user_profiles p ON p.user_id = u.user_id JOIN roles r ON r.role_id = u.role_id ORDER BY u.user_id;',
    'SELECT s.title, a.name AS artist, al.title AS album, g.name AS genre FROM songs s JOIN artists a ON a.artist_id = s.primary_artist_id LEFT JOIN albums al ON al.album_id = s.album_id JOIN song_genres sg ON sg.song_id = s.song_id AND sg.is_primary = 1 JOIN genres g ON g.genre_id = sg.genre_id ORDER BY s.song_id LIMIT 15;',
    'SELECT m.name AS mood, COUNT(*) AS songs_tagged FROM song_moods sm JOIN moods m ON m.mood_id = sm.mood_id JOIN intelligence_models im ON im.model_id = sm.model_id AND im.is_active = 1 GROUP BY m.name ORDER BY songs_tagged DESC;',
    'SELECT u.username, COUNT(*) AS plays, SUM(lh.completed) AS completed, SUM(lh.skipped) AS skipped FROM listening_history lh JOIN users u ON u.user_id = lh.user_id GROUP BY u.username ORDER BY plays DESC;',
    '',
  ];
  fs.writeFileSync(path.join(OUT, 'MUSE_Phase2_Verify.sql'), verify.join('\n'));
  fs.mkdirSync(path.join(ROOT, 'docs', 'erd', '.build'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'docs', 'erd', '.build', 'phase2-counts.json'), JSON.stringify({ order, counts }));
  await c.end();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  for (const f of ['schema.sql', 'MUSE_Phase2_DDL.sql', 'MUSE_Phase2_DML.sql', 'MUSE_Phase2_Verify.sql']) {
    console.log(`${f}: ${(fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0)} KB`);
  }
  console.log(`${order.length} tables, ${total} rows`);
})().catch((e) => { console.error(e.message); process.exitCode = 1; });

// Data-only scripts (INSERT statements) for the structure-only Workbench models:
//   database/workbench/MUSE_Data_All_Tables.sql      -> for MUSE_ER_All_Tables(_Plain).sql    (database muse_er_all)
//   database/workbench/MUSE_Data_Core_Entities.sql   -> for MUSE_ER_Core_Entities(_Plain).sql (database muse_er)
// The rows are the real demo data of the `muse` database (run `npm run db:setup` first for a clean copy).
// Generated columns are exported as values, because the models store them as ordinary columns.
//
//   node backend/scripts/build-data-sql.js
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { db } = require('../src/config/env');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'database', 'workbench');
const CORE = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'erd', 'core-mapping.json'), 'utf8')).coreEntities;
const BATCH = 200;

function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  if (Buffer.isBuffer(v)) return `X'${v.toString('hex')}'`;
  if (typeof v === 'object') return mysql.escape(JSON.stringify(v));   // JSON columns
  return mysql.escape(String(v));
}

(async () => {
  const c = await mysql.createConnection({ host: db.host, port: db.port, user: db.ownerUser, password: db.ownerPassword,
    database: db.database, dateStrings: true, supportBigNumbers: true, bigNumberStrings: true, decimalNumbers: false });
  const [tables] = await c.query(`SELECT TABLE_NAME t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
                                   ORDER BY TABLE_NAME`, [db.database]);
  const [fkRows] = await c.query(`SELECT DISTINCT TABLE_NAME t, REFERENCED_TABLE_NAME p FROM information_schema.KEY_COLUMN_USAGE
                                   WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL`, [db.database]);
  const refs = {};
  fkRows.forEach((r) => (refs[r.t] = refs[r.t] || []).push(r.p));

  const dump = {};
  for (const { t } of tables) {
    const [cols] = await c.query(`SELECT COLUMN_NAME n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
                                   ORDER BY ORDINAL_POSITION`, [db.database, t]);
    const [pk] = await c.query(`SELECT COLUMN_NAME n FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
                                 AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY ORDINAL_POSITION`, [db.database, t]);
    const names = cols.map((x) => x.n);
    const order = pk.length ? pk.map((x) => `\`${x.n}\``).join(', ') : '1';
    const [rows] = await c.query({ sql: `SELECT ${names.map((n) => `\`${n}\``).join(', ')} FROM \`${t}\` ORDER BY ${order}`, rowsAsArray: true });
    dump[t] = { names, rows };
  }
  await c.end();

  const write = (file, set, dbName) => {
    const done = new Set();
    const ordered = [];
    const visit = (t) => {
      if (done.has(t)) return;
      done.add(t);
      (refs[t] || []).filter((p) => p !== t && set.includes(p)).forEach(visit);
      ordered.push(t);
    };
    set.forEach(visit);
    const out = [`USE ${dbName};`, 'SET NAMES utf8mb4;', 'SET FOREIGN_KEY_CHECKS = 0;', 'SET UNIQUE_CHECKS = 0;', ''];
    let total = 0;
    const counts = {};
    for (const t of ordered) {
      const { names, rows } = dump[t];
      counts[t] = rows.length;
      if (!rows.length) continue;
      total += rows.length;
      const head = `INSERT INTO ${t} (${names.join(', ')}) VALUES`;
      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH).map((r) => `(${r.map(lit).join(', ')})`);
        out.push(`${head}\n${chunk.join(',\n')};`);
      }
      out.push('');
    }
    out.push('SET UNIQUE_CHECKS = 1;', 'SET FOREIGN_KEY_CHECKS = 1;', '');
    fs.writeFileSync(path.join(OUT, file), out.join('\n'));
    console.log(`${file}: ${ordered.length} tables, ${total} rows, ${(fs.statSync(path.join(OUT, file)).size / 1024).toFixed(0)} KB`);
    fs.mkdirSync(path.join(ROOT, 'docs', 'erd', '.build'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'docs', 'erd', '.build', file.replace('.sql', '.counts.json')), JSON.stringify(counts));
  };
  write('MUSE_Data_All_Tables.sql', tables.map((x) => x.t), 'muse_er_all');
  write('MUSE_Data_Core_Entities.sql', CORE, 'muse_er');
})().catch((e) => { console.error(e.message); process.exitCode = 1; });

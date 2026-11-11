// Runs every block of database/08_queries.sql and prints pass/fail per block.
//   npm run test:sql              summary
//   npm run test:sql -- --show    also print the first rows of each result
// Connects as the least-privilege APP account, proving the application
// user can do everything the queries need (and nothing more).
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { db } = require('../src/config/env');

const show = process.argv.includes('--show');
const text = fs.readFileSync(path.resolve(__dirname, '../../database/08_queries.sql'), 'utf8');

const blocks = [];
const preamble = [];
let cur = null;
for (const line of text.split(/\r?\n/)) {
  const m = line.match(/^--\s*([QTE]\d+):\s*(.*)$/);
  if (m) { cur = { id: m[1], title: m[2], sql: [] }; blocks.push(cur); continue; }
  (cur ? cur.sql : preamble).push(line);
}

(async () => {
  const conn = await mysql.createConnection({ host: db.host, port: db.port, user: db.appUser, password: db.appPassword,
    database: db.database, multipleStatements: true, decimalNumbers: true, dateStrings: true, charset: 'utf8mb4' });
  await conn.query(preamble.filter((l) => !l.trim().startsWith('--')).join('\n'));
  let failed = 0;
  for (const b of blocks) {
    const sql = b.sql.filter((l) => !l.trim().startsWith('--')).join('\n').trim();
    const t = Date.now();
    try {
      const [res] = await conn.query(sql);
      const sets = Array.isArray(res) && res.some(Array.isArray) ? res.filter(Array.isArray) : Array.isArray(res) ? [res] : [];
      const last = sets.filter((s) => s.length).pop() || [];
      console.log(`  ✓ ${b.id.padEnd(4)} ${String(last.length).padStart(4)} rows ${String(Date.now() - t).padStart(5)} ms  ${b.title}`);
      if (show && last.length) console.table(last.slice(0, 6));
    } catch (err) {
      failed += 1;
      console.log(`  ✗ ${b.id.padEnd(4)} FAILED  ${b.title}\n        ${err.sqlMessage || err.message}`);
    }
  }
  await conn.end();
  console.log(`\n${blocks.length - failed}/${blocks.length} SQL blocks passed.`);
  process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error(e.sqlMessage || e.message); process.exitCode = 1; });

// Phase 2 data regression that tolerates rows added by the automated test suites.
//
// test-phase2-sql.js compares the submitted DDL + DML (built as muse_db) with the live application
// database `muse` table by table. The backend tests create their own users, plays and playlists in
// `muse`, so row counts and CHECKSUM TABLE differ after every test run even when nothing was lost.
// This script answers the real question: is every submitted row still present, unchanged, in `muse`?
//
//   for each of the 64 tables: hash every row of muse_db (all columns) by primary key and look it up in muse
//     missing  = submitted row no longer in muse         → regression
//     changed  = same primary key, different values      → reported with the columns that differ
//     extra    = rows only in muse                       → attributed to test-created users where possible
// Read-only on `muse`. Builds muse_roadmap_p2check from the Phase 2 files and drops it afterwards.
//   node backend/scripts/roadmap/phase2-data-regression.js
// Output: docs/roadmap/.build/phase2-data-regression.json. Exit 1 if any submitted row is missing.
// Developed by Vaishnav Sai.
const fs = require('fs');
const path = require('path');
const { db } = require('../../src/config/env');
const L = require('./lib');

const SCRATCH = 'muse_roadmap_p2check';
const LIVE = db.database;

(async () => {
  const c = await L.connect();
  const q = async (sql, p) => (await c.query(sql, p))[0];
  const report = { when: new Date().toISOString(), live: LIVE, tables: [] };
  let missingTotal = 0;
  try {
    await L.buildScratch(c, SCRATCH);
    const seedUsers = (await q(`SELECT MAX(user_id) m FROM \`${SCRATCH}\`.users`))[0].m;
    const tables = (await q("SELECT TABLE_NAME t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY 1", [SCRATCH])).map((r) => r.t);
    for (const t of tables) {
      const cols = (await q("SELECT COLUMN_NAME c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND GENERATION_EXPRESSION = '' ORDER BY ORDINAL_POSITION", [SCRATCH, t])).map((r) => r.c);
      const pk = (await q("SELECT COLUMN_NAME c FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY ORDINAL_POSITION", [SCRATCH, t])).map((r) => r.c);
      const key = pk.map((k) => `CAST(\`${k}\` AS CHAR)`).join(", '|', ");
      const hash = `CRC32(CONCAT_WS('|', ${cols.map((n) => `COALESCE(CAST(\`${n}\` AS CHAR), '\\0')`).join(', ')}))`;
      const rows = async (schema) => new Map((await q(`SELECT CONCAT(${key}) k, ${hash} h FROM \`${schema}\`.\`${t}\``)).map((r) => [r.k, Number(r.h)]));
      const sub = await rows(SCRATCH);
      const live = await rows(LIVE);
      const missing = [...sub.keys()].filter((k) => !live.has(k));
      const changedKeys = [...sub.keys()].filter((k) => live.has(k) && live.get(k) !== sub.get(k));
      const extra = [...live.keys()].filter((k) => !sub.has(k)).length;
      // which columns changed (first 5 changed rows)
      const changed = [];
      for (const k of changedKeys.slice(0, 5)) {
        const where = pk.map((p) => `\`${p}\` = ?`).join(' AND ');
        const vals = k.split('|');
        const [a] = await q(`SELECT ${cols.map((n) => `\`${n}\``).join(', ')} FROM \`${SCRATCH}\`.\`${t}\` WHERE ${where}`, vals);
        const [b] = await q(`SELECT ${cols.map((n) => `\`${n}\``).join(', ')} FROM \`${LIVE}\`.\`${t}\` WHERE ${where}`, vals);
        changed.push({ key: k, columns: cols.filter((n) => String(a[n]) !== String(b[n])) });
      }
      let extraByTestUsers = null;
      if (extra && cols.includes('user_id')) {
        extraByTestUsers = Number((await q(`SELECT COUNT(*) n FROM \`${LIVE}\`.\`${t}\` WHERE user_id > ?`, [seedUsers]))[0].n);
      }
      missingTotal += missing.length;
      report.tables.push({ table: t, submitted: sub.size, live: live.size, missing: missing.length, missingKeys: missing.slice(0, 10),
        changed: changedKeys.length, changedExamples: changed, extra, extraOwnedByTestUsers: extraByTestUsers });
    }
  } finally {
    await L.dropScratch(c, SCRATCH);
    await c.end();
  }
  const sum = (k) => report.tables.reduce((s, r) => s + (r[k] || 0), 0);
  report.totals = { tables: report.tables.length, submittedRows: sum('submitted'), missing: missingTotal, changed: sum('changed'), extra: sum('extra') };
  fs.mkdirSync(path.join(L.ROOT, 'docs/roadmap/.build'), { recursive: true });
  fs.writeFileSync(path.join(L.ROOT, 'docs/roadmap/.build/phase2-data-regression.json'), JSON.stringify(report, null, 1));
  console.log(`${report.totals.tables} tables, ${report.totals.submittedRows} submitted rows: ${report.totals.missing} missing, ${report.totals.changed} changed, ${report.totals.extra} extra rows in ${LIVE}`);
  for (const r of report.tables.filter((x) => x.missing || x.changed)) {
    console.log(`  ${r.table}: missing ${r.missing}, changed ${r.changed}${r.changedExamples.length ? ` (columns: ${[...new Set(r.changedExamples.flatMap((e) => e.columns))].join(', ')})` : ''}`);
  }
  if (missingTotal) process.exitCode = 1;
})();

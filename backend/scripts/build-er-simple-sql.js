// Clean, readable CREATE TABLE script for the core entities and the relationships
// between them, with NO data. Read from the live database so it matches the real schema.
//
//   node backend/scripts/build-er-simple-sql.js        ->  database/workbench/MUSE_ER_Core_Entities.sql
//   node backend/scripts/build-er-simple-sql.js --all  ->  database/workbench/MUSE_ER_All_Tables.sql (every table)
//
// Kept: every column (name, type, NOT NULL, default, AUTO_INCREMENT), primary keys, unique keys,
// and every foreign key between the core tables with its ON DELETE rule.
// Left out for readability: CHECK constraints, plain indexes, FULLTEXT indexes, and foreign keys
// to tables outside the core (the columns stay, with a comment naming the table they refer to).
// Generated (derived) columns become ordinary columns with a comment.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { db } = require('../src/config/env');

const ROOT = path.resolve(__dirname, '../..');
const ALL = process.argv.includes('--all');
const OUT = path.join(ROOT, 'database', 'workbench', ALL ? 'MUSE_ER_All_Tables.sql' : 'MUSE_ER_Core_Entities.sql');
let CORE = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'erd', 'core-mapping.json'), 'utf8')).coreEntities;
const DBNAME = ALL ? 'muse_er_all' : 'muse_er';
const CREDIT = 'Developed by Vaishnav Sai';
const NUMERIC = /^(tinyint|smallint|mediumint|int|bigint|decimal|float|double)/;

(async () => {
  const c = await mysql.createConnection({ host: db.host, port: db.port, user: db.ownerUser, password: db.ownerPassword, database: db.database });
  if (ALL) {
    const [rows] = await c.query("SELECT TABLE_NAME t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME", [db.database]);
    CORE = rows.map((r) => r.t);
  }
  const q = async (sql) => (await c.query(sql, [db.database, CORE]))[0];
  const cols = await q(`SELECT TABLE_NAME t, COLUMN_NAME n, COLUMN_TYPE type, IS_NULLABLE nullable, COLUMN_DEFAULT def, EXTRA extra
                          FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?) ORDER BY TABLE_NAME, ORDINAL_POSITION`);
  const idx = await q(`SELECT TABLE_NAME t, INDEX_NAME i, NON_UNIQUE nu, COLUMN_NAME n FROM information_schema.STATISTICS
                        WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?) ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`);
  const fks = await q(`SELECT k.CONSTRAINT_NAME name, k.TABLE_NAME t, k.COLUMN_NAME n, k.REFERENCED_TABLE_NAME rt, k.REFERENCED_COLUMN_NAME rc, r.DELETE_RULE del
                         FROM information_schema.KEY_COLUMN_USAGE k
                         JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
                        WHERE k.TABLE_SCHEMA = ? AND k.TABLE_NAME IN (?) ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION`);
  await c.end();

  const byTable = (rows) => rows.reduce((m, r) => ((m[r.t] = m[r.t] || []).push(r), m), {});
  const C = byTable(cols);
  const I = byTable(idx);
  const F = {};
  for (const r of fks) {
    const t = (F[r.t] = F[r.t] || {});
    const f = (t[r.name] = t[r.name] || { name: r.name, rt: r.rt, del: r.del, cols: [], ref: [] });
    f.cols.push(r.n); f.ref.push(r.rc);
  }

  // parents first, so the script runs with foreign-key checks on
  const order = [];
  const seen = new Set();
  const visit = (t) => {
    if (seen.has(t)) return;
    seen.add(t);
    Object.values(F[t] || {}).forEach((f) => f.rt !== t && CORE.includes(f.rt) && visit(f.rt));
    order.push(t);
  };
  CORE.forEach(visit);

  let nFk = 0;
  const outsideRef = [];
  const blocks = order.map((t) => {
    const outside = {};
    Object.values(F[t] || {}).filter((f) => !CORE.includes(f.rt)).forEach((f) => f.cols.forEach((n) => (outside[n] = f.rt)));
    const width = Math.max(...C[t].map((x) => x.n.length));
    const lines = C[t].map((x) => {
      let s = `  ${x.n.padEnd(width)}  ${x.type.toUpperCase().replace(/^ENUM/, 'ENUM')}`;
      if (/^enum\(/.test(x.type)) s = `  ${x.n.padEnd(width)}  ENUM${x.type.slice(4)}`;
      const generated = /GENERATED/.test(x.extra) && !/DEFAULT_GENERATED/.test(x.extra);
      if (x.nullable === 'NO') s += ' NOT NULL';
      if (/auto_increment/.test(x.extra)) s += ' AUTO_INCREMENT';
      if (!generated && x.def !== null) {
        if (/DEFAULT_GENERATED/.test(x.extra)) s += ` DEFAULT ${x.def}`;
        else if (NUMERIC.test(x.type)) s += ` DEFAULT ${x.def}`;
        else s += ` DEFAULT '${String(x.def).replace(/'/g, "''")}'`;
      }
      if (/on update CURRENT_TIMESTAMP/i.test(x.extra)) s += ' ON UPDATE CURRENT_TIMESTAMP';
      const notes = [];
      if (generated) notes.push('derived: generated from other columns in the full database');
      if (outside[x.n]) notes.push(`refers to ${outside[x.n]} (table not part of the ${CORE.length})`);
      return { s, note: notes.join('; ') };
    });
    const keys = [];
    const ix = {};
    (I[t] || []).forEach((r) => ((ix[r.i] = ix[r.i] || { nu: r.nu, cols: [] }).cols.push(r.n)));
    keys.push(`  PRIMARY KEY (${ix.PRIMARY.cols.join(', ')})`);
    Object.entries(ix).filter(([n, v]) => n !== 'PRIMARY' && Number(v.nu) === 0)
      .forEach(([n, v]) => keys.push(`  CONSTRAINT ${n} UNIQUE (${v.cols.join(', ')})`));
    Object.values(F[t] || {}).filter((f) => CORE.includes(f.rt)).forEach((f) => {
      nFk++;
      const del = f.del === 'NO ACTION' ? 'RESTRICT' : f.del;
      keys.push(`  CONSTRAINT ${f.name} FOREIGN KEY (${f.cols.join(', ')})\n    REFERENCES ${f.rt} (${f.ref.join(', ')}) ON DELETE ${del}`);
    });
    Object.values(F[t] || {}).filter((f) => !CORE.includes(f.rt)).forEach((f) => outsideRef.push(`${t}(${f.cols.join(', ')}) -> ${f.rt}`));
    const all = [...lines.map((l) => ({ ...l })), ...keys.map((k) => ({ s: k, note: '' }))];
    const body = all.map((l, i) => {
      const comma = i < all.length - 1 ? ',' : '';
      return l.note ? `${l.s}${comma}   -- ${l.note}` : `${l.s}${comma}`;
    }).join('\n');
    return `-- ${t}\nCREATE TABLE ${t} (\n${body}\n) ENGINE = InnoDB;\n`;
  });

  const sql = `-- =====================================================================
--  MUSE — Music Mood Intelligence & Recommendation Database System
--  ${ALL ? `ALL ${CORE.length} TABLES` : `ENTITIES AND RELATIONSHIPS ONLY (${CORE.length} core entities`}, ${nFk} relationships${ALL ? '' : ')'}
--  ${CREDIT}
--  No data is inserted. Runs directly in MySQL 8.0 / MySQL Workbench.
--
--  How to run in Workbench: open this file (File > Open SQL Script), then
--  click the lightning bolt (Execute all). Refresh the Schemas panel.
--  To see the ER diagram: Database > Reverse Engineer > schema "${DBNAME}",
--  or File > Import > Reverse Engineer MySQL Create Script (this file).
--
--  Kept: all columns, primary keys, unique keys and every foreign key
--  between these ${CORE.length} tables.${ALL ? '' : ` Columns that refer to tables outside the ${CORE.length}\n--  are kept and marked with a comment.`}
--  Left out for readability: CHECK constraints and non-unique indexes; generated
--  columns become ordinary columns (marked "derived").
--  Generated by backend/scripts/build-er-simple-sql.js from the real schema.
-- =====================================================================

DROP DATABASE IF EXISTS ${DBNAME};
CREATE DATABASE ${DBNAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE ${DBNAME};

${blocks.join('\n')}
-- check: should show ${CORE.length} tables and ${nFk} foreign keys
SELECT COUNT(*) AS tables_created FROM information_schema.tables WHERE table_schema = '${DBNAME}';
SELECT COUNT(*) AS foreign_keys FROM information_schema.referential_constraints WHERE constraint_schema = '${DBNAME}';
`;
  fs.writeFileSync(OUT, sql);
  // --plain: the same script with every comment and the check queries removed (pure DDL)
  if (process.argv.includes('--plain')) {
    const plain = sql.split('\n')
      .filter((l) => !/^\s*--/.test(l) && !/^SELECT COUNT/.test(l))
      .map((l) => l.replace(/\s+--\s.*$/, ''))
      .join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
    const plainOut = OUT.replace(/\.sql$/, '_Plain.sql');
    fs.writeFileSync(plainOut, plain);
    console.log(`${plainOut}: no comments, ${plain.split('\n').length} lines`);
  }
  console.log(`${OUT}: ${order.length} tables, ${nFk} foreign keys, ${sql.split('\n').length} lines`);
})().catch((e) => { console.error(e.message); process.exitCode = 1; });

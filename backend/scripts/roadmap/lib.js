// Shared helpers for testing PROPOSED migrations on disposable schemas.
// Nothing here connects to the application database by name: every function takes the
// scratch schema it works on, and buildScratch() refuses the names of real databases.
// Developed by Vaishnav Sai.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { db } = require('../../src/config/env');

const ROOT = path.resolve(__dirname, '../../..');
const PROTECTED = new Set(['muse', 'muse_db', 'mysql', 'sys', 'information_schema', 'performance_schema', String(db.database)]);

async function connect() {
  return mysql.createConnection({ host: db.host, port: db.port, user: db.ownerUser, password: db.ownerPassword,
    charset: 'utf8mb4', multipleStatements: true, dateStrings: true });
}

/** Split a script that uses DELIMITER blocks into single statements (comment-only lines dropped). */
function statements(sql) {
  const out = [];
  let delim = ';';
  let buf = '';
  for (const line of sql.split('\n')) {
    const m = line.match(/^\s*DELIMITER\s+(\S+)\s*$/i);
    if (m) { delim = m[1]; continue; }
    if (/^\s*--/.test(line) && !buf.trim()) continue;
    buf += line + '\n';
    if (buf.trimEnd().endsWith(delim)) {
      const s = buf.trimEnd().slice(0, -delim.length).trim();
      if (s) out.push(s);
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/** (Re)create a scratch schema from the submitted Phase 2 DDL + DML (the 64-table baseline at migration 0004). */
async function buildScratch(c, name) {
  if (!/^muse_[a-z0-9_]*check[a-z0-9_]*$/.test(name) || PROTECTED.has(name)) throw new Error(`Refusing to use ${name} as a scratch schema`);
  await c.query(`DROP DATABASE IF EXISTS \`${name}\``);
  const ddl = fs.readFileSync(path.join(ROOT, 'database/phase2/MUSE_Phase2_DDL.sql'), 'utf8').replace(/muse_db/g, name);
  const dml = fs.readFileSync(path.join(ROOT, 'database/phase2/MUSE_Phase2_DML.sql'), 'utf8').replace(/muse_db/g, name);
  await c.query(ddl);
  await c.query(dml);
  await c.query(`USE \`${name}\``);
  // same session collation as backend/scripts/migrate.js
  await c.query('SET NAMES utf8mb4 COLLATE utf8mb4_general_ci');
}

async function dropScratch(c, name) {
  if (PROTECTED.has(name)) throw new Error(`Refusing to drop ${name}`);
  await c.query(`DROP DATABASE IF EXISTS \`${name}\``);
}

/**
 * Structural fingerprint of a schema: columns (without ordinal position), keys, constraints with
 * their rules and CHECK clauses, triggers, routines and views. Two schemas with equal fingerprints
 * have the same structure as far as the application can observe.
 */
async function fingerprint(c, schema) {
  const q = async (sql) => (await c.query(sql, [schema]))[0];
  return {
    tables: await q("SELECT TABLE_NAME n, TABLE_TYPE t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY 1"),
    columns: await q(`SELECT TABLE_NAME t, COLUMN_NAME c, COLUMN_TYPE ty, IS_NULLABLE nl, COLUMN_DEFAULT d, EXTRA x, GENERATION_EXPRESSION g
                        FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY 1, 2`),
    indexes: await q(`SELECT TABLE_NAME t, INDEX_NAME i, NON_UNIQUE u, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) cols
                        FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? GROUP BY 1, 2, 3 ORDER BY 1, 2`),
    constraints: await q(`SELECT tc.TABLE_NAME t, tc.CONSTRAINT_NAME n, tc.CONSTRAINT_TYPE ty, cc.CHECK_CLAUSE chk,
                                 rc.UPDATE_RULE ur, rc.DELETE_RULE dr, rc.REFERENCED_TABLE_NAME rt
                            FROM information_schema.TABLE_CONSTRAINTS tc
                            LEFT JOIN information_schema.CHECK_CONSTRAINTS cc ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
                            LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS rc ON rc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA AND rc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
                           WHERE tc.CONSTRAINT_SCHEMA = ? ORDER BY 1, 2`),
    triggers: await q(`SELECT TRIGGER_NAME n, EVENT_OBJECT_TABLE t, ACTION_TIMING tm, EVENT_MANIPULATION ev, ACTION_STATEMENT body
                         FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ? ORDER BY 1`),
    routines: await q(`SELECT ROUTINE_NAME n, ROUTINE_TYPE t, DTD_IDENTIFIER r, ROUTINE_DEFINITION body
                         FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ? ORDER BY 1`),
    views: await q('SELECT TABLE_NAME n, VIEW_DEFINITION d FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ? ORDER BY 1'),
  };
}

/** Names of every object kind in a fingerprint, for "what was added" comparisons. */
function names(fp) {
  return {
    tables: fp.tables.filter((t) => t.t === 'BASE TABLE').map((t) => t.n),
    views: fp.views.map((v) => v.n),
    constraints: fp.constraints.map((k) => k.n),
    triggers: fp.triggers.map((t) => t.n),
    routines: fp.routines.map((r) => r.n),
    columns: fp.columns.map((col) => `${col.t}.${col.c}`),
  };
}

/** Differences between two fingerprints, as readable strings (empty array = identical). */
function diff(a, b) {
  const out = [];
  for (const k of Object.keys(a)) {
    const A = new Set(a[k].map((r) => JSON.stringify(r)));
    const B = new Set(b[k].map((r) => JSON.stringify(r)));
    for (const r of A) if (!B.has(r)) out.push(`${k} only in first: ${r.slice(0, 200)}`);
    for (const r of B) if (!A.has(r)) out.push(`${k} only in second: ${r.slice(0, 200)}`);
  }
  return out;
}

/**
 * Content hash of every base table, over the columns it has NOW. Taken before a migration and
 * re-taken afterwards over the same column lists, it proves no existing value changed or vanished.
 */
async function dataHashes(c, schema, columnsByTable = null) {
  const cols = columnsByTable || {};
  if (!columnsByTable) {
    const rows = (await c.query(`SELECT c.TABLE_NAME t, c.COLUMN_NAME n FROM information_schema.COLUMNS c
                                   JOIN information_schema.TABLES tb ON tb.TABLE_SCHEMA = c.TABLE_SCHEMA AND tb.TABLE_NAME = c.TABLE_NAME AND tb.TABLE_TYPE = 'BASE TABLE'
                                  WHERE c.TABLE_SCHEMA = ? AND c.GENERATION_EXPRESSION = '' ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION`, [schema]))[0];
    for (const r of rows) (cols[r.t] ||= []).push(r.n);
  }
  const hashes = {};
  for (const [t, list] of Object.entries(cols)) {
    const expr = list.map((n) => `COALESCE(CAST(\`${n}\` AS CHAR), '\\0')`).join(", '|', ");
    const [[r]] = await c.query(`SELECT COUNT(*) n, COALESCE(BIT_XOR(CRC32(CONCAT(${expr}))), 0) h FROM \`${schema}\`.\`${t}\``);
    hashes[t] = `${r.n}:${r.h}`;
  }
  return { cols, hashes };
}

/** Object names a migration file creates or replaces — they must not already exist in the baseline. */
function declaredObjects(sql) {
  const grab = (re) => [...sql.matchAll(re)].map((m) => m[1]);
  return {
    tables: grab(/CREATE TABLE IF NOT EXISTS\s+`?(\w+)`?/gi),
    views: grab(/CREATE OR REPLACE VIEW\s+`?(\w+)`?/gi),
    triggers: grab(/CREATE TRIGGER\s+`?(\w+)`?/gi),
    routines: [...grab(/CREATE FUNCTION\s+`?(\w+)`?/gi), ...grab(/CREATE PROCEDURE\s+`?(\w+)`?/gi)],
    constraints: grab(/CONSTRAINT\s+`?(\w+)`?\s+(?:FOREIGN|CHECK|UNIQUE|PRIMARY)/gi)
      .concat(grab(/mig_\d{4}_add_constraint\('\w+',\s*'(\w+)'/gi)),
    columns: [...sql.matchAll(/mig_\d{4}_add_column\('(\w+)',\s*'(\w+)'/gi)].map((m) => `${m[1]}.${m[2]}`),
  };
}

module.exports = { ROOT, connect, statements, buildScratch, dropScratch, fingerprint, names, diff, dataHashes, declaredObjects };

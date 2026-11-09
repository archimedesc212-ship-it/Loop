// Writes docs/DATA_DICTIONARY.md from the live schema (information_schema),
// so the dictionary can never drift from the database.   npm run docs:dictionary
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { db } = require('../src/config/env');

const PURPOSE = {};   // first comment block above each CREATE TABLE in 01_schema.sql
const schemaText = fs.readFileSync(path.resolve(__dirname, '../../database/01_schema.sql'), 'utf8');
schemaText.replace(/((?:^--[^\n]*\n)+)CREATE TABLE (\w+)/gm, (m, comment, table) => {
  PURPOSE[table] = comment.split('\n').map((l) => l.replace(/^--\s?/, '').trim()).filter((l) => l && !/^=+$/.test(l) && !/^\d+\./.test(l)).join(' ');
});

(async () => {
  const c = await mysql.createConnection({ host: db.host, port: db.port, user: db.ownerUser, password: db.ownerPassword, database: db.database, charset: 'utf8mb4' });
  const [tables] = await c.query(`SELECT TABLE_NAME AS t, TABLE_ROWS AS n FROM information_schema.TABLES
                                   WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`, [db.database]);
  const [cols] = await c.query(`SELECT TABLE_NAME AS t, COLUMN_NAME AS c, COLUMN_TYPE AS type, IS_NULLABLE AS nul, COLUMN_DEFAULT AS def,
                                       COLUMN_KEY AS k, EXTRA AS extra, GENERATION_EXPRESSION AS gen
                                  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION`, [db.database]);
  const [fks] = await c.query(`SELECT k.TABLE_NAME AS t, k.COLUMN_NAME AS c, k.REFERENCED_TABLE_NAME AS rt, k.REFERENCED_COLUMN_NAME AS rc,
                                      r.DELETE_RULE AS del, r.UPDATE_RULE AS upd, k.CONSTRAINT_NAME AS name
                                 FROM information_schema.KEY_COLUMN_USAGE k
                                 JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
                                WHERE k.TABLE_SCHEMA = ? AND k.REFERENCED_TABLE_NAME IS NOT NULL`, [db.database]);
  const [checks] = await c.query(`SELECT tc.TABLE_NAME AS t, cc.CONSTRAINT_NAME AS name, cc.CHECK_CLAUSE AS clause
                                    FROM information_schema.CHECK_CONSTRAINTS cc
                                    JOIN information_schema.TABLE_CONSTRAINTS tc ON tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
                                   WHERE cc.CONSTRAINT_SCHEMA = ?`, [db.database]);
  const [idx] = await c.query(`SELECT TABLE_NAME AS t, INDEX_NAME AS name, NON_UNIQUE AS nu, INDEX_TYPE AS type,
                                      GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
                                 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE, INDEX_TYPE`, [db.database]);
  await c.end();

  const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const out = ['# MUSE — Data dictionary', '',
    `Generated from the live \`${db.database}\` schema by \`npm run docs:dictionary\` on ${new Date().toISOString().slice(0, 10)}.`,
    `${tables.length} tables. Key: **PK** primary key, **UQ** unique, **IX** indexed, **FK** foreign key, *gen* generated column.`, ''];
  out.push('## Tables', '', tables.map((t) => `[\`${t.t}\`](#${t.t.replace(/_/g, '_')})`).join(' · '), '');
  for (const { t } of tables) {
    out.push(`## ${t}`, '');
    if (PURPOSE[t]) out.push(`${PURPOSE[t]}`, '');
    out.push('| Column | Type | Null | Key | Default / extra | References |', '|---|---|---|---|---|---|');
    for (const col of cols.filter((x) => x.t === t)) {
      const fk = fks.find((f) => f.t === t && f.c === col.c);
      const key = { PRI: 'PK', UNI: 'UQ', MUL: 'IX' }[col.k] || '';
      const genOf = (g) => (/regexp_replace/i.test(g) ? `normalised copy of \`${(g.match(/`(\w+)`/) || [])[1]}\` (lower-case, punctuation folded)`
        : `\`${esc(g).slice(0, 80)}\``);
      const extra = col.gen ? `*gen:* ${genOf(col.gen)}` : [col.def !== null ? `default ${esc(col.def)}` : '', esc(col.extra)].filter(Boolean).join(', ');
      out.push(`| \`${col.c}\` | ${esc(col.type)} | ${col.nul === 'YES' ? 'yes' : 'no'} | ${key}${fk ? ' FK' : ''} | ${extra} | ${fk ? `${fk.rt}.${fk.rc} (on delete ${fk.del.toLowerCase()})` : ''} |`);
    }
    const ix = idx.filter((i) => i.t === t);
    if (ix.length) out.push('', `**Indexes:** ${ix.map((i) => `\`${i.name}\` (${i.cols})${i.nu ? '' : ' unique'}${i.type === 'FULLTEXT' ? ' fulltext' : ''}`).join('; ')}`);
    const ck = checks.filter((x) => x.t === t);
    if (ck.length) out.push('', `**Checks:** ${ck.map((x) => `\`${x.name}\``).join(', ')}`);
    out.push('');
  }
  const file = path.resolve(__dirname, '../../docs/DATA_DICTIONARY.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out.join('\n'));
  console.log(`Wrote ${file} (${tables.length} tables, ${cols.length} columns, ${new Set(fks.map((f) => `${f.t}.${f.name}`)).size} foreign keys (${fks.length} column references), ${checks.length} checks)`);
})().catch((e) => { console.error(e.sqlMessage || e.message); process.exitCode = 1; });

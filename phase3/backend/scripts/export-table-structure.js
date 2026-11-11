// Exports the table structure of a loaded MUSE database (default muse_db, loaded from database/phase2/schema.sql)
// straight from information_schema, as:
//   docs/phase2/MUSE_Table_Structure.pdf   one block per table: columns (type, PK, NN, UQ, AI, default), indexes, foreign keys, CHECKs
//   docs/phase2/MUSE_Table_Structure.csv   one row per column
//   docs/phase2/structure_png/<table>.png  one image per table (same content as the PDF)
//
//   node backend/scripts/export-table-structure.js [database]   (muse_db must already be loaded)
//   node backend/scripts/export-table-structure.js --load       (loads schema.sql into muse_db, exports, drops it)
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { chromium } = require('playwright');
const { db } = require('../src/config/env');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'docs', 'phase2');
const LOAD = process.argv.includes('--load');   // load database/phase2/schema.sql first, drop muse_db afterwards
const SCHEMA = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'muse_db';
const CREDIT = 'Developed by Vaishnav Sai';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

(async () => {
  const c = await mysql.createConnection({ host: db.host, port: db.port, user: db.ownerUser, password: db.ownerPassword, charset: 'utf8mb4', multipleStatements: LOAD });
  if (LOAD) await c.query(fs.readFileSync(path.join(ROOT, 'database', 'phase2', 'schema.sql'), 'utf8'));
  const q = async (sql) => (await c.query(sql, [SCHEMA]))[0];
  const tables = await q(`SELECT TABLE_NAME t, ENGINE e, TABLE_COLLATION co, TABLE_ROWS r FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY 1`);
  if (!tables.length) throw new Error(`database ${SCHEMA} has no tables — load database/phase2/schema.sql first`);
  const cols = await q(`SELECT TABLE_NAME t, COLUMN_NAME n, COLUMN_TYPE ty, IS_NULLABLE nl, COLUMN_KEY k, COLUMN_DEFAULT d, EXTRA x, GENERATION_EXPRESSION g
                          FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION`);
  const idx = await q(`SELECT TABLE_NAME t, INDEX_NAME i, NON_UNIQUE nu, INDEX_TYPE ty, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ', ') c
                         FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? GROUP BY 1, 2, 3, 4 ORDER BY 1, INDEX_NAME <> 'PRIMARY', 2`);
  const fks = await q(`SELECT k.TABLE_NAME t, k.CONSTRAINT_NAME n, GROUP_CONCAT(k.COLUMN_NAME ORDER BY k.ORDINAL_POSITION SEPARATOR ', ') c, k.REFERENCED_TABLE_NAME p,
                              GROUP_CONCAT(k.REFERENCED_COLUMN_NAME ORDER BY k.ORDINAL_POSITION SEPARATOR ', ') pc, r.DELETE_RULE d, r.UPDATE_RULE u
                         FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r
                           ON r.CONSTRAINT_SCHEMA = k.TABLE_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND r.TABLE_NAME = k.TABLE_NAME
                        WHERE k.TABLE_SCHEMA = ? GROUP BY 1, 2, 4, 6, 7 ORDER BY 1, 2`);
  const chks = await q(`SELECT tc.TABLE_NAME t, tc.CONSTRAINT_NAME n, cc.CHECK_CLAUSE cl FROM information_schema.TABLE_CONSTRAINTS tc
                          JOIN information_schema.CHECK_CONSTRAINTS cc ON cc.CONSTRAINT_SCHEMA = tc.TABLE_SCHEMA AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
                         WHERE tc.TABLE_SCHEMA = ? AND tc.CONSTRAINT_TYPE = 'CHECK' ORDER BY 1, 2`);
  const counts = {};
  for (const { t } of tables) counts[t] = (await c.query(`SELECT COUNT(*) n FROM \`${SCHEMA}\`.\`${t}\``))[0][0].n;
  const version = (await c.query('SELECT VERSION() v'))[0][0].v;
  // information_schema returns generation expressions and CHECK clauses escaped and with broken non-ASCII text,
  // so both are taken from SHOW CREATE TABLE, which gives them exactly as defined
  const genExpr = {};
  const chkText = {};
  for (const { t } of tables) {
    const ddl = (await c.query(`SHOW CREATE TABLE \`${SCHEMA}\`.\`${t}\``))[0][0]['Create Table'].replace(/_utf8mb4'/g, "'");
    for (const line of ddl.split('\n')) {
      const g = line.match(/^ {2}`([^`]+)` .*? GENERATED ALWAYS AS \((.*)\) (STORED|VIRTUAL)/);
      if (g) genExpr[`${t}.${g[1]}`] = `${g[2]} ${g[3]}`;
      const k = line.match(/^ {2}CONSTRAINT `([^`]+)` CHECK \((.*)\),?$/);
      if (k) chkText[k[1]] = k[2];
    }
  }
  if (LOAD) await c.query(`DROP DATABASE ${SCHEMA}`);
  await c.end();

  const by = (rows) => rows.reduce((m, r) => ((m[r.t] = m[r.t] || []).push(r), m), {});
  const C = by(cols); const I = by(idx); const F = by(fks); const K = by(chks);
  const uqCols = new Set((idx.filter((r) => Number(r.nu) === 0 && r.i !== 'PRIMARY' && !r.c.includes(','))).map((r) => `${r.t}.${r.c}`));
  const pkCols = new Set(idx.filter((r) => r.i === 'PRIMARY').flatMap((r) => r.c.split(', ').map((x) => `${r.t}.${x}`)));
  const rule = (r) => (r === 'NO ACTION' ? 'RESTRICT' : r);
  const tick = (b) => (b ? '✔' : '');

  const block = (t) => {
    const colRows = C[t.t].map((x) => {
      const gen = /GENERATED/.test(x.x) && x.x !== 'DEFAULT_GENERATED' && !/DEFAULT_GENERATED/.test(x.x);
      const def = gen ? `AS (${genExpr[`${t.t}.${x.n}`]}`.replace(/ (STORED|VIRTUAL)$/, ') $1') : x.d === null ? (x.nl === 'YES' ? 'NULL' : '') : x.d;
      const extra = x.x.replace(/DEFAULT_GENERATED ?/, '').replace(/(VIRTUAL|STORED) GENERATED/, '').replace('auto_increment', '').trim();
      return `<tr><td class="n">${pkCols.has(`${t.t}.${x.n}`) ? '🔑 ' : ''}${esc(x.n)}</td><td>${esc(x.ty.toUpperCase().replace(/^ENUM/, 'ENUM'))}</td>
        <td class="c">${tick(pkCols.has(`${t.t}.${x.n}`))}</td><td class="c">${tick(x.nl === 'NO')}</td><td class="c">${tick(uqCols.has(`${t.t}.${x.n}`))}</td>
        <td class="c">${tick(/auto_increment/.test(x.x))}</td><td class="c">${tick(gen)}</td><td class="d">${esc(def)}${extra ? ` <i>${esc(extra)}</i>` : ''}</td></tr>`;
    }).join('');
    const ix = (I[t.t] || []).map((r) => `<li><b>${esc(r.i)}</b> <span>${r.i === 'PRIMARY' ? 'PRIMARY' : r.ty === 'FULLTEXT' ? 'FULLTEXT' : Number(r.nu) === 0 ? 'UNIQUE' : 'INDEX'}</span> (${esc(r.c)})</li>`).join('');
    const fk = (F[t.t] || []).map((r) => `<li><b>${esc(r.n)}</b> (${esc(r.c)}) → ${esc(r.p)}(${esc(r.pc)}) <span>ON DELETE ${rule(r.d)} · ON UPDATE ${rule(r.u)}</span></li>`).join('');
    const ck = (K[t.t] || []).map((r) => `<li><b>${esc(r.n)}</b> ${esc(chkText[r.n] ?? r.cl)}</li>`).join('');
    return `<section class="tbl" id="${t.t}"><h2>${esc(t.t)} <small>${C[t.t].length} columns · ${counts[t.t]} rows · ${t.e} · ${t.co}</small></h2>
<table><tr><th>Column</th><th>Datatype</th><th>PK</th><th>NN</th><th>UQ</th><th>AI</th><th>G</th><th>Default / Expression</th></tr>${colRows}</table>
<div class="meta"><div><h3>Indexes (${(I[t.t] || []).length})</h3><ul>${ix}</ul></div>
<div><h3>Foreign keys (${(F[t.t] || []).length})</h3><ul>${fk || '<li class="none">none</li>'}</ul>
<h3>CHECK constraints (${(K[t.t] || []).length})</h3><ul>${ck || '<li class="none">none</li>'}</ul></div></div></section>`;
  };

  const css = `*{box-sizing:border-box} body{font-family:"Liberation Sans",Arial,sans-serif;font-size:8.6pt;color:#1d1d1d;margin:0;background:#fff}
h1{font-size:17pt;margin:0 0 2mm} .sub{color:#555;margin-bottom:5mm}
.tbl{break-inside:avoid;border:1px solid #c8ccd2;border-radius:3px;margin:0 0 5mm;padding:2.5mm 3mm;background:#fff}
h2{font-size:11.5pt;margin:0 0 2mm;color:#24364d} h2 small{font-size:7.6pt;color:#666;font-weight:normal;margin-left:2mm}
table{width:100%;border-collapse:collapse;font-size:8pt} th{background:#e9edf2;text-align:left;padding:1mm 1.4mm;border:1px solid #cfd5dc;font-weight:bold}
td{padding:.8mm 1.4mm;border:1px solid #e1e4e8;vertical-align:top} td.c,th:nth-child(n+3):nth-child(-n+7){text-align:center;width:7mm}
td.n{font-family:"Liberation Mono",monospace;white-space:nowrap} td.d{font-family:"Liberation Mono",monospace;font-size:7.3pt;word-break:break-word}
td i{color:#7a4b12;font-style:normal} tr:nth-child(even) td{background:#fafbfc}
.meta{display:grid;grid-template-columns:1fr 1.4fr;gap:4mm;margin-top:2mm} h3{font-size:8.2pt;margin:1.2mm 0 .8mm;color:#24364d}
ul{margin:0;padding-left:4mm;font-size:7.4pt;line-height:1.35} li span{color:#666} li.none{color:#999;list-style:none;margin-left:-4mm}
.legend{font-size:7.6pt;color:#555;margin-bottom:4mm} .credit{color:#888;font-size:7.4pt;margin-top:3mm}`;
  const legend = 'PK = primary key · NN = NOT NULL · UQ = unique (single column) · AI = AUTO_INCREMENT · G = generated column. Composite unique keys are listed under Indexes.';
  const totals = { cols: cols.length, fk: fks.length, ck: chks.length, ix: idx.length };
  const page = (body) => `<!doctype html><html><head><meta charset="utf-8"><title>MUSE table structure</title><style>${css}</style></head><body>${body}</body></html>`;
  const doc = page(`<div style="padding:0"><h1>MUSE — Table Structure</h1>
<div class="sub">Database <b>${SCHEMA}</b> on MySQL ${esc(version.split('-')[0])}, loaded from <code>schema.sql</code>. Exported from information_schema:
${tables.length} tables, ${totals.cols} columns, ${totals.ix} indexes, ${totals.fk} foreign keys, ${totals.ck} CHECK constraints.</div>
<div class="legend">${legend}</div>${tables.map(block).join('\n')}<div class="credit">${CREDIT}</div></div>`);

  fs.mkdirSync(path.join(OUT, 'structure_png'), { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent(doc);
  await p.pdf({ path: path.join(OUT, 'MUSE_Table_Structure.pdf'), format: 'A4', margin: { top: '12mm', bottom: '14mm', left: '11mm', right: '11mm' }, printBackground: true,
    displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="font-family:Arial;font-size:7px;color:#888;width:100%;padding:0 11mm;display:flex;justify-content:space-between"><span>MUSE — table structure (muse_db)</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>' });
  await p.setViewportSize({ width: 1000, height: 800 });
  await p.setContent(page(`<div style="padding:12px">${tables.map(block).join('')}</div>`));
  for (const t of tables) await (await p.$(`#${t.t}`)).screenshot({ path: path.join(OUT, 'structure_png', `${t.t}.png`) });
  await b.close();

  const csv = [['table', 'column', 'type', 'nullable', 'key', 'default', 'extra', 'generation_expression'].join(',')]
    .concat(cols.map((x) => [x.t, x.n, x.ty, x.nl, x.k, x.d, x.x, genExpr[`${x.t}.${x.n}`] || ''].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')));
  fs.writeFileSync(path.join(OUT, 'MUSE_Table_Structure.csv'), '﻿' + csv.join('\r\n') + '\r\n');
  console.log(`${tables.length} tables, ${totals.cols} columns -> MUSE_Table_Structure.pdf, .csv, structure_png/ (${tables.length} images)`);
})().catch((e) => { console.error(e.message); process.exitCode = 1; });

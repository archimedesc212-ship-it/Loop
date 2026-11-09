// Reads the FINAL schema (baseline + all migrations) from information_schema and
// writes docs/erd/schema-model.json, the single source for every ERD output.
//   node backend/scripts/erd/extract-schema.js
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { db } = require('../../src/config/env');

(async () => {
  const c = await mysql.createConnection({ host: db.host, port: db.port, user: db.ownerUser, password: db.ownerPassword, database: db.database });
  const q = async (sql, p = [db.database]) => (await c.query(sql, p))[0];
  const tables = await q(`SELECT TABLE_NAME AS name, TABLE_COMMENT AS comment FROM information_schema.TABLES
                           WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`);
  const cols = await q(`SELECT TABLE_NAME t, COLUMN_NAME c, COLUMN_TYPE type, IS_NULLABLE nullable, COLUMN_KEY k, EXTRA extra, GENERATION_EXPRESSION gen
                          FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION`);
  const idx = await q(`SELECT TABLE_NAME t, INDEX_NAME i, NON_UNIQUE nu, SEQ_IN_INDEX s, COLUMN_NAME c
                         FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`);
  const fks = await q(`SELECT k.CONSTRAINT_NAME name, k.TABLE_NAME t, k.COLUMN_NAME c, k.REFERENCED_TABLE_NAME rt, k.REFERENCED_COLUMN_NAME rc,
                              k.ORDINAL_POSITION pos, r.DELETE_RULE del, r.UPDATE_RULE upd
                         FROM information_schema.KEY_COLUMN_USAGE k
                         JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
                        WHERE k.TABLE_SCHEMA = ? AND k.REFERENCED_TABLE_NAME IS NOT NULL ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION`);
  const views = (await q(`SELECT TABLE_NAME n FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`)).map((r) => r.n);
  const mig = (await c.query('SELECT version, name FROM schema_migrations ORDER BY version'))[0];
  await c.end();

  const model = { database: db.database, generatedAt: new Date().toISOString(), migrations: mig, views, tables: {} };
  for (const t of tables) model.tables[t.name] = { name: t.name, columns: [], pk: [], uniques: [], fks: [] };
  for (const r of cols) {
    if (!model.tables[r.t]) continue;   // view columns
    model.tables[r.t].columns.push({ name: r.c, type: r.type, nullable: r.nullable === 'YES', generated: !!r.gen, autoInc: /auto_increment/.test(r.extra) });
  }
  const byIdx = {};
  for (const r of idx) { const key = `${r.t}.${r.i}`; (byIdx[key] = byIdx[key] || { t: r.t, i: r.i, unique: !r.nu, cols: [] }).cols.push(r.c); }
  for (const x of Object.values(byIdx)) {
    if (!model.tables[x.t]) continue;
    if (x.i === 'PRIMARY') model.tables[x.t].pk = x.cols;
    else if (x.unique) model.tables[x.t].uniques.push({ name: x.i, cols: x.cols });
  }
  const byFk = {};
  for (const r of fks) { const key = `${r.t}.${r.name}`; (byFk[key] = byFk[key] || { name: r.name, table: r.t, ref: r.rt, cols: [], refCols: [], onDelete: r.del, onUpdate: r.upd }); byFk[key].cols.push(r.c); byFk[key].refCols.push(r.rc); }
  for (const f of Object.values(byFk)) {
    const t = model.tables[f.table];
    f.nullable = f.cols.some((c) => t.columns.find((x) => x.name === c).nullable);
    f.inPk = f.cols.every((c) => t.pk.includes(c));
    // "one-to-one" when the FK columns are exactly the PK or a unique key of the child
    f.unique = (t.pk.length === f.cols.length && f.cols.every((c) => t.pk.includes(c)))
      || t.uniques.some((u) => u.cols.length === f.cols.length && f.cols.every((c) => u.cols.includes(c)));
    t.fks.push(f);
  }
  const out = path.resolve(__dirname, '../../../docs/erd/schema-model.json');
  fs.writeFileSync(out, JSON.stringify(model, null, 1));
  const nFk = Object.values(model.tables).reduce((n, t) => n + t.fks.length, 0);
  console.log(`tables ${tables.length}, columns ${cols.length}, foreign keys ${nFk}, views ${views.length}, migrations ${mig.map((m) => m.version).join(',')}`);
})().catch((e) => { console.error(e); process.exit(1); });

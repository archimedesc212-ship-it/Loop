// Tests the Phase 2 scripts on the running MySQL server and records the real results for the report.
//   1. runs database/phase2/MUSE_Phase2_DDL.sql and MUSE_Phase2_DML.sql (database muse_db)
//   2. compares muse_db with the application database `muse`: columns, indexes, CHECKs, foreign keys,
//      engine/collation, row counts and CHECKSUM TABLE for every table
//   3. checks every foreign key for orphan rows (the DML loads with FOREIGN_KEY_CHECKS = 0)
//   4. runs MUSE_Phase2_Constraint_Tests.sql statement by statement and records each MySQL error
//   5. drops muse_db again (pass --keep to leave it)
// Output: docs/phase2/.build/phase2-results.json. Exit code 1 on any mismatch.
//
//   node backend/scripts/test-phase2-sql.js
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { db } = require('../src/config/env');

const ROOT = path.resolve(__dirname, '../..');
const DIR = path.join(ROOT, 'database', 'phase2');
const OUT = path.join(ROOT, 'docs', 'phase2', '.build');
const A = db.database;
const B = 'muse_db';

(async () => {
  const c = await mysql.createConnection({ host: db.host, port: db.port, user: db.ownerUser, password: db.ownerPassword,
    charset: 'utf8mb4', multipleStatements: true, dateStrings: true, supportBigNumbers: true, bigNumberStrings: true });
  const q = async (sql, p = []) => (await c.query(sql, p))[0];
  const res = { server: (await q('SELECT VERSION() v'))[0].v, sqlMode: (await q('SELECT @@sql_mode m'))[0].m };

  const run = async (file) => {
    const t0 = Date.now();
    await c.query(fs.readFileSync(path.join(DIR, file), 'utf8'));
    return Date.now() - t0;
  };
  res.ddlMs = await run('MUSE_Phase2_DDL.sql');
  res.dmlMs = await run('MUSE_Phase2_DML.sql');
  res.sizes = Object.fromEntries(['MUSE_Phase2_DDL.sql', 'MUSE_Phase2_DML.sql', 'MUSE_Phase2_Verify.sql', 'MUSE_Phase2_Constraint_Tests.sql']
    .map((f) => [f, fs.statSync(path.join(DIR, f)).size]));

  const tables = (await q(`SELECT TABLE_NAME t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY 1`, [A])).map((r) => r.t);
  const diff = async (name, sql) => {
    const rows = await q(sql, [A, B]);
    const key = (r) => JSON.stringify(Object.entries(r).filter(([k]) => k !== 's'));
    const a = new Set(rows.filter((r) => r.s === A).map(key));
    const b = new Set(rows.filter((r) => r.s === B).map(key));
    const onlyA = [...a].filter((x) => !b.has(x));
    const onlyB = [...b].filter((x) => !a.has(x));
    return { name, compared: b.size, onlyInMuse: onlyA.length, onlyInMuseDb: onlyB.length, examples: [...onlyA, ...onlyB].slice(0, 5) };
  };
  const base = `TABLE_NAME IN (SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = '${A}' AND TABLE_TYPE = 'BASE TABLE')`;
  res.structure = [
    await diff('Columns (name, position, type, NULL, default, extra, generation expression, collation)',
      `SELECT TABLE_SCHEMA s, TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, GENERATION_EXPRESSION, COLLATION_NAME
         FROM information_schema.COLUMNS WHERE TABLE_SCHEMA IN (?, ?) AND ${base}`),
    await diff('Index columns (PRIMARY, UNIQUE, ordinary, FULLTEXT)',
      `SELECT TABLE_SCHEMA s, TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, SUB_PART, INDEX_TYPE, EXPRESSION
         FROM information_schema.STATISTICS WHERE TABLE_SCHEMA IN (?, ?) AND ${base}`),
    await diff('CHECK constraints (name, table, condition)',
      `SELECT tc.TABLE_SCHEMA s, tc.TABLE_NAME, tc.CONSTRAINT_NAME, cc.CHECK_CLAUSE FROM information_schema.TABLE_CONSTRAINTS tc
         JOIN information_schema.CHECK_CONSTRAINTS cc ON cc.CONSTRAINT_SCHEMA = tc.TABLE_SCHEMA AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
        WHERE tc.TABLE_SCHEMA IN (?, ?) AND tc.CONSTRAINT_TYPE = 'CHECK' AND tc.${base}`),
    await diff('Foreign keys (columns, parent, ON DELETE, ON UPDATE)',
      `SELECT k.TABLE_SCHEMA s, k.TABLE_NAME, k.CONSTRAINT_NAME, k.COLUMN_NAME, k.ORDINAL_POSITION, k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME, r.DELETE_RULE, r.UPDATE_RULE
         FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r
           ON r.CONSTRAINT_SCHEMA = k.TABLE_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND r.TABLE_NAME = k.TABLE_NAME
        WHERE k.TABLE_SCHEMA IN (?, ?)`),
    await diff('Tables (name, engine, collation)',
      `SELECT TABLE_SCHEMA s, TABLE_NAME, ENGINE, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA IN (?, ?) AND TABLE_TYPE = 'BASE TABLE'`),
  ];

  // per-table summary
  const cnt = async (sql) => Object.fromEntries((await q(sql, [B])).map((r) => [r.t, Number(r.n)]));
  const nCols = await cnt('SELECT TABLE_NAME t, COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? GROUP BY 1');
  const nGen = await cnt(`SELECT TABLE_NAME t, COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND EXTRA LIKE '%GENERATED%' AND EXTRA <> 'DEFAULT_GENERATED' GROUP BY 1`);
  const ctype = async (type) => cnt(`SELECT TABLE_NAME t, COUNT(*) n FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = ? AND CONSTRAINT_TYPE = '${type}' GROUP BY 1`);
  const nFk = await ctype('FOREIGN KEY');
  const nUq = await ctype('UNIQUE');
  const nCk = await ctype('CHECK');
  const nIx = await cnt(`SELECT TABLE_NAME t, COUNT(DISTINCT INDEX_NAME) n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? GROUP BY 1`);
  const pk = Object.fromEntries((await q(`SELECT TABLE_NAME t, GROUP_CONCAT(COLUMN_NAME ORDER BY ORDINAL_POSITION) n FROM information_schema.KEY_COLUMN_USAGE
                                           WHERE TABLE_SCHEMA = ? AND CONSTRAINT_NAME = 'PRIMARY' GROUP BY 1`, [B])).map((r) => [r.t, r.n]));
  res.tables = [];
  let rowMismatch = 0;
  let sumMismatch = 0;
  const csA = Object.fromEntries((await q(`CHECKSUM TABLE ${tables.map((t) => `\`${A}\`.\`${t}\``).join(', ')}`)).map((r) => [r.Table.split('.')[1], r.Checksum]));
  const csB = Object.fromEntries((await q(`CHECKSUM TABLE ${tables.map((t) => `\`${B}\`.\`${t}\``).join(', ')}`)).map((r) => [r.Table.split('.')[1], r.Checksum]));
  for (const t of tables) {
    const [ra] = await q(`SELECT COUNT(*) n FROM \`${A}\`.\`${t}\``);
    const [rb] = await q(`SELECT COUNT(*) n FROM \`${B}\`.\`${t}\``);
    if (Number(ra.n) !== Number(rb.n)) rowMismatch++;
    if (String(csA[t]) !== String(csB[t])) sumMismatch++;
    res.tables.push({ t, cols: nCols[t] || 0, gen: nGen[t] || 0, pk: pk[t], fk: nFk[t] || 0, uq: nUq[t] || 0, ck: nCk[t] || 0, ix: nIx[t] || 0,
      rows: Number(rb.n), rowsMuse: Number(ra.n), checksumMatch: String(csA[t]) === String(csB[t]) });
  }
  res.rowMismatch = rowMismatch;
  res.checksumMismatch = sumMismatch;
  res.totals = Object.fromEntries((await q(`SELECT CONSTRAINT_TYPE t, COUNT(*) n FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = ? GROUP BY 1`, [B])).map((r) => [r.t, Number(r.n)]));
  res.fkRules = (await q(`SELECT DELETE_RULE d, UPDATE_RULE u, COUNT(*) n FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ? GROUP BY 1, 2 ORDER BY 3 DESC`, [B]));
  res.indexes = Number((await q(`SELECT COUNT(DISTINCT TABLE_NAME, INDEX_NAME) n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ?`, [B]))[0].n);
  res.indexTypes = await q(`SELECT IF(INDEX_NAME = 'PRIMARY', 'PRIMARY', IF(INDEX_TYPE = 'FULLTEXT', 'FULLTEXT', IF(NON_UNIQUE = 0, 'UNIQUE', 'ordinary'))) k, COUNT(DISTINCT TABLE_NAME, INDEX_NAME) n
                              FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? GROUP BY 1 ORDER BY 2 DESC`, [B]);
  res.checks = await q(`SELECT tc.TABLE_NAME t, tc.CONSTRAINT_NAME name, cc.CHECK_CLAUSE clause FROM information_schema.TABLE_CONSTRAINTS tc
                          JOIN information_schema.CHECK_CONSTRAINTS cc ON cc.CONSTRAINT_SCHEMA = tc.TABLE_SCHEMA AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
                         WHERE tc.TABLE_SCHEMA = ? AND tc.CONSTRAINT_TYPE = 'CHECK' ORDER BY 1, 2`, [B]);
  res.fks = await q(`SELECT k.TABLE_NAME t, k.CONSTRAINT_NAME name, GROUP_CONCAT(k.COLUMN_NAME ORDER BY k.ORDINAL_POSITION) cols, k.REFERENCED_TABLE_NAME p,
                            GROUP_CONCAT(k.REFERENCED_COLUMN_NAME ORDER BY k.ORDINAL_POSITION) pcols, r.DELETE_RULE d, r.UPDATE_RULE u
                       FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r
                         ON r.CONSTRAINT_SCHEMA = k.TABLE_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND r.TABLE_NAME = k.TABLE_NAME
                      WHERE k.TABLE_SCHEMA = ? GROUP BY 1, 2, 4, 6, 7 ORDER BY 1, 2`, [B]);

  // orphans
  let orphanRows = 0;
  for (const f of res.fks) {
    const cols = f.cols.split(',');
    const pcols = f.pcols.split(',');
    const [r] = await q(`SELECT COUNT(*) n FROM \`${B}\`.\`${f.t}\` x WHERE ${cols.map((x) => `x.\`${x}\` IS NOT NULL`).join(' AND ')}
                          AND NOT EXISTS (SELECT 1 FROM \`${B}\`.\`${f.p}\` p WHERE ${cols.map((x, i) => `p.\`${pcols[i]}\` = x.\`${x}\``).join(' AND ')})`);
    orphanRows += Number(r.n);
  }
  res.orphanRows = orphanRows;
  res.fkChecked = res.fks.length;

  // constraint tests
  await c.query(`USE ${B}`);
  const stmts = fs.readFileSync(path.join(DIR, 'MUSE_Phase2_Constraint_Tests.sql'), 'utf8').split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
  res.tests = [];
  let cur = null;
  for (const s of stmts) {
    const m = s.match(/^SELECT '(T\d+b?) ([^']*)' AS test$/);
    if (m) { cur = { id: m[1], title: m[2], steps: [] }; res.tests.push(cur); continue; }
    if (/^USE /.test(s)) continue;
    try {
      const [rows] = await c.query(s);
      cur.steps.push({ sql: s, ok: true, rows: Array.isArray(rows) ? rows : null, affected: rows && rows.affectedRows });
    } catch (e) {
      cur.steps.push({ sql: s, ok: false, code: e.errno, state: e.sqlState, message: e.sqlMessage });
    }
  }
  const after = Object.fromEntries((await q(`CHECKSUM TABLE ${tables.map((t) => `\`${B}\`.\`${t}\``).join(', ')}`)).map((r) => [r.Table.split('.')[1], r.Checksum]));
  res.unchangedAfterTests = tables.every((t) => String(after[t]) === String(csA[t]));

  // a few sample rows for the report
  const sample = async (sql) => q(sql);
  res.samples = {
    users: await sample(`SELECT u.user_id, u.username, u.email, r.name AS role, p.display_name, u.is_active, u.created_at FROM users u JOIN roles r ON r.role_id = u.role_id
                           LEFT JOIN user_profiles p ON p.user_id = u.user_id ORDER BY u.user_id LIMIT 6`),
    songs: await sample(`SELECT s.song_id, s.title, a.name AS artist, al.title AS album, s.duration_sec, l.name AS language, s.release_year FROM songs s
                           JOIN artists a ON a.artist_id = s.primary_artist_id LEFT JOIN albums al ON al.album_id = s.album_id
                           LEFT JOIN languages l ON l.language_id = s.language_id ORDER BY s.song_id LIMIT 8`),
    moods: await sample(`SELECT m.mood_id, m.name, c.name AS category, m.color_hex, m.target_energy, m.target_valence, m.tempo_min, m.tempo_max FROM moods m
                           JOIN mood_categories c ON c.category_id = m.category_id ORDER BY m.mood_id LIMIT 8`),
    song_moods: await sample(`SELECT s.title AS song, m.name AS mood, CONCAT(im.name, ' ', im.version) AS model, sm.confidence FROM song_moods sm JOIN songs s ON s.song_id = sm.song_id
                                JOIN moods m ON m.mood_id = sm.mood_id JOIN intelligence_models im ON im.model_id = sm.model_id AND im.is_active = 1 ORDER BY sm.song_id, sm.confidence DESC LIMIT 8`),
    listening_history: await sample(`SELECT lh.play_id, u.username, s.title AS song, lh.origin, lh.started_at, lh.listened_sec, lh.completion_pct, lh.completed, lh.skipped
                                       FROM listening_history lh JOIN users u ON u.user_id = lh.user_id JOIN songs s ON s.song_id = lh.song_id ORDER BY lh.play_id LIMIT 8`),
    playlists: await sample(`SELECT p.playlist_id, p.name, u.username AS owner, COUNT(ps.song_id) AS songs FROM playlists p JOIN users u ON u.user_id = p.user_id
                               LEFT JOIN playlist_songs ps ON ps.playlist_id = p.playlist_id GROUP BY p.playlist_id, p.name, u.username ORDER BY p.playlist_id`),
  };
  if (!process.argv.includes('--keep')) await c.query(`DROP DATABASE ${B}`);
  await c.end();

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'phase2-results.json'), JSON.stringify(res, null, 1));
  const structBad = res.structure.reduce((s, x) => s + x.onlyInMuse + x.onlyInMuseDb, 0);
  const expectedErr = res.tests.filter((t) => t.steps.some((s) => !s.ok)).length;
  console.log(`server ${res.server}; DDL ${res.ddlMs} ms, DML ${res.dmlMs} ms`);
  res.structure.forEach((x) => console.log(`  ${x.name}: ${x.compared} compared, ${x.onlyInMuse + x.onlyInMuseDb} differences`));
  console.log(`  rows: ${res.tables.reduce((s, x) => s + x.rows, 0)} in ${tables.length} tables, ${rowMismatch} count mismatches, ${sumMismatch} checksum mismatches`);
  console.log(`  orphans: ${orphanRows} across ${res.fkChecked} foreign keys`);
  console.log(`  constraint tests: ${res.tests.length} groups, ${expectedErr} rejected by MySQL; data unchanged afterwards: ${res.unchangedAfterTests}`);
  if (structBad || rowMismatch || sumMismatch || orphanRows || !res.unchangedAfterTests) process.exitCode = 1;
})().catch((e) => { console.error(e.message); process.exitCode = 1; });

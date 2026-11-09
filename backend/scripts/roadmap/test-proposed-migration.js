// Tests PROPOSED migrations (database/migrations/proposed/) on DISPOSABLE schemas only.
//
// For each migration (cases-NNNN.js):
//   A. baseline       build muse_roadmap_check from database/phase2 DDL + DML (64 tables, migration 0004);
//                     every object the file creates must be absent from the baseline (no name collisions)
//   B. fresh install  apply through the REAL runner (backend/scripts/migrate.js, temporary folder holding
//                     only this file) with placeholders substituted by backend/scripts/placeholders.js and
//                     GRANTs executed for a temporary application account; checksum recorded
//   C. data           every value of every existing row is unchanged (hash over the baseline columns);
//                     only the listed baseline objects may change; helper procedures are gone
//   D. re-run         applied again statement by statement, then again through the runner: identical schema
//   E. behaviour      constraint / trigger / view / function tests (in a transaction, rolled back)
//   F. atomicity      cases that must run with autocommit
//   G. grants         checked by connecting as the temporary application account
//   H. partial states each state on a new baseline, then the full migration: must equal the fresh install
//   I. interrupted    first N statements, "crash", then the full migration: must equal the fresh install
//   J. drift          a pre-existing table with a different shape must stop the migration with an error
//   K. placeholders   unsafe database / user / host values are refused for this file
// The application databases are never touched (lib.buildScratch refuses their names).
//
//   node backend/scripts/roadmap/test-proposed-migration.js            all proposed migrations
//   node backend/scripts/roadmap/test-proposed-migration.js 0005       one migration
// Reports: docs/roadmap/.build/proposed-migration-tests.json and docs/roadmap/MIGRATION_TEST_REPORT.md
// Developed by Vaishnav Sai.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const { db } = require('../../src/config/env');
const { migrate } = require('../migrate');
const { makeTransform } = require('../placeholders');
const L = require('./lib');

const SCRATCH = 'muse_roadmap_check';
const APP_USER = 'muse_rc_app';
const APP_HOST = 'localhost';
const OUT = path.join(L.ROOT, 'docs', 'roadmap', '.build');
const ALL = ['0005', '0006'].filter((v) => fs.existsSync(path.join(__dirname, `cases-${v}.js`)));

async function testMigration(c, cases, report) {
  const results = [];
  const section = (s) => { console.log(`\n== ${cases.version} · ${s}`); results.push({ section: s }); };
  const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${String(detail).slice(0, 300)}` : ''}`); };
  const q = async (sql, p) => (await c.query(sql, p))[0];
  const expectError = async (name, sql, params, code) => {
    try { await q(sql, params); check(name, false, 'statement was accepted'); }
    catch (e) { check(name, !code || e.errno === code || e.sqlState === code, `${e.errno}: ${e.sqlMessage}`); }
  };
  const text = fs.readFileSync(path.join(L.ROOT, cases.file), 'utf8');
  const appPassword = crypto.randomBytes(18).toString('base64url');
  const transform = makeTransform({ database: SCRATCH, appUser: APP_USER, appHost: APP_HOST }, (v) => c.escape(v));
  const stmts = L.statements(transform(text));
  const runAll = async (list = stmts) => { for (const s of list) await c.query(s); };
  const tmpDir = path.join(OUT, `runner-${cases.version}`);
  // fresh baseline, plus any proposed migrations this one builds on (applied through the real runner)
  const prepare = async () => {
    await L.buildScratch(c, SCRATCH);
    for (const v of cases.requires || []) {
      const dep = require(`./cases-${v}.js`);
      const depDir = path.join(OUT, `runner-dep-${v}`);
      fs.rmSync(depDir, { recursive: true, force: true });
      fs.mkdirSync(depDir, { recursive: true });
      fs.copyFileSync(path.join(L.ROOT, dep.file), path.join(depDir, path.basename(dep.file)));
      const depText = fs.readFileSync(path.join(L.ROOT, dep.file), 'utf8');
      // grants of the prerequisite are not needed for these tests
      fs.writeFileSync(path.join(depDir, path.basename(dep.file)), depText.split('\n').filter((l) => !/^GRANT\s/i.test(l)).join('\n'));
      await migrate(c, { dir: depDir, transform, log: () => {} });
      fs.rmSync(depDir, { recursive: true, force: true });
    }
  };

  try {
    // ---------------------------------------------------------------- A
    section('A. baseline and name collisions');
    await prepare();
    const fpBase = await L.fingerprint(c, SCRATCH);
    const base = L.names(fpBase);
    const dataBase = await L.dataHashes(c, SCRATCH);
    check(`starting point has ${cases.baseTables || 64} tables${cases.requires ? ` (baseline + ${cases.requires.join(', ')})` : ''}`, base.tables.length === (cases.baseTables || 64), `${base.tables.length}`);
    const declared = L.declaredObjects(text);
    for (const kind of Object.keys(declared)) {
      const clash = declared[kind].filter((n) => base[kind].includes(n));
      check(`no ${kind} declared by the file already exist in the baseline`, clash.length === 0, clash.length ? clash.join(', ') : `${declared[kind].length} checked`);
    }
    const dupes = Object.values(declared).flat().filter((n, i, a) => a.indexOf(n) !== i);
    check('no object name is declared twice in the file', dupes.length === 0, dupes.join(', '));

    // ---------------------------------------------------------------- B
    section('B. fresh install through the real migration runner (with grants)');
    await c.query(`DROP USER IF EXISTS '${APP_USER}'@'${APP_HOST}'`);
    await c.query(`CREATE USER '${APP_USER}'@'${APP_HOST}' IDENTIFIED BY ?`, [appPassword]);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.copyFileSync(path.join(L.ROOT, cases.file), path.join(tmpDir, path.basename(cases.file)));
    const t0 = Date.now();
    const n = await migrate(c, { dir: tmpDir, transform, log: () => {} });
    check('runner applied the migration', n === 1, `${Date.now() - t0} ms`);
    const rec = await q('SELECT version, checksum FROM schema_migrations WHERE version = ?', [cases.version]);
    const sha = crypto.createHash('sha256').update(text).digest('hex');
    check('runner recorded the version with the file checksum', rec.length === 1 && rec[0].checksum === sha);
    const fpFresh = await L.fingerprint(c, SCRATCH);
    const fresh = L.names(fpFresh);
    check(`${cases.newTables} new base tables`, fresh.tables.length - base.tables.length === cases.newTables, `${base.tables.length} -> ${fresh.tables.length}`);
    const newRoutines = fresh.routines.filter((r) => !base.routines.includes(r));
    check('only the intended routines remain (helper procedures dropped)', JSON.stringify(newRoutines.sort()) === JSON.stringify([...cases.newRoutines].sort()), newRoutines.join(', '));
    const grantLines = stmts.filter((s) => /^GRANT\s/i.test(s)).length;
    const shown = (await q(`SHOW GRANTS FOR '${APP_USER}'@'${APP_HOST}'`)).map((r) => Object.values(r)[0]).filter((g) => g.includes(`\`${SCRATCH}\``));
    check('every GRANT reached the temporary application account on the scratch schema only', shown.length === grantLines, `${shown.length} of ${grantLines}`);

    // ---------------------------------------------------------------- C
    section('C. existing data and unrelated objects');
    const dataAfter = await L.dataHashes(c, SCRATCH, dataBase.cols);
    const changed = Object.keys(dataBase.hashes).filter((t) => t !== 'schema_migrations' && dataBase.hashes[t] !== dataAfter.hashes[t]);
    check('every value in every existing row is unchanged (all pre-existing tables, pre-existing columns)', changed.length === 0, changed.join(', ') || `${Object.keys(dataBase.hashes).length - 1} tables hashed`);
    const removed = L.diff(fpBase, fpFresh).filter((d) => d.includes('only in first'));
    const allowed = (d) => cases.changedBaselineObjects.some((o) => { const [k, ref] = o.split(':'); const [t, col] = ref.split('.'); return d.startsWith(`${k} only in first`) && d.includes(`"t":"${t}"`) && d.includes(`"c":"${col}"`); });
    const unexpected = removed.filter((d) => !allowed(d));
    check('no baseline object was dropped or altered except the listed ones', unexpected.length === 0, unexpected.slice(0, 3).join(' | ') || `changed: ${cases.changedBaselineObjects.join(', ')}`);

    // ---------------------------------------------------------------- D
    section('D. re-run');
    await runAll();
    const d1 = L.diff(fpFresh, await L.fingerprint(c, SCRATCH));
    check('second run (statement by statement, grants included) leaves the schema identical', d1.length === 0, d1.slice(0, 3).join(' | '));
    await q('DELETE FROM schema_migrations WHERE version = ?', [cases.version]);
    await migrate(c, { dir: tmpDir, transform, log: () => {} });
    const d2 = L.diff(fpFresh, await L.fingerprint(c, SCRATCH));
    check('third run through the runner leaves the schema identical', d2.length === 0, d2.slice(0, 3).join(' | '));
    const dataRerun = await L.dataHashes(c, SCRATCH, dataBase.cols);
    const changed2 = Object.keys(dataBase.hashes).filter((t) => t !== 'schema_migrations' && dataBase.hashes[t] !== dataRerun.hashes[t]);
    check('re-runs did not change existing data', changed2.length === 0, changed2.join(', '));

    // ---------------------------------------------------------------- E
    section('E. behaviour (rolled back)');
    await c.query('START TRANSACTION');
    try { await cases.behaviour({ q, check, expectError }); }
    finally { await c.query('ROLLBACK'); }
    const dataRb = await L.dataHashes(c, SCRATCH, dataBase.cols);
    check('behaviour tests rolled back: existing data identical to the baseline',
      Object.keys(dataBase.hashes).every((t) => t === 'schema_migrations' || dataBase.hashes[t] === dataRb.hashes[t]));

    if (cases.atomicity) { section('F. atomicity (autocommit)'); await cases.atomicity({ q, check, expectError }); }

    if (cases.grants) {
      section('G. grants, as the application account');
      const app = await mysql.createConnection({ host: db.host, port: db.port, user: APP_USER, password: appPassword, database: SCRATCH });
      try { await cases.grants({ asApp: async (sql) => (await app.query(sql))[0], check }); }
      finally { await app.end(); }
    }

    // ---------------------------------------------------------------- H
    section('H. partial migration states');
    for (const st of cases.partialStates) {
      await prepare();
      for (const s of st.sql) await c.query(s);
      try {
        await runAll();
        const d = L.diff(fpFresh, await L.fingerprint(c, SCRATCH)).filter((x) => !x.startsWith('tables only') || !x.includes('schema_migrations'));
        check(`completes from: ${st.name}`, d.length === 0, d.slice(0, 3).join(' | '));
        if (st.after) await st.after({ q, check });
      } catch (e) { check(`completes from: ${st.name}`, false, e.sqlMessage || e.message); }
    }
    if (cases.enumPreserve) {
      const st = cases.enumPreserve;
      await prepare();
      for (const s of st.sql) await c.query(s);
      await runAll();
      const col = (await q('SELECT COLUMN_TYPE t, IS_NULLABLE nl, COLUMN_DEFAULT d FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?', [SCRATCH, st.expect.table, st.expect.column]))[0];
      check(st.name, col.t === st.expect.type && col.nl === st.expect.nullable && col.d === st.expect.default, JSON.stringify(col));
    }

    // ---------------------------------------------------------------- I
    section('I. interrupted runs');
    const cuts = [...new Set([1, 3, 5, 8, 12, 18, 25, 32, 40, 50, 60, stmts.length - 5, stmts.length - 1].filter((k) => k > 0 && k < stmts.length))];
    for (const k of cuts) {
      await prepare();
      try {
        await runAll(stmts.slice(0, k));
        await runAll();
        const d = L.diff(fpFresh, await L.fingerprint(c, SCRATCH));
        check(`stopped after statement ${k} of ${stmts.length}, then re-run: same as fresh install`, d.length === 0, d.slice(0, 3).join(' | '));
      } catch (e) { check(`stopped after statement ${k} of ${stmts.length}, then re-run`, false, e.sqlMessage || e.message); }
    }

    // ---------------------------------------------------------------- J
    section('J. table drift is detected');
    for (const st of cases.driftStates || []) {
      await prepare();
      for (const s of st.sql) await c.query(s);
      try { await runAll(); check(`stops with an error when ${st.name}`, false, 'migration completed silently'); }
      catch (e) { check(`stops with an error when ${st.name}`, st.error.test(e.sqlMessage || e.message), e.sqlMessage || e.message); }
    }

    // ---------------------------------------------------------------- K
    section('K. placeholder substitution');
    check('no unsubstituted __NAME__ placeholder is left', !/__[A-Z][A-Z_]*__/.test(transform(text)));
    for (const [label, cfg] of [
      ['database name with a backtick and a second statement', { database: 'muse`; DROP DATABASE muse; --', appUser: APP_USER, appHost: APP_HOST }],
      ['user name with a quote', { database: SCRATCH, appUser: "app' OR '1", appHost: APP_HOST }],
      ['host with a space', { database: SCRATCH, appUser: APP_USER, appHost: 'local host' }],
      ['empty database name', { database: '', appUser: APP_USER, appHost: APP_HOST }],
    ]) {
      try { makeTransform(cfg, (v) => c.escape(v))(text); check(`refuses ${label}`, false, 'accepted'); }
      catch (e) { check(`refuses ${label}`, /Refusing/.test(e.message), e.message.slice(0, 90)); }
    }
  } catch (e) {
    check('unexpected error', false, e.sqlMessage || e.stack || e.message);
  } finally {
    await L.dropScratch(c, SCRATCH);
    await c.query(`DROP USER IF EXISTS '${APP_USER}'@'${APP_HOST}'`);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  report.push({ version: cases.version, file: cases.file, statements: stmts.length, results });
  return results.filter((r) => r.name && !r.ok).length;
}

function markdown(report, server) {
  const lines = ['# Proposed migration test report', '',
    `Generated by \`backend/scripts/roadmap/test-proposed-migration.js\` on ${new Date().toISOString().slice(0, 10)} against MySQL ${server}.`,
    'Every test ran on the disposable schema `muse_roadmap_check`, which is created from the submitted Phase 2 DDL + DML and dropped afterwards.',
    'The application database was not modified; the proposed migrations remain unapplied.', '',
    '*Developed by Vaishnav Sai.*', ''];
  for (const m of report) {
    const tests = m.results.filter((r) => r.name);
    const failed = tests.filter((r) => !r.ok);
    lines.push(`## ${m.version} — \`${m.file}\``, '', `${tests.length - failed.length} of ${tests.length} checks passed · ${m.statements} statements.`, '');
    for (const r of m.results) {
      if (r.section) { lines.push('', `### ${r.section}`, '', '| Result | Check | Detail |', '|---|---|---|'); continue; }
      lines.push(`| ${r.ok ? 'PASS' : '**FAIL**'} | ${r.name.replace(/\|/g, '\\|')} | ${String(r.detail || '').slice(0, 160).replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`);
    }
    lines.push('');
  }
  const mut = path.join(OUT, 'mutation-check.txt');
  if (fs.existsSync(mut)) {
    lines.push('## Mutation check', '', `Output of \`backend/scripts/roadmap/mutation-check.js\` (last run ${fs.statSync(mut).mtime.toISOString().slice(0, 10)}): each line is a deliberately broken copy of a migration and the first test that failed because of it.`, '',
      '```', fs.readFileSync(mut, 'utf8').trim(), '```', '');
  }
  return lines.join('\n');
}

(async () => {
  const only = process.argv[2];
  const versions = only ? [only] : ALL;
  const c = await L.connect();
  const server = (await c.query('SELECT VERSION() v'))[0][0].v;
  const report = [];
  let failed = 0;
  try {
    for (const v of versions) failed += await testMigration(c, require(`./cases-${v}.js`), report);
  } finally { await c.end(); }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, only ? `proposed-migration-tests-${only}.json` : 'proposed-migration-tests.json'), JSON.stringify({ when: new Date().toISOString(), server, report }, null, 1));
  if (!only) fs.writeFileSync(path.join(L.ROOT, 'docs', 'roadmap', 'MIGRATION_TEST_REPORT.md'), markdown(report, server));
  const total = report.reduce((s, m) => s + m.results.filter((r) => r.name).length, 0);
  console.log(`\n${total - failed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
})();

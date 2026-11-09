// Database verification in a separate, throw-away database (<DB_NAME>_verify).
// It never touches the main database's data.
//
//   npm run db:verify
//
//  1. Upgrade path: build the frozen baseline + seed only (what an existing 1.0
//     install has), then apply `db:migrate`. The resulting structure (columns,
//     indexes, constraints, views, routines, triggers, grants) must equal the
//     main database built by `db:setup`.
//  2. Re-running `db:migrate` is a no-op.
//  3. Empty catalogue: remove every song, artist, album, film, play and user
//     (reference data such as roles, moods and languages stays) and run
//     tests/empty/*.test.js against it: new users, onboarding, recommendations,
//     search, worlds and readiness must all behave without data.
const { execFileSync } = require('child_process');
const path = require('path');
const mysql = require('mysql2/promise');
const { db } = require('../src/config/env');

const VERIFY = `${db.database}_verify`;
// A separate application account: 06_security.sql recreates its account, which
// would otherwise drop the main database's grants.
const VERIFY_APP = `${db.appUser}_verify`.slice(0, 32);
const ROOT = path.resolve(__dirname, '..');
const env = { ...process.env, DB_NAME: VERIFY, DB_APP_USER: VERIFY_APP };
const run = (args, extra = {}) => execFileSync(process.execPath, args, { cwd: ROOT, env: { ...env, ...extra }, stdio: 'pipe', encoding: 'utf8' });

// Reference data an empty install still needs (all other tables are emptied).
const KEEP = new Set(['roles', 'permissions', 'role_permissions', 'languages', 'regions', 'genres', 'moods', 'mood_categories',
  'mood_keywords', 'contexts', 'context_keywords', 'context_moods', 'intelligence_models', 'model_parameters', 'world_archetypes',
  'archetype_moods', 'music_sources', 'schema_migrations', 'reason_types']);

async function structure(conn, schema, appUser) {
  // only the quoted schema name is replaced (`muse`), never names that contain it (v_muse_world_summary)
  const q = async (sql) => (await conn.query(sql, [schema]))[0].map((r) => JSON.stringify(r).replaceAll(`\`${schema}\``, '`<db>`'));
  return {
    columns: await q(`SELECT TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, GENERATION_EXPRESSION
                        FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION`),
    indexes: await q(`SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, INDEX_TYPE
                        FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`),
    constraints: await q(`SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE FROM information_schema.TABLE_CONSTRAINTS
                            WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, CONSTRAINT_NAME`),
    checks: await q(`SELECT CONSTRAINT_NAME, CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ? ORDER BY CONSTRAINT_NAME`),
    foreignKeys: await q(`SELECT CONSTRAINT_NAME, TABLE_NAME, REFERENCED_TABLE_NAME, UPDATE_RULE, DELETE_RULE
                            FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ? ORDER BY CONSTRAINT_NAME`),
    views: await q(`SELECT TABLE_NAME, VIEW_DEFINITION, COLLATION_CONNECTION FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`),
    routines: await q(`SELECT ROUTINE_NAME, ROUTINE_TYPE, ROUTINE_DEFINITION, COLLATION_CONNECTION FROM information_schema.ROUTINES
                         WHERE ROUTINE_SCHEMA = ? ORDER BY ROUTINE_NAME`),
    triggers: await q(`SELECT TRIGGER_NAME, EVENT_MANIPULATION, EVENT_OBJECT_TABLE, ACTION_TIMING, ACTION_STATEMENT, COLLATION_CONNECTION
                         FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ? ORDER BY TRIGGER_NAME`),
    grants: await q(`SELECT TABLE_NAME, PRIVILEGE_TYPE FROM information_schema.TABLE_PRIVILEGES
                       WHERE TABLE_SCHEMA = ? AND GRANTEE = '''${appUser}''@''${db.appHost}''' ORDER BY TABLE_NAME, PRIVILEGE_TYPE`),
  };
}

function diff(a, b) {
  const out = [];
  for (const k of Object.keys(a)) {
    const sa = new Set(a[k]); const sb = new Set(b[k]);
    const onlyA = a[k].filter((x) => !sb.has(x)); const onlyB = b[k].filter((x) => !sa.has(x));
    if (onlyA.length || onlyB.length) out.push({ part: k, onlyInFreshInstall: onlyA.slice(0, 5), onlyInUpgraded: onlyB.slice(0, 5) });
  }
  return out;
}

(async () => {
  const conn = await mysql.createConnection({ host: db.host, port: db.port, user: db.ownerUser, password: db.ownerPassword, charset: 'utf8mb4' });
  let failed = false;
  const step = (ok, msg) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) failed = true; };
  try {
    if (!/^[A-Za-z0-9_]+$/.test(VERIFY_APP)) throw new Error('DB_APP_USER has invalid characters');
    console.log(`Verifying in throw-away database "${VERIFY}" with account "${VERIFY_APP}" (the main database "${db.database}" is only read)\n`);

    // 1. upgrade path
    run(['scripts/setup-db.js', '--baseline-only']);
    const before = await conn.query(`SELECT COUNT(*) AS n FROM \`${VERIFY}\`.schema_migrations`);
    step(before[0][0].n === 1, 'baseline 1.0 + seed built (schema version 0000)');
    const out = run(['scripts/migrate.js']);
    step(/Applied \d+ migration/.test(out), `db:migrate applied: ${out.trim().split('\n').pop()}`);
    const d = diff(await structure(conn, db.database, db.appUser), await structure(conn, VERIFY, VERIFY_APP));
    step(d.length === 0, d.length ? `upgraded structure differs from a fresh install:\n${JSON.stringify(d, null, 2)}` : 'upgraded database is structurally identical to a fresh install (columns, indexes, constraints, views, routines, triggers, grants)');
    const again = run(['scripts/migrate.js']);
    step(/up to date/.test(again), 're-running db:migrate is a no-op');
    const st = run(['scripts/migrate.js', 'status']);
    step(!/PROBLEM|pending/.test(st), 'migration status: no pending migrations, no checksum problems');

    // 3. empty catalogue
    const [tables] = await conn.query(`SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`, [VERIFY]);
    await conn.query(`USE \`${VERIFY}\``);
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const { t } of tables) if (!KEEP.has(t) && /^[a-z_]+$/.test(t)) await conn.query(`TRUNCATE TABLE \`${t}\``);
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    const [[c]] = await conn.query('SELECT (SELECT COUNT(*) FROM songs) s, (SELECT COUNT(*) FROM users) u, (SELECT COUNT(*) FROM moods) m');
    step(c.s === 0 && c.u === 0 && c.m > 0, `catalogue emptied (songs ${c.s}, users ${c.u}; reference moods kept: ${c.m})`);
    try {
      const t = run(['--test', '--test-concurrency=1', 'tests/empty/*.test.js'], { NODE_ENV: 'test', JOBS_ENABLED: 'false' });
      const pass = (t.match(/# pass (\d+)/) || [])[1]; const fail = (t.match(/# fail (\d+)/) || [])[1];
      step(fail === '0', `empty-catalogue tests: ${pass} passed, ${fail} failed`);
    } catch (err) {
      console.log(err.stdout);
      step(false, 'empty-catalogue tests failed');
    }
  } catch (err) {
    console.error(err.stdout || '', err.stderr || '', err.message);
    failed = true;
  } finally {
    if (!process.argv.includes('--keep')) {
      await conn.query(`DROP DATABASE IF EXISTS \`${VERIFY}\``);
      await conn.query('DROP USER IF EXISTS ?@?', [VERIFY_APP, db.appHost]);
    }
    await conn.end();
  }
  console.log(failed ? '\nDatabase verification FAILED' : '\nDatabase verification passed');
  process.exitCode = failed ? 1 : 0;
})();

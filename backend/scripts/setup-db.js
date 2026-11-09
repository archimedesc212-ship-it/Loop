// Creates (or recreates) the MUSE database, loads every SQL file in order,
// creates the least-privilege application account and builds the first
// trend snapshot and MUSE Worlds through the real pipeline code.
//   npm run db:setup                    drop + recreate everything (baseline + seed + migrations)
//   npm run db:setup -- --no-intel      skip the first intelligence run
//   npm run db:setup -- --baseline-only build the frozen baseline + seed only, no migrations
//                                       (used to prove that `db:migrate` upgrades an existing database)
const path = require('path');
const mysql = require('mysql2/promise');
const { db } = require('../src/config/env');
const { runSqlFile } = require('./sql-runner');
const migrations = require('./migrate');
const { makeTransform } = require('./placeholders');

const DB_DIR = path.resolve(__dirname, '../../database');
const BASELINE = ['01_schema.sql', '02_functions.sql', '03_views.sql', '04_procedures.sql', '05_triggers.sql', '06_security.sql'];
const SEED = '07_seed.sql';

const ident = (s, what) => {
  if (!/^[A-Za-z0-9_]+$/.test(s)) throw new Error(`${what} may only contain letters, digits and _`);
  return s;
};

(async () => {
  let conn;
  try {
    if (!db.ownerUser) throw new Error('DB_OWNER_USER is not set in .env');
    ident(db.database, 'DB_NAME'); ident(db.appUser, 'DB_APP_USER');
    if (!/^[A-Za-z0-9_.%-]+$/.test(db.appHost)) throw new Error('DB_APP_HOST has invalid characters');

    conn = await mysql.createConnection({
      host: db.host, port: db.port, user: db.ownerUser, password: db.ownerPassword, multipleStatements: true, charset: 'utf8mb4',
    });
    await conn.query('SET time_zone = ?', [db.timezone]);   // seed dates follow the same day boundaries as the API
    const [[{ v }]] = await conn.query('SELECT VERSION() AS v');
    console.log(`Connected to MySQL ${v} at ${db.host}:${db.port} as ${db.ownerUser}`);
    const [maj, min, patch] = v.split(/[.-]/).map(Number);
    if (maj < 8 || (maj === 8 && min === 0 && patch < 19)) throw new Error('MySQL 8.0.19 or newer is required');

    await conn.query(`DROP DATABASE IF EXISTS \`${db.database}\``);
    await conn.query(`CREATE DATABASE \`${db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    await conn.query(`USE \`${db.database}\``);

    const transform = makeTransform(db, (v) => conn.escape(v));   // validated identifiers, escaped password

    const load = async (f) => {
      const t = Date.now();
      const n = await runSqlFile(conn, path.join(DB_DIR, f), transform);
      console.log(`  ✓ ${f.padEnd(18)} ${String(n).padStart(3)} batch(es)  ${String(Date.now() - t).padStart(5)} ms`);
    };
    // baseline schema → demo seed (written for the baseline) → migrations.
    // A fresh install therefore follows exactly the path an existing database takes with `db:migrate`.
    for (const f of BASELINE) await load(f);
    await migrations.markBaseline(conn);
    await load(SEED);
    if (!process.argv.includes('--baseline-only')) await migrations.migrate(conn, { transform });
    const st = await migrations.status(conn);
    console.log(`  schema version ${st.applied[st.applied.length - 1].version}${st.pending.length ? ` (${st.pending.length} migration(s) pending)` : ''}`);

    const [counts] = await conn.query(`
      SELECT 'users' t, COUNT(*) n FROM users UNION ALL SELECT 'artists', COUNT(*) FROM artists
      UNION ALL SELECT 'albums', COUNT(*) FROM albums UNION ALL SELECT 'songs', COUNT(*) FROM songs
      UNION ALL SELECT 'audio_features (all versions)', COUNT(*) FROM audio_features
      UNION ALL SELECT 'song_moods (all versions)', COUNT(*) FROM song_moods
      UNION ALL SELECT 'mood_segments', COUNT(*) FROM mood_segments
      UNION ALL SELECT 'listening_sessions', COUNT(*) FROM listening_sessions
      UNION ALL SELECT 'listening_history', COUNT(*) FROM listening_history
      UNION ALL SELECT 'playback_events', COUNT(*) FROM playback_events
      UNION ALL SELECT 'ratings', COUNT(*) FROM ratings
      UNION ALL SELECT 'user_genre_preferences', COUNT(*) FROM user_genre_preferences
      UNION ALL SELECT 'source_records', COUNT(*) FROM source_records`);
    console.log('\nRow counts:');
    counts.forEach((r) => console.log(`  ${r.t.padEnd(32)} ${r.n}`));
    await conn.end();
    conn = null;

    if (!process.argv.includes('--no-intel') && !process.argv.includes('--baseline-only')) {   // app code expects the latest schema
      console.log('\nRunning the first weekly intelligence pipeline (trends + MUSE Worlds)...');
      const pipeline = require('../src/services/pipeline/pipelineService');
      const { pool } = require('../src/config/db');
      const result = await pipeline.runWeeklyIntelligence({ requestedBy: null, skipIngest: true, reason: 'setup' });
      console.log(`  ✓ job ${result.jobId}: ${result.summary}`);
      await pool.end();
    }
    console.log(`\nDatabase "${db.database}" is ready. The API connects as "${db.appUser}" (least privilege).`);
  } catch (err) {
    console.error('\nDatabase setup failed:', err.sqlMessage || err.message);
    if (err.code === 'ER_ACCESS_DENIED_ERROR') console.error('Check DB_OWNER_USER / DB_OWNER_PASSWORD in .env');
    if (err.code === 'ECONNREFUSED') console.error('Is MySQL running on DB_HOST:DB_PORT?');
    if (/log_bin_trust_function_creators|SUPER privilege/i.test(err.message || '')) {
      console.error('Run once as root:  SET PERSIST log_bin_trust_function_creators = 1;');
    }
    process.exitCode = 1;
  } finally {
    if (conn) await conn.end();
  }
})();

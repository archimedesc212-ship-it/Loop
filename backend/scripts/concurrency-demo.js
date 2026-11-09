// Concurrency / isolation experiments on the real MUSE tables, using two
// independent connections that interleave step by step.   npm run demo:concurrency
//
//  1. LOST UPDATE: two requests finish a play in the same listening session
//     and both do read-modify-write on its counters. Then two fixes:
//     pessimistic locking (SELECT … FOR UPDATE) and an atomic UPDATE.
//  2. NON-REPEATABLE READ: what one transaction sees when another commits,
//     under READ COMMITTED vs REPEATABLE READ (MySQL's default).
//  3. JOB CLAIMING with SELECT … FOR UPDATE SKIP LOCKED: two workers never
//     receive the same pipeline job.
// All rows created here are removed at the end.
const mysql = require('mysql2/promise');
const { db } = require('../src/config/env');

const connect = () => mysql.createConnection({ host: db.host, port: db.port, user: db.appUser, password: db.appPassword,
  database: db.database, decimalNumbers: true });
const line = (s = '') => console.log(s);
const step = (who, what) => console.log(`   ${who.padEnd(3)} ${what}`);

async function scratchSession(c) {
  const [u] = await c.query("SELECT user_id FROM users WHERE username = 'aarav'");
  const [r] = await c.query("INSERT INTO listening_sessions (user_id, plays, listen_sec) VALUES (?, 0, 0)", [u[0].user_id]);
  return r.insertId;
}
const plays = async (c, id) => (await c.query('SELECT plays FROM listening_sessions WHERE session_id = ?', [id]))[0][0].plays;

(async () => {
  const A = await connect();
  const B = await connect();
  const cleanup = [];
  try {
    // ------------------------------------------------------------------ 1
    line('EXPERIMENT 1 — lost update on listening_sessions.plays');
    line('Two "finish play" requests for the same session arrive together.\n');

    let id = await scratchSession(A); cleanup.push(id);
    line(' 1a. Naive read-modify-write (REPEATABLE READ, no lock)');
    await A.beginTransaction(); await B.beginTransaction();
    const a1 = await plays(A, id); step('A', `reads plays = ${a1}`);
    const b1 = await plays(B, id); step('B', `reads plays = ${b1}`);
    await A.query('UPDATE listening_sessions SET plays = ? WHERE session_id = ?', [a1 + 1, id]); step('A', `writes plays = ${a1 + 1}`);
    await A.commit(); step('A', 'COMMIT');
    await B.query('UPDATE listening_sessions SET plays = ? WHERE session_id = ?', [b1 + 1, id]); step('B', `writes plays = ${b1 + 1}`);
    await B.commit(); step('B', 'COMMIT');
    const naive = await plays(A, id);
    line(`   → final plays = ${naive}  (expected 2: ${naive === 2 ? 'correct' : 'ONE PLAY WAS LOST'})\n`);

    id = await scratchSession(A); cleanup.push(id);
    line(' 1b. Pessimistic locking: SELECT … FOR UPDATE');
    await A.beginTransaction(); await B.beginTransaction();
    const a2 = (await A.query('SELECT plays FROM listening_sessions WHERE session_id = ? FOR UPDATE', [id]))[0][0].plays;
    step('A', `SELECT … FOR UPDATE → plays = ${a2} (row now locked)`);
    const bLock = B.query('SELECT plays FROM listening_sessions WHERE session_id = ? FOR UPDATE', [id]);
    step('B', 'SELECT … FOR UPDATE → waits for A’s lock …');
    await new Promise((r) => setTimeout(r, 300));
    await A.query('UPDATE listening_sessions SET plays = ? WHERE session_id = ?', [a2 + 1, id]);
    await A.commit(); step('A', `writes plays = ${a2 + 1}, COMMIT (lock released)`);
    const b2 = (await bLock)[0][0].plays; step('B', `lock granted, reads plays = ${b2} (A’s committed value)`);
    await B.query('UPDATE listening_sessions SET plays = ? WHERE session_id = ?', [b2 + 1, id]);
    await B.commit(); step('B', `writes plays = ${b2 + 1}, COMMIT`);
    line(`   → final plays = ${await plays(A, id)}  (correct; this is how MUSE locks the user row before refreshing preferences)\n`);

    id = await scratchSession(A); cleanup.push(id);
    line(' 1c. Atomic update: UPDATE … SET plays = plays + 1 (what playbackService.finish uses)');
    await A.beginTransaction(); await B.beginTransaction();
    await A.query('UPDATE listening_sessions SET plays = plays + 1 WHERE session_id = ?', [id]); step('A', 'plays = plays + 1 (row locked)');
    const bUpd = B.query('UPDATE listening_sessions SET plays = plays + 1 WHERE session_id = ?', [id]); step('B', 'plays = plays + 1 → waits …');
    await new Promise((r) => setTimeout(r, 300));
    await A.commit(); step('A', 'COMMIT'); await bUpd; await B.commit(); step('B', 'applies on top of A, COMMIT');
    line(`   → final plays = ${await plays(A, id)}  (correct, no explicit SELECT needed)\n`);

    // ------------------------------------------------------------------ 2
    line('EXPERIMENT 2 — isolation levels: does a transaction see another’s commit?');
    id = await scratchSession(A); cleanup.push(id);
    for (const level of ['READ COMMITTED', 'REPEATABLE READ']) {
      await A.query(`SET TRANSACTION ISOLATION LEVEL ${level}`);
      await A.beginTransaction();
      const first = await plays(A, id);
      await B.query('UPDATE listening_sessions SET plays = plays + 5 WHERE session_id = ?', [id]);   // autocommit
      const second = await plays(A, id);
      await A.commit();
      line(`   ${level.padEnd(16)} A reads ${first}, B commits +5, A reads again → ${second}  ${first === second ? '(repeatable: same snapshot)' : '(non-repeatable read)'}`);
    }
    line('   MUSE keeps REPEATABLE READ by default and adds explicit row locks where a decision depends on a value it then writes.');
    line('   It switches to READ COMMITTED in two places only: the job claim (Experiment 3) and the bulk scoring INSERT … SELECT,');
    line('   where REPEATABLE READ\'s shared next-key locks on the read tables caused deadlocks between concurrent requests.\n');

    // ------------------------------------------------------------------ 3
    line('EXPERIMENT 3 — two pipeline workers claim queued jobs at the same moment');
    for (let i = 0; i < 4; i++) {
      await A.query(`INSERT INTO pipeline_jobs (job_type, idempotency_key, processing_version) VALUES ('TREND_SNAPSHOT', ?, 'demo')`,
        [`demo:concurrency:${Date.now()}:${i}`]);
    }
    const claim = async (c, sql) => ((await c.query(sql))[0][0] || {}).job_id || null;

    line(' 3a. Naive claim: ORDER BY created_at (no index matches the sort), REPEATABLE READ');
    const naiveSql = `SELECT job_id FROM pipeline_jobs WHERE status = 'DISCOVERED' AND processing_version = 'demo'
                      ORDER BY created_at, job_id LIMIT 1 FOR UPDATE SKIP LOCKED`;
    await A.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'); await B.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await A.beginTransaction(); await B.beginTransaction();
    const na = await claim(A, naiveSql); step('A', `claims job ${na}`);
    const nb = await claim(B, naiveSql); step('B', nb ? `claims job ${nb}` : 'claims NOTHING: A read and locked every queued row to sort them');
    await A.rollback(); await B.rollback();
    line(`   → ${nb ? 'worked by luck of the plan' : 'workers serialise; the queue drains one job at a time'}\n`);

    line(' 3b. MUSE claim: idx_jobs_queue (status, job_id) matches ORDER BY job_id, READ COMMITTED');
    const goodSql = `SELECT job_id FROM pipeline_jobs FORCE INDEX (idx_jobs_queue)
                     WHERE status = 'DISCOVERED' AND processing_version = 'demo'
                     ORDER BY job_id LIMIT 1 FOR UPDATE SKIP LOCKED`;
    await A.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED'); await B.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await A.beginTransaction(); await B.beginTransaction();
    const ga = await claim(A, goodSql); step('A', `claims job ${ga} (only that row is locked)`);
    const gb = await claim(B, goodSql); step('B', `claims job ${gb} (A's row skipped, no waiting)`);
    await A.rollback(); await B.rollback();
    line(`   → ${ga && gb && ga !== gb ? 'different jobs, in parallel, never the same one twice' : 'unexpected result'}`);
    await A.query("DELETE FROM pipeline_jobs WHERE processing_version = 'demo'");

    line('\nAll experiments finished; scratch rows removed.');
  } finally {
    for (const id of cleanup) await A.query('DELETE FROM listening_sessions WHERE session_id = ?', [id]).catch(() => {});
    await A.end(); await B.end();
  }
})().catch((e) => { console.error(e.sqlMessage || e.message); process.exitCode = 1; });

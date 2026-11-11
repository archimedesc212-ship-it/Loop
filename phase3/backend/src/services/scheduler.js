// In-process scheduler. Every task is idempotent, so restarts or several API
// instances are safe: jobs are keyed (pipeline_jobs.idempotency_key) and
// claimed with SELECT … FOR UPDATE SKIP LOCKED.
//   every minute  close idle listening sessions, expire private sessions
//   every hour    trend snapshot (key = hour)
//   every hour    weekly intelligence (key = week, so it really runs once a week)
//   every hour    retry jobs whose back-off has elapsed
//   every hour    delete sign-in sessions that ended more than 30 days ago; re-check local media files
const { jobs } = require('../config/env');
const { query } = require('../config/db');
const pipeline = require('./pipeline/pipelineService');
const sessions = require('./sessionService');
const media = require('./mediaService');

const timers = [];
let busy = false;

async function guarded(name, fn) {
  if (busy) return;
  busy = true;
  try { await fn(); } catch (err) { console.error(`[scheduler] ${name}:`, err.sqlMessage || err.message); } finally { busy = false; }
}

async function minutely() {
  const closed = await pipeline.closeIdleSessions(jobs.sessionIdleMinutes);
  const cleaned = await pipeline.cleanupIncognito();
  if (closed || (cleaned && (cleaned.sessions_expired || cleaned.events_deleted))) {
    console.log(`[scheduler] closed ${closed} idle sessions; private cleanup ${JSON.stringify(cleaned)}`);
  }
}

async function hourly() {
  const purged = await sessions.purgeEnded(30);
  if (purged) console.log(`[scheduler] purged ${purged} ended sign-in sessions`);
  const m = await media.checkLocal();
  if (m.unavailable) console.log(`[scheduler] ${m.unavailable} registered local media file(s) missing`);
  await pipeline.runTrendSnapshot({});
  await pipeline.runWeeklyIntelligence({ reason: 'schedule' });
  // retry failed-but-retryable jobs of the standalone types
  const due = await query(`SELECT job_id, job_type FROM pipeline_jobs WHERE status = 'DISCOVERED' AND retry_count > 0
                            AND next_attempt_at <= NOW() AND job_type IN ('TREND_SNAPSHOT', 'WORLD_GENERATION') LIMIT 5`);
  for (const j of due) {
    if (j.job_type === 'TREND_SNAPSHOT') await pipeline.runTrendSnapshot({ key: (await query('SELECT idempotency_key k FROM pipeline_jobs WHERE job_id = ?', [j.job_id]))[0].k });
    else await pipeline.runWorlds({ key: (await query('SELECT idempotency_key k FROM pipeline_jobs WHERE job_id = ?', [j.job_id]))[0].k });
  }
}

function start() {
  timers.push(setInterval(() => guarded('minutely', minutely), 60 * 1000));
  timers.push(setInterval(() => guarded('hourly', hourly), 60 * 60 * 1000));
  setTimeout(() => guarded('startup', async () => { await minutely(); await hourly(); }), 3000).unref();
  timers.forEach((t) => t.unref());
  console.log('Background scheduler started (listening sessions, private-session cleanup, sign-in session purge, media check, trends, weekly intelligence)');
}

function stop() { timers.splice(0).forEach(clearInterval); }

module.exports = { start, stop, minutely, hourly };

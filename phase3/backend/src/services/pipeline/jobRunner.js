// Generic, observable, idempotent job runner on top of pipeline_jobs.
//
//  * idempotency_key is UNIQUE: creating the same job twice returns the
//    existing row instead of making a second one.
//  * Claiming uses SELECT ... FOR UPDATE SKIP LOCKED, so two workers can never
//    run the same job at the same time (see docs/CONCURRENCY.md).
//  * Failures are retried with exponential back-off until max_retries, then
//    the job is FAILED with the error kept in last_error and the log.
const os = require('os');
const { query, one, withTransaction } = require('../../config/db');

const WORKER = `${os.hostname()}:${process.pid}`;

async function log(jobId, level, stage, message, recordId = null) {
  await query('INSERT INTO pipeline_job_logs (job_id, level, stage, message, record_id) VALUES (?, ?, ?, ?, ?)',
    [jobId, level, stage, String(message).slice(0, 500), recordId]);
}

/** Create a job, or return the existing one with the same idempotency key. */
async function createJob({ type, key, sourceId = null, parentId = null, params = null, version = '2.0', requestedBy = null, maxRetries = 3 }) {
  const existing = await one('SELECT * FROM pipeline_jobs WHERE idempotency_key = ?', [key]);
  if (existing) return { job: existing, created: false };
  try {
    const res = await query(
      `INSERT INTO pipeline_jobs (job_type, idempotency_key, source_id, parent_job_id, params, processing_version, requested_by, max_retries)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [type, key, sourceId, parentId, params ? JSON.stringify(params) : null, version, requestedBy, maxRetries]);
    return { job: await one('SELECT * FROM pipeline_jobs WHERE job_id = ?', [res.insertId]), created: true };
  } catch (err) {
    if (err.errno !== 1062) throw err;           // another request created it between our SELECT and INSERT
    return { job: await one('SELECT * FROM pipeline_jobs WHERE idempotency_key = ?', [key]), created: false };
  }
}

/**
 * Claim a specific job (or the next runnable one) atomically. Returns null if someone else has it.
 * idx_jobs_queue (status, job_id) matches the ORDER BY, so InnoDB walks the queue in order and
 * stops at the first unlocked runnable row; READ COMMITTED releases locks on rows the WHERE
 * rejects (see docs/CONCURRENCY.md, experiment 3).
 */
async function claim(jobId = null) {
  return withTransaction(async (tx) => {
    const row = await tx.one(
      `SELECT job_id FROM pipeline_jobs FORCE INDEX (${jobId ? 'PRIMARY' : 'idx_jobs_queue'})
        WHERE status = 'DISCOVERED' AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
          ${jobId ? 'AND job_id = ?' : ''}
        ORDER BY job_id LIMIT 1
        FOR UPDATE SKIP LOCKED`, jobId ? [jobId] : []);
    if (!row) return null;
    await tx.query(
      `UPDATE pipeline_jobs SET status = 'VALIDATING', locked_by = ?, locked_at = NOW(), started_at = COALESCE(started_at, NOW())
        WHERE job_id = ?`, [WORKER, row.job_id]);
    return tx.one('SELECT * FROM pipeline_jobs WHERE job_id = ?', [row.job_id]);
  }, { isolation: 'READ COMMITTED' });
}

async function setStatus(jobId, status) {
  await query('UPDATE pipeline_jobs SET status = ? WHERE job_id = ?', [status, jobId]);
}

async function complete(jobId, stats, status = 'COMPLETED') {
  await query(
    `UPDATE pipeline_jobs SET status = ?, stats = ?, completed_at = NOW(), locked_by = NULL, last_error = NULL WHERE job_id = ?`,
    [status, JSON.stringify(stats || {}), jobId]);
}

async function fail(job, err) {
  const msg = (err && (err.sqlMessage || err.message)) || String(err);
  const retry = job.retry_count < job.max_retries;
  await query(
    `UPDATE pipeline_jobs
        SET status = ?, retry_count = retry_count + 1, last_error = ?, locked_by = NULL,
            next_attempt_at = IF(?, NOW() + INTERVAL POW(2, retry_count) MINUTE, NULL),
            completed_at = IF(?, NULL, NOW())
      WHERE job_id = ?`, [retry ? 'DISCOVERED' : 'FAILED', msg.slice(0, 500), retry, retry, job.job_id]);
  await log(job.job_id, 'ERROR', 'RUN', retry ? `Attempt ${job.retry_count + 1} failed, will retry: ${msg}` : `Failed permanently: ${msg}`);
}

/**
 * Run handler(job) for a job we own. The handler returns stats; anything it
 * throws is recorded and scheduled for retry.
 */
async function run(jobId, handler) {
  const job = await claim(jobId);
  if (!job) {
    const existing = await one('SELECT * FROM pipeline_jobs WHERE job_id = ?', [jobId]);
    return { job: existing, ran: false };
  }
  try {
    const stats = await handler(job);
    const status = stats && stats.__status ? stats.__status : 'COMPLETED';
    if (stats) delete stats.__status;
    await complete(job.job_id, stats, status);
  } catch (err) {
    await fail(job, err);
  }
  return { job: await one('SELECT * FROM pipeline_jobs WHERE job_id = ?', [jobId]), ran: true };
}

module.exports = { createJob, claim, run, log, setStatus, complete, fail, WORKER };

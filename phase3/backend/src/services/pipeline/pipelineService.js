// Pipeline orchestration:
//   SOURCE -> DISCOVERY -> VALIDATION -> DUPLICATE DETECTION -> CANONICALISATION -> STORAGE
//          -> AUDIO FEATURE ANALYSIS -> MOOD ANALYSIS -> TREND ANALYSIS -> MUSE WORLD
// Every run is a pipeline_jobs row with an idempotency key, status, retries and logs.
const { query, one, call, withTransaction } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const runner = require('./jobRunner');
const ingest = require('./ingestService');
const { adapterFor } = require('../../sources');
const worlds = require('../worldService');

const weekStart = async () => (await one('SELECT fn_week_start(CURDATE()) AS w')).w;

// ---------------------------------------------------------------------------
// AUDIO + MOOD ANALYSIS for songs waiting for it
// ---------------------------------------------------------------------------
async function analyzePending(jobId, { songIds = null, actorId = null } = {}) {
  const models = await one(`SELECT
      (SELECT model_id FROM intelligence_models WHERE kind = 'AUDIO_FEATURES' AND is_active = 1) AS af,
      (SELECT model_id FROM intelligence_models WHERE kind = 'MOOD' AND is_active = 1) AS mood,
      (SELECT model_id FROM intelligence_models WHERE kind = 'SEGMENTS' AND is_active = 1) AS seg,
      (SELECT version FROM intelligence_models WHERE kind = 'AUDIO_FEATURES' AND is_active = 1) AS af_version`);
  const pending = await query(
    `SELECT s.song_id, s.title, s.duration_sec,
            (SELECT sr.payload FROM source_records sr WHERE sr.song_id = s.song_id AND JSON_EXTRACT(sr.payload, '$.analysis') IS NOT NULL
              ORDER BY sr.last_verified_at DESC LIMIT 1) AS payload
       FROM songs s WHERE s.status = 'PENDING_ANALYSIS' ${songIds ? 'AND s.song_id IN (?)' : ''}`, songIds ? [songIds] : []);
  const stats = { analysed: 0, waiting: 0 };
  for (const s of pending) {
    const p = s.payload ? (typeof s.payload === 'string' ? JSON.parse(s.payload) : s.payload) : null;
    const a = p && p.analysis;
    const UNIT = ['energy', 'valence', 'danceability', 'acousticness', 'instrumentalness', 'speechiness'];
    const complete = a && UNIT.every((k) => typeof a[k] === 'number' && a[k] >= 0 && a[k] <= 1)
      && typeof a.tempo_bpm === 'number' && a.tempo_bpm >= 40 && a.tempo_bpm <= 220;
    if (!complete) {
      stats.waiting += 1;
      if (jobId) {
        await runner.log(jobId, 'WARN', 'AUDIO_ANALYSIS', a
          ? `Song ${s.song_id} "${s.title}": supplied analysis is incomplete or out of range, left PENDING_ANALYSIS`
          : `Song ${s.song_id} "${s.title}": no approved analysis available yet, left PENDING_ANALYSIS`);
      }
      continue;
    }
    await withTransaction(async (tx) => {
      const af = await tx.query(
        `INSERT INTO audio_features (song_id, model_id, energy, valence, danceability, acousticness, instrumentalness, speechiness,
                                     loudness_db, tempo_bpm, musical_key, mode, is_current)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [s.song_id, models.af, a.energy, a.valence, a.danceability, a.acousticness, a.instrumentalness, a.speechiness,
          a.loudness_db ?? -8, a.tempo_bpm, a.key ?? 0, a.mode ?? 1]);
      await tx.call('sp_set_current_audio_features', [af.insertId]);
      let idx = 0;
      for (const seg of (a.segments || [])) {
        if (!(seg.end > seg.start) || seg.end > s.duration_sec) continue;
        idx += 1;
        await tx.query(
          `INSERT INTO mood_segments (song_id, model_id, segment_index, start_sec, end_sec, mood_id, confidence, energy, valence)
           SELECT ?, ?, ?, ?, ?, m.mood_id,
                  ROUND(GREATEST(0.30, 1 - 1.5 * SQRT(POW(? - m.target_energy, 2) + POW(? - m.target_valence, 2))), 3), ?, ?
             FROM moods m WHERE m.mood_id = fn_nearest_mood(?, ?)`,
          [s.song_id, models.seg, idx, seg.start, seg.end, seg.energy, seg.valence, seg.energy, seg.valence, seg.energy, seg.valence]);
      }
      await tx.call('sp_analyze_song_moods', [models.mood, null, s.song_id]);
      await tx.query("UPDATE songs SET status = 'ACTIVE' WHERE song_id = ? AND status = 'PENDING_ANALYSIS'", [s.song_id]);
      const moods = await tx.query(`SELECT m.name FROM song_moods sm JOIN moods m ON m.mood_id = sm.mood_id
                                     WHERE sm.song_id = ? AND sm.model_id = ? ORDER BY sm.confidence DESC`, [s.song_id, models.mood]);
      if (jobId) {
        await tx.query('INSERT INTO pipeline_job_logs (job_id, level, stage, message) VALUES (?, ?, ?, ?)',
          [jobId, 'INFO', 'MOOD_ANALYSIS', `Song ${s.song_id} "${s.title}": analysis ${models.af_version} stored, moods ${moods.map((m) => m.name).join(', ')}; now ACTIVE`]);
      }
    }, { actorId });
    stats.analysed += 1;
  }
  return stats;
}

// ---------------------------------------------------------------------------
// INGESTION with PRIMARY -> APPROVED FALLBACK -> CACHED DATABASE DATA
// ---------------------------------------------------------------------------
async function sourceChain(code) {
  const chain = [];
  let s = await one('SELECT * FROM music_sources WHERE code = ?', [code]);
  if (!s) throw ApiError.notFound('Source');
  const seen = new Set();
  while (s && !seen.has(s.source_id)) {
    chain.push(s); seen.add(s.source_id);
    s = s.fallback_source_id ? await one('SELECT * FROM music_sources WHERE source_id = ?', [s.fallback_source_id]) : null;
  }
  return chain;
}

async function runIngest({ sourceCode = 'MUSE_CATALOG_FEED', file = null, requestedBy = null, force = false, parentId = null, keyPrefix = null }) {
  const chain = await sourceChain(sourceCode);
  const primary = chain[0];
  const key = `${keyPrefix || 'ingest'}:${sourceCode}:${file || 'all'}:${await weekStart()}${force ? `:run-${Date.now()}` : ''}`;
  const { job, created } = await runner.createJob({ type: 'INGEST_SOURCE', key, sourceId: primary.source_id, parentId,
    params: { sourceCode, file, force }, requestedBy });
  if (!created && job.status !== 'DISCOVERED') {
    return { jobId: job.job_id, reused: true, status: job.status, stats: job.stats, summary: `Already ran as job ${job.job_id} (${job.status}). Use "force" to run again.` };
  }
  const { job: done } = await runner.run(job.job_id, async (j) => {
    // pick the first enabled source in the chain whose adapter can discover right now
    let discovered = null;
    let used = null;
    for (const s of chain) {
      const adapter = adapterFor(s.code);
      if (!s.is_enabled) { await runner.log(j.job_id, 'WARN', 'DISCOVERY', `${s.code} is disabled — trying the approved fallback`); continue; }
      if (!adapter) { await runner.log(j.job_id, 'WARN', 'DISCOVERY', `${s.code} has no adapter in this build — trying the approved fallback`); continue; }
      try {
        discovered = await adapter.discover({ file: s.code === 'MUSE_CATALOG_FEED' ? file : undefined });
        used = s;
        break;
      } catch (err) {
        await runner.log(j.job_id, 'WARN', 'DISCOVERY', `${s.code} unavailable (${err.message}) — trying the approved fallback`);
      }
    }
    if (!discovered) {
      await runner.log(j.job_id, 'WARN', 'DISCOVERY', 'No source reachable: MUSE keeps serving the cached catalogue already in the database. Nothing was marked as live.');
      return { __status: 'SKIPPED', source: null, records: 0, cached: true };
    }
    if (used.source_id !== primary.source_id) await query('UPDATE pipeline_jobs SET source_id = ? WHERE job_id = ?', [used.source_id, j.job_id]);
    await runner.log(j.job_id, 'INFO', 'DISCOVERY', `${used.code}: found ${discovered.records.length} records in ${discovered.label}`);
    await runner.setStatus(j.job_id, 'PROCESSING');

    const refs = await ingest.references();
    const stats = { source: used.code, records: discovered.records.length, created: 0, linked: 0, unchanged: 0, review: 0, failed: 0, skipped: 0 };
    for (const rec of discovered.records) {
      const outcome = await ingest.processRecord(used, rec, refs, j, requestedBy);
      stats[outcome] = (stats[outcome] || 0) + 1;
    }
    const analysis = await analyzePending(j.job_id, { actorId: requestedBy });
    stats.analysed = analysis.analysed;
    stats.waitingForAnalysis = analysis.waiting;
    await query('UPDATE music_sources SET last_success_at = NOW() WHERE source_id = ?', [used.source_id]);
    await runner.log(j.job_id, 'INFO', 'COMPLETE',
      `created ${stats.created}, linked ${stats.linked}, unchanged ${stats.unchanged}, review ${stats.review}, failed ${stats.failed}, analysed ${stats.analysed}`);
    return stats;
  });
  const st = typeof done.stats === 'string' ? JSON.parse(done.stats) : done.stats;
  return { jobId: done.job_id, reused: false, status: done.status, stats: st,
    summary: st ? `created ${st.created || 0}, linked ${st.linked || 0}, unchanged ${st.unchanged || 0}, review ${st.review || 0}, failed ${st.failed || 0}` : done.last_error };
}

// ---------------------------------------------------------------------------
// TRENDS, WORLDS, WEEKLY
// ---------------------------------------------------------------------------
async function runTrendSnapshot({ requestedBy = null, parentId = null, key = null }) {
  const hourKey = (await one("SELECT DATE_FORMAT(NOW(), '%Y-%m-%dT%H') AS h")).h;
  const { job } = await runner.createJob({ type: 'TREND_SNAPSHOT', key: key || `trend:${hourKey}`, parentId, requestedBy });
  if (job.status !== 'DISCOVERED') return { jobId: job.job_id, status: job.status, reused: true };
  const { job: done } = await runner.run(job.job_id, async (j) => {
    await runner.setStatus(j.job_id, 'PROCESSING');
    const sets = await call('sp_generate_trend_snapshot', [j.job_id]);
    const rows = sets[0] || [];
    await runner.log(j.job_id, 'INFO', 'TREND_ANALYSIS', `Snapshot written: ${rows.map((r) => `${r.window_code}/${r.entity_type}=${r.entities}`).join(', ')}`);
    return { entities: rows.reduce((s, r) => s + Number(r.entities), 0) };
  });
  return { jobId: done.job_id, status: done.status };
}

async function runWorlds({ requestedBy = null, parentId = null, key = null }) {
  const week = await weekStart();
  const { job } = await runner.createJob({ type: 'WORLD_GENERATION', key: key || `worlds:${week}`, parentId, requestedBy });
  if (job.status !== 'DISCOVERED') return { jobId: job.job_id, status: job.status, reused: true };
  const { job: done } = await runner.run(job.job_id, async (j) => {
    await runner.setStatus(j.job_id, 'PROCESSING');
    const users = await query(
      `SELECT u.user_id, up.display_name FROM users u JOIN user_profiles up USING (user_id)
        WHERE u.is_active = 1 AND (EXISTS (SELECT 1 FROM listening_history lh WHERE lh.user_id = u.user_id)
                                OR EXISTS (SELECT 1 FROM user_mood_preferences p WHERE p.user_id = u.user_id))`);
    let created = 0; let existing = 0;
    for (const u of users) {
      const r = await worlds.generate(u.user_id, { jobId: j.job_id });
      if (r.created) { created += 1; await runner.log(j.job_id, 'INFO', 'THEME_GENERATION', `${u.display_name}: "${r.title}" (v${r.version})`); } else existing += 1;
    }
    return { users: users.length, created, existing };
  });
  return { jobId: done.job_id, status: done.status };
}

/** The weekly intelligence update. Safe to rerun: each stage is its own idempotent job. */
async function runWeeklyIntelligence({ requestedBy = null, skipIngest = false, force = false, reason = 'manual' }) {
  const week = await weekStart();
  const suffix = force ? `:run-${Date.now()}` : '';
  const { job, created } = await runner.createJob({ type: 'WEEKLY_INTELLIGENCE', key: `weekly:${week}${suffix}`, requestedBy, params: { skipIngest, reason } });
  if (!created && job.status !== 'DISCOVERED') {
    return { jobId: job.job_id, reused: true, status: job.status, summary: `This week's update already ran as job ${job.job_id} (${job.status}). Use "force" to run again.` };
  }
  const steps = [];
  const { job: done } = await runner.run(job.job_id, async (j) => {
    await runner.setStatus(j.job_id, 'PROCESSING');
    const base = `weekly:${week}${suffix}`;
    if (!skipIngest) {
      const sources = await query(`SELECT code FROM music_sources WHERE source_type = 'MUSIC_METADATA' AND access_method IN ('FILE_FEED', 'API')
                                    AND code <> 'MUSE_SEED_CATALOG' ORDER BY priority`);
      for (const s of sources) {
        const r = await runIngest({ sourceCode: s.code, requestedBy, parentId: j.job_id, keyPrefix: `${base}:ingest` });
        steps.push(`ingest ${s.code}: ${r.status}`);
      }
    } else steps.push('ingest: skipped');
    const a = await analyzePending(j.job_id, { actorId: requestedBy });
    steps.push(`analysis: ${a.analysed} analysed, ${a.waiting} waiting`);
    const t = await runTrendSnapshot({ requestedBy, parentId: j.job_id, key: `${base}:trend` });
    steps.push(`trends: job ${t.jobId} ${t.status}`);
    const w = await runWorlds({ requestedBy, parentId: j.job_id, key: `${base}:worlds` });
    steps.push(`worlds: job ${w.jobId} ${w.status}`);
    await runner.log(j.job_id, 'INFO', 'COMPLETE', steps.join(' · '));
    return { steps };
  });
  return { jobId: done.job_id, status: done.status, summary: steps.join(' · ') || done.last_error };
}

// ---------------------------------------------------------------------------
// housekeeping (scheduler)
// ---------------------------------------------------------------------------
async function closeIdleSessions(idleMinutes) {
  const idle = await query("SELECT session_id FROM listening_sessions WHERE status = 'OPEN' AND last_activity_at < NOW() - INTERVAL ? MINUTE", [idleMinutes]);
  for (const s of idle) await call('sp_close_listening_session', [s.session_id]);
  return idle.length;
}

async function cleanupIncognito() {
  const [r] = await call('sp_cleanup_expired_incognito');
  return r ? r[0] : null;
}

module.exports = { runIngest, runTrendSnapshot, runWorlds, runWeeklyIntelligence, analyzePending, closeIdleSessions, cleanupIncognito, sourceChain };

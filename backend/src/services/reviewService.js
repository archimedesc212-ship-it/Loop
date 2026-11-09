// Admin review queue: ambiguous duplicates, suspicious metadata, failed
// ingestion and source conflicts are never resolved silently. A curator
// decides; every decision is audited by trg_review_au_audit.
//
//   APPROVE    create the song from the incoming record (new canonical entity)
//   MERGE      the incoming record IS the candidate song: link provenance to it
//   REJECT     the record is wrong: mark it SKIPPED, nothing enters the catalogue
//   IGNORE     close the item without acting (record stays as it is)
//   REPROCESS  optionally correct fields, then run the record through the pipeline again
const { query, one, withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');
const runner = require('./pipeline/jobRunner');
const ingest = require('./pipeline/ingestService');
const pipeline = require('./pipeline/pipelineService');

const parse = (x) => (typeof x === 'string' ? JSON.parse(x) : x);

async function list({ status = 'PENDING', limit = 50 }) {
  const rows = await query(
    `SELECT rq.review_id AS id, rq.review_type AS type, rq.status, rq.score, rq.details, rq.created_at AS createdAt,
            rq.decided_at AS decidedAt, rq.decision_note AS note, dp.display_name AS decidedBy,
            sr.record_id AS recordId, sr.external_id AS externalId, sr.status AS recordStatus, sr.payload, sr.quality_score AS quality,
            ms.code AS source, rq.job_id AS jobId,
            rq.candidate_song_id AS candidateSongId, cs.title AS candidateTitle, ca.name AS candidateArtist, cs.duration_sec AS candidateDuration
       FROM review_queue rq
       LEFT JOIN source_records sr ON sr.record_id = rq.record_id
       LEFT JOIN music_sources ms ON ms.source_id = sr.source_id
       LEFT JOIN songs cs ON cs.song_id = rq.candidate_song_id
       LEFT JOIN artists ca ON ca.artist_id = cs.primary_artist_id
       LEFT JOIN user_profiles dp ON dp.user_id = rq.decided_by
      WHERE (? = 'ALL' OR rq.status = ?)
      ORDER BY rq.status = 'PENDING' DESC, rq.review_id DESC LIMIT ?`, [status, status, limit]);
  return rows.map((r) => ({ ...r, details: parse(r.details), payload: parse(r.payload) }));
}

const ALLOWED = {
  POSSIBLE_DUPLICATE: ['APPROVE', 'MERGE', 'REJECT', 'IGNORE', 'REPROCESS'],
  SUSPICIOUS_METADATA: ['APPROVE', 'REJECT', 'IGNORE', 'REPROCESS'],
  FAILED_INGESTION: ['REJECT', 'IGNORE', 'REPROCESS'],
  SOURCE_CONFLICT: ['APPROVE', 'MERGE', 'REJECT', 'IGNORE'],
};
const STATUS = { APPROVE: 'APPROVED', MERGE: 'MERGED', REJECT: 'REJECTED', IGNORE: 'IGNORED', REPROCESS: 'REPROCESS' };
const PATCHABLE = ['title', 'artist', 'duration_sec', 'isrc', 'language', 'genre', 'release_year', 'explicit', 'content_rating'];

/** Remove analysis values that fail range checks so APPROVE never stores impossible numbers. */
function sanitizeAnalysis(p) {
  const a = p.analysis;
  if (!a) return p;
  const unit = ['energy', 'valence', 'danceability', 'acousticness', 'instrumentalness', 'speechiness'];
  const ok = unit.every((k) => typeof a[k] === 'number' && a[k] >= 0 && a[k] <= 1) && a.tempo_bpm >= 40 && a.tempo_bpm <= 220;
  if (ok) return p;
  const rest = { ...p };
  delete rest.analysis;
  return rest;   // song is created PENDING_ANALYSIS and waits for a valid analysis
}

async function decide(actor, reviewId, { action, note = null, patch = null }) {
  const outcome = await withTransaction(async (tx) => {
    const r = await tx.one('SELECT * FROM review_queue WHERE review_id = ? FOR UPDATE', [reviewId]);
    if (!r) throw ApiError.notFound('Review item');
    if (r.status !== 'PENDING') throw new ApiError(409, 'ALREADY_DECIDED', `This item was already decided (${r.status}).`);
    if (!ALLOWED[r.review_type].includes(action)) {
      throw new ApiError(400, 'ACTION_NOT_ALLOWED', `${action} is not possible for ${r.review_type.toLowerCase().replace('_', ' ')} items.`);
    }
    const record = r.record_id ? await tx.one('SELECT * FROM source_records WHERE record_id = ? FOR UPDATE', [r.record_id]) : null;
    const result = { action, reviewId };

    if (action === 'APPROVE') {
      if (!record) throw new ApiError(409, 'NO_RECORD', 'This item has no source record to approve.');
      const refs = await ingest.references();
      const payload = sanitizeAnalysis(parse(record.payload));
      const errors = ingest.validate(payload, refs);
      if (errors.length) throw new ApiError(400, 'RECORD_INVALID', `The record still fails validation: ${errors.join('; ')}. Use Reprocess with corrections.`);
      const { songId } = await ingest.createSong(tx, payload, refs, { sourceId: record.source_id, jobId: r.job_id, record });
      await tx.query(`UPDATE source_records SET status = 'COMPLETED', song_id = ?, match_method = 'MANUAL', match_confidence = 1,
                       payload = ? WHERE record_id = ?`, [songId, JSON.stringify(payload), record.record_id]);
      result.songId = songId;
      result.message = payload.analysis ? `Created song ${songId}; it becomes playable once analysis is stored.` : `Created song ${songId}; it waits for a valid audio analysis.`;
    } else if (action === 'MERGE') {
      if (!record || !r.candidate_song_id) throw new ApiError(409, 'NO_CANDIDATE', 'There is no candidate song to merge into.');
      await tx.query(`UPDATE source_records SET status = 'COMPLETED', song_id = ?, match_method = 'MANUAL', match_confidence = 1
                       WHERE record_id = ?`, [r.candidate_song_id, record.record_id]);
      result.songId = r.candidate_song_id;
      result.message = `Linked the incoming record to song ${r.candidate_song_id}; no duplicate was created.`;
    } else if (action === 'REJECT') {
      if (record) await tx.query("UPDATE source_records SET status = 'SKIPPED' WHERE record_id = ?", [record.record_id]);
      result.message = 'Rejected. The record will not enter the catalogue.';
    } else if (action === 'IGNORE') {
      result.message = 'Closed without changes.';
    }

    await tx.query('UPDATE review_queue SET status = ?, decided_by = ?, decided_at = NOW(), decision_note = ? WHERE review_id = ?',
      [STATUS[action], actor, note, reviewId]);
    return { result, record };
  }, { actorId: actor });

  if (action === 'APPROVE' && outcome.result.songId) {
    const a = await pipeline.analyzePending(null, { songIds: [outcome.result.songId], actorId: actor });
    outcome.result.analysed = a.analysed > 0;
  }
  if (action === 'REPROCESS') outcome.result = { ...outcome.result, ...(await reprocess(actor, outcome.record, patch)) };
  return outcome.result;
}

/** Re-run one record through validation → duplicate detection → storage as a new, logged job. */
async function reprocess(actor, record, patch) {
  if (!record) throw new ApiError(409, 'NO_RECORD', 'This item has no source record to reprocess.');
  const payload = { ...parse(record.payload) };
  const changed = {};
  for (const k of PATCHABLE) {
    if (patch && patch[k] !== undefined) { payload[k] = patch[k]; changed[k] = patch[k]; }
  }
  const source = await one('SELECT * FROM music_sources WHERE source_id = ?', [record.source_id]);
  const { job } = await runner.createJob({ type: 'INGEST_SOURCE', key: `reprocess:${record.record_id}:${Date.now()}`, sourceId: source.source_id,
    params: { recordId: record.record_id, corrected: changed }, requestedBy: actor, maxRetries: 0 });
  let outcome;
  const { job: done } = await runner.run(job.job_id, async (j) => {
    await runner.log(j.job_id, 'INFO', 'REPROCESS', `Record ${record.external_id} reprocessed by review${Object.keys(changed).length ? ` with corrections: ${Object.keys(changed).join(', ')}` : ''}`, record.record_id);
    // force a fresh pass: the processor skips records whose payload hash and status are unchanged
    await query("UPDATE source_records SET status = 'DISCOVERED' WHERE record_id = ?", [record.record_id]);
    const refs = await ingest.references();
    outcome = await ingest.processRecord(source, { externalId: record.external_id, entityType: record.entity_type, payload,
      sourceUrl: record.source_url, rights: record.rights_status }, refs, j, actor);
    const a = await pipeline.analyzePending(j.job_id, { actorId: actor });
    return { outcome, analysed: a.analysed };
  });
  const after = await one('SELECT status, song_id FROM source_records WHERE record_id = ?', [record.record_id]);
  return { jobId: done.job_id, outcome, recordStatus: after.status, songId: after.song_id,
    message: { created: 'Reprocessed: a new song was created.', linked: 'Reprocessed: linked to an existing song.',
      review: 'Reprocessed: it still needs review (a new review item was opened).', failed: 'Reprocessed: it still fails validation.',
      unchanged: 'Reprocessed: nothing changed.', skipped: 'Reprocessed: skipped.' }[outcome] || `Job ${done.job_id}: ${done.status}` };
}

module.exports = { list, decide };

// Record-level ingestion:  DISCOVERED -> VALIDATING -> PROCESSING -> COMPLETED | SKIPPED | FAILED | IN_REVIEW
//
// Duplicate detection, strongest evidence first:
//   1. stable external id (same source)       -> same record, update or skip
//   2. ISRC                                    -> link to the existing song
//   3. artist (name or alias) + normalised title + duration within 3 s -> link
//   4. same artist, similar title (Dice >= 0.8) and duration within 10 s
//                                              -> NOT merged; sent to admin review
//   5. otherwise                               -> new canonical song
// Each record is processed in its own transaction so one bad record never
// rolls back the others; every decision is logged against the job.
const crypto = require('crypto');
const { query, one, withTransaction } = require('../../config/db');

const PROCESSING_VERSION = '2.0';
const normalize = (s) => String(s || '').toLowerCase().replace(/[!-/:-@[-`{-~—–‘’“”\s]+/g, ' ').trim();
// Deterministic JSON: keys sorted at EVERY level (an array replacer would drop nested keys).
const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => [k, sortKeys(v[k])])) : v);
const canonicalJson = (o) => JSON.stringify(sortKeys(o));
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function bigrams(s) {
  const t = ` ${normalize(s)} `;
  const out = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}
/** Dice coefficient on character bigrams: 1 = identical, 0 = nothing shared. */
function similarity(a, b) {
  const x = bigrams(a); const y = bigrams(b);
  const counts = new Map();
  x.forEach((g) => counts.set(g, (counts.get(g) || 0) + 1));
  let shared = 0;
  y.forEach((g) => { const c = counts.get(g); if (c) { shared += 1; counts.set(g, c - 1); } });
  return (2 * shared) / (x.length + y.length || 1);
}

const UNIT = ['energy', 'valence', 'danceability', 'acousticness', 'instrumentalness', 'speechiness'];

/** Hard validation: problems that make a record unusable. */
function validate(p, refs) {
  const errors = [];
  if (!p.title || String(p.title).trim().length < 1 || String(p.title).length > 150) errors.push('title is missing or longer than 150 characters');
  if (!p.artist || String(p.artist).length > 100) errors.push('artist is missing');
  if (!Number.isInteger(p.duration_sec) || p.duration_sec < 30 || p.duration_sec > 1800) errors.push('duration_sec must be a whole number between 30 and 1800');
  if (p.isrc && !/^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/.test(p.isrc)) errors.push(`ISRC "${p.isrc}" is not a valid 12-character code`);
  if (p.language && !refs.languages.has(p.language)) errors.push(`unknown language "${p.language}"`);
  if (p.genre && !refs.genres.has(normalize(p.genre))) errors.push(`unknown genre "${p.genre}"`);
  if (p.release_year && (p.release_year < 1900 || p.release_year > 2100)) errors.push('release_year out of range');
  return errors;
}

/** Soft checks: plausible but contradictory data that a human should look at. */
function suspicious(p) {
  const issues = [];
  if (p.explicit && (p.content_rating || 'ALL') === 'ALL') issues.push('marked explicit but content rating is ALL');
  const a = p.analysis;
  if (a) {
    UNIT.forEach((k) => { if (typeof a[k] !== 'number' || a[k] < 0 || a[k] > 1) issues.push(`analysis.${k} is not between 0 and 1`); });
    if (typeof a.tempo_bpm !== 'number' || a.tempo_bpm < 40 || a.tempo_bpm > 220) issues.push('analysis.tempo_bpm outside 40–220');
  }
  return issues;
}

function quality(p) {
  const fields = ['title', 'artist', 'duration_sec', 'isrc', 'language', 'genre', 'release_year', 'album', 'analysis'];
  return Math.round((fields.filter((f) => p[f] !== undefined && p[f] !== null && p[f] !== '').length / fields.length) * 1000) / 1000;
}

async function references() {
  const [langs, genres, sketch] = await Promise.all([
    query('SELECT language_id, iso_code FROM languages'),
    query('SELECT genre_id, name FROM genres'),
    one("SELECT source_id FROM music_sources WHERE code = 'MUSE_SKETCH'"),
  ]);
  return {
    languages: new Map(langs.map((l) => [l.iso_code, l.language_id])),
    genres: new Map(genres.map((g) => [normalize(g.name), g.genre_id])),
    sketchSource: sketch ? sketch.source_id : null,
  };
}

async function findArtist(tx, name) {
  const n = normalize(name);
  return tx.one(
    `SELECT a.artist_id, a.name, 'NAME' AS how FROM artists a WHERE a.normalized_name = ?
     UNION
     SELECT a.artist_id, a.name, 'ALIAS' FROM artist_aliases al JOIN artists a ON a.artist_id = al.artist_id WHERE al.normalized_alias = ?
     LIMIT 1`, [n, n]);
}

async function openReview(tx, { type, recordId, candidateSongId = null, jobId, score = null, details }) {
  await tx.query(
    `INSERT INTO review_queue (review_type, record_id, candidate_song_id, job_id, score, details)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE job_id = VALUES(job_id), details = VALUES(details), score = VALUES(score)`,
    [type, recordId, candidateSongId, jobId, score, JSON.stringify(details)]);
}

/**
 * Create the canonical song (and artist if new) from a validated payload.
 * Used by the pipeline and by review APPROVE.
 */
async function createSong(tx, p, refs, { sourceId, jobId, record }) {
  let artist = await findArtist(tx, p.artist);
  if (!artist) {
    const ins = await tx.query(
      `INSERT INTO artists (name, artist_type, country_code, region_code, primary_language_id)
       VALUES (?, 'GROUP', ?, ?, ?)`,
      [String(p.artist).trim(), p.artist_country || 'IN', p.artist_region || null,
        p.artist_language ? refs.languages.get(p.artist_language) || null : (p.language ? refs.languages.get(p.language) : null)]);
    artist = { artist_id: ins.insertId, name: p.artist, how: 'NEW' };
    const ap = { name: p.artist, region: p.artist_region || null };
    await tx.query(
      `INSERT INTO source_records (source_id, entity_type, external_id, artist_id, rights_status, payload, payload_hash, status, match_method,
                                   match_confidence, quality_score, processing_version, last_job_id)
       VALUES (?, 'ARTIST', ?, ?, ?, ?, ?, 'COMPLETED', 'NEW', 1, 0.5, ?, ?)
       ON DUPLICATE KEY UPDATE artist_id = VALUES(artist_id), last_verified_at = NOW()`,
      [sourceId, `artist:${normalize(p.artist)}`, artist.artist_id, record.rights_status || 'PERMITTED', canonicalJson(ap),
        sha256(canonicalJson(ap)), PROCESSING_VERSION, jobId]);
  }
  const hasAnalysis = !!p.analysis;
  const rating = p.explicit ? (p.content_rating && p.content_rating !== 'ALL' ? p.content_rating : 'TEEN') : (p.content_rating || 'ALL');
  const song = await tx.query(
    `INSERT INTO songs (title, primary_artist_id, duration_sec, release_year, language_id, isrc, explicit, content_rating, popularity, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_ANALYSIS')`,
    [String(p.title).trim(), artist.artist_id, p.duration_sec, p.release_year || new Date().getFullYear(),
      p.language ? refs.languages.get(p.language) : null, p.isrc || null, p.explicit ? 1 : 0, rating,
      Math.max(0, Math.min(100, Number(p.popularity) || 40))]);
  const songId = song.insertId;
  if (p.genre) await tx.query('INSERT INTO song_genres (song_id, genre_id, is_primary) VALUES (?, ?, 1)', [songId, refs.genres.get(normalize(p.genre))]);
  if (refs.sketchSource) {
    await tx.query(`INSERT INTO song_media (song_id, source_id, media_type, rights_status, priority) VALUES (?, ?, 'GENERATED_SKETCH', 'PERMITTED', 50)`,
      [songId, refs.sketchSource]);
  }
  return { songId, artist, hasAnalysis };
}

/**
 * Process one discovered record. Returns the outcome label for job stats.
 */
async function processRecord(source, rec, refs, job, actorId) {
  const payload = rec.payload;
  const hash = sha256(canonicalJson(payload));
  const q = quality(payload);

  return withTransaction(async (tx) => {
    // logs are written on the same transaction, so they commit (or vanish) with the record
    const tlog = (level, stage, message, recordId = null) => tx.query(
      'INSERT INTO pipeline_job_logs (job_id, level, stage, message, record_id) VALUES (?, ?, ?, ?, ?)',
      [job.job_id, level, stage, String(message).slice(0, 500), recordId]);
    // ---- DISCOVERY: upsert the provenance row --------------------------------
    let record = await tx.one('SELECT * FROM source_records WHERE source_id = ? AND entity_type = ? AND external_id = ? FOR UPDATE',
      [source.source_id, rec.entityType, rec.externalId]);
    if (record && record.payload_hash === hash && ['COMPLETED', 'SKIPPED', 'IN_REVIEW'].includes(record.status)) {
      await tx.query('UPDATE source_records SET last_verified_at = NOW(), last_job_id = ? WHERE record_id = ?', [job.job_id, record.record_id]);
      await tlog('INFO', 'DISCOVERY', `${rec.externalId}: unchanged since last run, skipped`, record.record_id);
      return 'unchanged';
    }
    if (!record) {
      const ins = await tx.query(
        `INSERT INTO source_records (source_id, entity_type, external_id, isrc, source_url, rights_status, payload, payload_hash, status,
                                     quality_score, processing_version, last_job_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'VALIDATING', ?, ?, ?)`,
        [source.source_id, rec.entityType, rec.externalId, payload.isrc && /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/.test(payload.isrc) ? payload.isrc : null,
          rec.sourceUrl, rec.rights, canonicalJson(payload), hash, q, PROCESSING_VERSION, job.job_id]);
      record = await tx.one('SELECT * FROM source_records WHERE record_id = ?', [ins.insertId]);
    } else {
      await tx.query(`UPDATE source_records SET payload = ?, payload_hash = ?, status = 'VALIDATING', quality_score = ?, processing_version = ?,
                       last_job_id = ?, last_verified_at = NOW() WHERE record_id = ?`,
        [canonicalJson(payload), hash, q, PROCESSING_VERSION, job.job_id, record.record_id]);
    }
    const setRecord = (status, method = null, conf = null, songId = undefined) => tx.query(
      `UPDATE source_records SET status = ?, match_method = COALESCE(?, match_method), match_confidence = COALESCE(?, match_confidence)
       ${songId !== undefined ? ', song_id = ?' : ''} WHERE record_id = ?`,
      songId !== undefined ? [status, method, conf, songId, record.record_id] : [status, method, conf, record.record_id]);

    if (rec.entityType !== 'SONG') {
      await setRecord('SKIPPED');
      await tlog('WARN', 'VALIDATING', `${rec.externalId}: entity type ${rec.entityType} is not ingested by this pipeline`, record.record_id);
      return 'skipped';
    }

    // ---- VALIDATING -----------------------------------------------------------
    const errors = validate(payload, refs);
    if (errors.length) {
      await setRecord('FAILED');
      await openReview(tx, { type: 'FAILED_INGESTION', recordId: record.record_id, jobId: job.job_id, details: { externalId: rec.externalId, errors, title: payload.title || null } });
      await tlog('ERROR', 'VALIDATING', `${rec.externalId}: ${errors.join('; ')}`, record.record_id);
      return 'failed';
    }
    const issues = suspicious(payload);
    if (issues.length) {
      await setRecord('IN_REVIEW');
      await openReview(tx, { type: 'SUSPICIOUS_METADATA', recordId: record.record_id, jobId: job.job_id, details: { externalId: rec.externalId, issues, title: payload.title } });
      await tlog('WARN', 'VALIDATING', `${rec.externalId}: sent to review (${issues.join('; ')})`, record.record_id);
      return 'review';
    }

    // ---- DUPLICATE DETECTION / CANONICALISATION -------------------------------
    await tx.query("UPDATE source_records SET status = 'PROCESSING' WHERE record_id = ?", [record.record_id]);
    if (record.song_id) {
      await setRecord('COMPLETED', 'EXTERNAL_ID', 1);
      await tlog('INFO', 'CANONICALIZATION', `${rec.externalId}: already linked to song ${record.song_id}; provenance refreshed`, record.record_id);
      return 'linked';
    }
    if (payload.isrc) {
      const byIsrc = await tx.one('SELECT song_id, title FROM songs WHERE isrc = ?', [payload.isrc]);
      if (byIsrc) {
        await setRecord('COMPLETED', 'ISRC', 1, byIsrc.song_id);
        await tlog('INFO', 'DUPLICATE_DETECTION', `${rec.externalId}: ISRC ${payload.isrc} matches song ${byIsrc.song_id} "${byIsrc.title}" — linked, no duplicate created`, record.record_id);
        return 'linked';
      }
    }
    const artist = await findArtist(tx, payload.artist);
    if (artist) {
      const candidates = await tx.query(
        "SELECT song_id, title, normalized_title, version_label, duration_sec FROM songs WHERE primary_artist_id = ? AND status <> 'MERGED'",
        [artist.artist_id]);
      const exact = candidates.find((c) => c.normalized_title === normalize(payload.title) && c.version_label === '' && Math.abs(c.duration_sec - payload.duration_sec) <= 3);
      if (exact) {
        await setRecord('COMPLETED', 'EXACT', 0.97, exact.song_id);
        await tlog('INFO', 'DUPLICATE_DETECTION',
          `${rec.externalId}: "${payload.title}" by ${payload.artist} (${artist.how === 'ALIAS' ? `alias of ${artist.name}` : 'same artist'}) equals song ${exact.song_id} — linked`, record.record_id);
        return 'linked';
      }
      const fuzzy = candidates
        .map((c) => ({ ...c, sim: similarity(c.title, payload.title), dd: Math.abs(c.duration_sec - payload.duration_sec) }))
        .filter((c) => c.sim >= 0.8 && c.dd <= 10)
        .sort((a, b) => b.sim - a.sim)[0];
      if (fuzzy) {
        await setRecord('IN_REVIEW', 'FUZZY', Math.round(fuzzy.sim * 1000) / 1000);
        await openReview(tx, { type: 'POSSIBLE_DUPLICATE', recordId: record.record_id, candidateSongId: fuzzy.song_id, jobId: job.job_id,
          score: Math.round(fuzzy.sim * 1000) / 1000,
          details: { externalId: rec.externalId, incoming: { title: payload.title, artist: payload.artist, duration_sec: payload.duration_sec },
            existing: { song_id: fuzzy.song_id, title: fuzzy.title, duration_sec: fuzzy.duration_sec }, titleSimilarity: fuzzy.sim, durationDiff: fuzzy.dd } });
        await tlog('WARN', 'DUPLICATE_DETECTION',
          `${rec.externalId}: "${payload.title}" looks like song ${fuzzy.song_id} "${fuzzy.title}" (similarity ${fuzzy.sim.toFixed(2)}, Δ${fuzzy.dd}s) — sent to review, not merged`, record.record_id);
        return 'review';
      }
    }

    // ---- STORAGE: new canonical song -----------------------------------------
    const { songId, artist: a } = await createSong(tx, payload, refs, { sourceId: source.source_id, jobId: job.job_id, record });
    await setRecord('COMPLETED', 'NEW', 1, songId);
    await tlog('INFO', 'STORAGE',
      `${rec.externalId}: created song ${songId} "${payload.title}"${a.how === 'NEW' ? ` and new artist "${a.name}"` : a.how === 'ALIAS' ? ` (artist matched by alias → ${a.name})` : ''}${payload.analysis ? '' : ' — no audio analysis supplied, stays PENDING_ANALYSIS'}`,
      record.record_id);
    return 'created';
  }, { actorId });
}

module.exports = { processRecord, references, createSong, validate, suspicious, similarity, normalize, canonicalJson, sortKeys, sha256, PROCESSING_VERSION };

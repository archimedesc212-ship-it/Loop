// Admin / curator operations. Every write runs in a transaction with the
// acting user exposed to audit triggers as @muse_actor_id; writes that no
// trigger covers insert their own audit row in the same transaction.
const { query, one, withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { toSong } = require('./songMapper');
const moodParser = require('./moodParser');
const pipeline = require('./pipeline/pipelineService');
const sessions = require('./sessionService');
const { canonicalJson } = require('./pipeline/ingestService');

const audit = (tx, actor, action, type, id, oldV, newV) => tx.query(
  'INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, old_values, new_values) VALUES (?, ?, ?, ?, ?, ?)',
  [actor, action, type, String(id), oldV ? JSON.stringify(oldV) : null, newV ? JSON.stringify(newV) : null]);

// ---------------------------------------------------------------------------
// overview
// ---------------------------------------------------------------------------
async function overview() {
  const c = await one(`SELECT
      (SELECT COUNT(*) FROM songs WHERE status = 'ACTIVE') AS active_songs,
      (SELECT COUNT(*) FROM songs WHERE status = 'PENDING_ANALYSIS') AS pending_songs,
      (SELECT COUNT(*) FROM songs WHERE status = 'HIDDEN') AS hidden_songs,
      (SELECT COUNT(*) FROM artists) AS artists, (SELECT COUNT(*) FROM albums) AS albums,
      (SELECT COUNT(*) FROM users WHERE is_active = 1) AS users,
      (SELECT COUNT(*) FROM listening_history WHERE started_at >= NOW() - INTERVAL 7 DAY) AS plays_7d,
      (SELECT COUNT(DISTINCT user_id) FROM listening_history WHERE started_at >= NOW() - INTERVAL 7 DAY) AS listeners_7d,
      (SELECT COUNT(*) FROM review_queue WHERE status = 'PENDING') AS pending_reviews,
      (SELECT COUNT(*) FROM pipeline_jobs WHERE status = 'FAILED') AS failed_jobs,
      (SELECT COUNT(*) FROM incognito_sessions WHERE status = 'ACTIVE' AND expires_at > NOW()) AS private_sessions`);
  return c;
}

/** Listening statistics for the admin dashboard (all from listening_history). */
async function listeningStats() {
  const [daily, topSongs, topUsers, moods, languages, origins] = await Promise.all([
    query(`WITH RECURSIVE cal AS (SELECT CURDATE() - INTERVAL 29 DAY AS d UNION ALL SELECT d + INTERVAL 1 DAY FROM cal WHERE d < CURDATE())
           SELECT cal.d AS day, COUNT(lh.play_id) AS plays, COUNT(DISTINCT lh.user_id) AS listeners,
                  ROUND(COALESCE(SUM(lh.listened_sec), 0) / 60) AS minutes
             FROM cal LEFT JOIN listening_history lh ON lh.started_at >= cal.d AND lh.started_at < cal.d + INTERVAL 1 DAY
            GROUP BY cal.d ORDER BY cal.d`),
    query(`SELECT sc.song_id AS id, sc.title, sc.artist_name AS artist, COUNT(*) AS plays, COUNT(DISTINCT lh.user_id) AS listeners,
                  ROUND(100 * AVG(lh.completed)) AS completionPct, ROUND(100 * AVG(lh.skipped)) AS skipPct
             FROM listening_history lh JOIN v_song_catalog sc ON sc.song_id = lh.song_id
            WHERE lh.started_at >= NOW() - INTERVAL 30 DAY
            GROUP BY sc.song_id, sc.title, sc.artist_name ORDER BY plays DESC LIMIT 10`),
    query(`SELECT up.display_name AS name, u.username, COUNT(*) AS plays, ROUND(SUM(lh.listened_sec) / 60) AS minutes
             FROM listening_history lh JOIN users u ON u.user_id = lh.user_id JOIN user_profiles up ON up.user_id = u.user_id
            WHERE lh.started_at >= NOW() - INTERVAL 30 DAY GROUP BY u.user_id, up.display_name, u.username ORDER BY minutes DESC LIMIT 8`),
    query(`SELECT pm.mood_name AS mood, pm.color_hex AS color, COUNT(*) AS plays,
                  ROUND(100 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS share
             FROM listening_history lh JOIN v_song_primary_mood pm ON pm.song_id = lh.song_id
            WHERE lh.skipped = 0 AND lh.started_at >= NOW() - INTERVAL 30 DAY
            GROUP BY pm.mood_name, pm.color_hex ORDER BY plays DESC`),
    query(`SELECT COALESCE(l.name, 'Instrumental') AS language, COUNT(*) AS plays
             FROM listening_history lh JOIN songs s ON s.song_id = lh.song_id LEFT JOIN languages l ON l.language_id = s.language_id
            WHERE lh.started_at >= NOW() - INTERVAL 30 DAY GROUP BY l.name ORDER BY plays DESC`),
    query(`SELECT origin, COUNT(*) AS plays FROM listening_history WHERE started_at >= NOW() - INTERVAL 30 DAY GROUP BY origin ORDER BY plays DESC`),
  ]);
  return { daily, topSongs, topUsers, moods, languages, origins };
}

// ---------------------------------------------------------------------------
// catalogue: songs
// ---------------------------------------------------------------------------
async function listSongs({ q = '', status = null, page = 1, pageSize = 25 }) {
  const where = ['1 = 1']; const params = [];
  if (status) { where.push('sc.status = ?'); params.push(status); }
  if (q) { where.push('(sc.title LIKE ? OR sc.artist_name LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM v_song_catalog sc WHERE ${where.join(' AND ')}`, params);
  const rows = await query(`SELECT sc.*, st.plays FROM v_song_catalog sc LEFT JOIN v_song_stats st ON st.song_id = sc.song_id
                             WHERE ${where.join(' AND ')} ORDER BY sc.song_id DESC LIMIT ? OFFSET ?`, [...params, pageSize, (page - 1) * pageSize]);
  return { total, page, pageSize, songs: rows.map((r) => ({ ...toSong(r), plays: r.plays })) };
}

async function references() {
  const [artists, albums, genres, languages, moods, categories, contexts, regions, films] = await Promise.all([
    query('SELECT artist_id AS id, name, disambiguation FROM artists ORDER BY name'),
    query(`SELECT al.album_id AS id, al.title, al.album_type AS type, a.name AS artist FROM albums al
             LEFT JOIN album_artists aa ON aa.album_id = al.album_id AND aa.credit_order = 1 LEFT JOIN artists a ON a.artist_id = aa.artist_id
            ORDER BY al.title`),
    query('SELECT genre_id AS id, name FROM genres ORDER BY name'),
    query('SELECT language_id AS id, name FROM languages ORDER BY name'),
    query('SELECT mood_id AS id, name, emoji, color_hex AS color FROM moods ORDER BY name'),
    query('SELECT category_id AS id, name, quadrant FROM mood_categories ORDER BY category_id'),
    query('SELECT code, name FROM contexts ORDER BY sort_order'),
    query("SELECT region_code AS code, name FROM regions ORDER BY country_code = 'XX', name"),
    query('SELECT film_id AS id, title, release_year AS year FROM films ORDER BY title'),
  ]);
  return { artists, albums, genres, languages, moods, categories, contexts, regions, films };
}

/**
 * Manual entry follows the same path as ingestion: a provenance row under the
 * MANUAL_ENTRY source, then the analysis stage makes the song ACTIVE.
 */
async function createSong(actor, s) {
  const { songId } = await withTransaction(async (tx) => {
    const src = await tx.one("SELECT source_id FROM music_sources WHERE code = 'MANUAL_ENTRY'");
    const sketch = await tx.one("SELECT source_id FROM music_sources WHERE code = 'MUSE_SKETCH'");
    const artist = await tx.one('SELECT artist_id, name FROM artists WHERE artist_id = ?', [s.artistId]);
    if (!artist) throw ApiError.notFound('Artist');
    const contentRating = s.explicit && s.contentRating === 'ALL' ? 'TEEN' : s.contentRating;
    const r = await tx.query(
      `INSERT INTO songs (title, version_label, primary_artist_id, album_id, track_number, duration_sec, release_year, language_id,
                          isrc, explicit, content_rating, popularity, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_ANALYSIS')`,
      [s.title, s.versionLabel || '', s.artistId, s.albumId || null, s.trackNumber || null, s.durationSec, s.releaseYear,
        s.languageId || null, s.isrc || null, s.explicit ? 1 : 0, contentRating, s.popularity]);
    await tx.query('INSERT INTO song_genres (song_id, genre_id, is_primary) VALUES (?, ?, 1)', [r.insertId, s.genreId]);
    if (sketch) {
      await tx.query("INSERT INTO song_media (song_id, source_id, media_type, rights_status, priority) VALUES (?, ?, 'GENERATED_SKETCH', 'PERMITTED', 50)",
        [r.insertId, sketch.source_id]);
    }
    const payload = { title: s.title, artist: artist.name, duration_sec: s.durationSec, release_year: s.releaseYear, isrc: s.isrc || null,
      analysis: s.features ? { ...s.features, segments: [] } : undefined };
    const json = canonicalJson(payload);
    await tx.query(
      `INSERT INTO source_records (source_id, entity_type, external_id, isrc, song_id, rights_status, payload, payload_hash, status,
                                   match_method, match_confidence, quality_score, processing_version)
       VALUES (?, 'SONG', ?, ?, ?, 'PERMITTED', ?, SHA2(?, 256), 'COMPLETED', 'MANUAL', 1, 1, '2.0')`,
      [src.source_id, `manual:${r.insertId}`, s.isrc || null, r.insertId, json, json]);
    await audit(tx, actor, 'SONG_CREATED', 'song', r.insertId, null, { title: s.title, artist_id: s.artistId });
    return { songId: r.insertId };
  }, { actorId: actor });
  if (s.features) await pipeline.analyzePending(null, { songIds: [songId], actorId: actor });
  return songDetailAdmin(songId);
}

async function songDetailAdmin(songId) {
  const row = await one('SELECT * FROM v_song_catalog WHERE song_id = ?', [songId]);
  if (!row) throw ApiError.notFound('Song');
  const [moods, curations] = await Promise.all([
    query('SELECT mood_id AS id, mood_name AS name, emoji, confidence FROM v_current_song_moods WHERE song_id = ? ORDER BY mood_rank', [songId]),
    query(`SELECT c.mood_id AS id, m.name, c.action, c.confidence, c.note, c.curated_at AS curatedAt, up.display_name AS curatedBy
             FROM song_mood_curations c JOIN moods m ON m.mood_id = c.mood_id LEFT JOIN user_profiles up ON up.user_id = c.curated_by
            WHERE c.song_id = ?`, [songId]),
  ]);
  return { ...toSong(row), albumId: row.album_id, genreId: row.genre_id, moodsDetailed: moods, curations };
}

const SONG_FIELDS = { title: 'title', versionLabel: 'version_label', albumId: 'album_id', durationSec: 'duration_sec',
  releaseYear: 'release_year', languageId: 'language_id', isrc: 'isrc', explicit: 'explicit', contentRating: 'content_rating',
  popularity: 'popularity', status: 'status' };

async function updateSong(actor, songId, patch) {
  await withTransaction(async (tx) => {
    const s = await tx.one('SELECT song_id, status FROM songs WHERE song_id = ? FOR UPDATE', [songId]);
    if (!s) throw ApiError.notFound('Song');
    if (s.status === 'MERGED') throw new ApiError(409, 'SONG_MERGED', 'A merged song cannot be edited; edit its canonical song.');
    const sets = []; const params = [];
    for (const [k, col] of Object.entries(SONG_FIELDS)) {
      if (patch[k] === undefined) continue;
      sets.push(`${col} = ?`);
      params.push(k === 'explicit' ? (patch[k] ? 1 : 0) : (patch[k] === '' ? null : patch[k]));
    }
    if (patch.explicit === true && patch.contentRating === undefined) sets.push("content_rating = IF(content_rating = 'ALL', 'TEEN', content_rating)");
    if (sets.length) await tx.query(`UPDATE songs SET ${sets.join(', ')} WHERE song_id = ?`, [...params, songId]);   // audited by trg_songs_au_audit
    if (patch.genreId) {
      await tx.query('DELETE FROM song_genres WHERE song_id = ? AND is_primary = 1', [songId]);
      await tx.query(`INSERT INTO song_genres (song_id, genre_id, is_primary) VALUES (?, ?, 1)
                      ON DUPLICATE KEY UPDATE is_primary = 1`, [songId, patch.genreId]);
    }
  }, { actorId: actor });
  return songDetailAdmin(songId);
}

/**
 * Songs with provenance or listening history are HIDDEN (kept for history and
 * audit); a song with neither is deleted outright.
 */
async function deleteSong(actor, songId) {
  return withTransaction(async (tx) => {
    const s = await tx.one(
      `SELECT s.song_id, s.title, s.status,
              (SELECT COUNT(*) FROM source_records sr WHERE sr.song_id = s.song_id) AS provenance,
              (SELECT COUNT(*) FROM listening_history lh WHERE lh.song_id = s.song_id) AS plays
         FROM songs s WHERE s.song_id = ? FOR UPDATE`, [songId]);
    if (!s) throw ApiError.notFound('Song');
    if (s.provenance > 0 || s.plays > 0) {
      await tx.query("UPDATE songs SET status = 'HIDDEN' WHERE song_id = ?", [songId]);
      return { songId, result: 'HIDDEN',
        message: `“${s.title}” has ${s.plays} plays and ${s.provenance} provenance records, so it was hidden instead of deleted. Its history stays intact.` };
    }
    await tx.query('DELETE FROM songs WHERE song_id = ?', [songId]);   // audited by trg_songs_ad_audit
    return { songId, result: 'DELETED', message: `“${s.title}” was deleted.` };
  }, { actorId: actor });
}

/** Curator mood decision: stored, then the active mood model is re-run for the song so it takes effect. */
async function curateMood(actor, songId, moodId, { action, confidence = null, note = null }) {
  if (action === 'ADD' && !confidence) throw ApiError.badRequest('confidence is required when adding a mood');
  await withTransaction(async (tx) => {
    const s = await tx.one('SELECT song_id, status FROM songs WHERE song_id = ?', [songId]);
    if (!s) throw ApiError.notFound('Song');
    const m = await tx.one('SELECT mood_id, name FROM moods WHERE mood_id = ?', [moodId]);
    if (!m) throw new ApiError(400, 'INVALID_MOOD', 'Unknown mood.');
    const before = await tx.one('SELECT action, confidence FROM song_mood_curations WHERE song_id = ? AND mood_id = ?', [songId, moodId]);
    await tx.query(
      `INSERT INTO song_mood_curations (song_id, mood_id, action, confidence, note, curated_by) VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE action = VALUES(action), confidence = VALUES(confidence), note = VALUES(note), curated_by = VALUES(curated_by)`,
      [songId, moodId, action, action === 'ADD' ? confidence : null, note, actor]);
    await audit(tx, actor, 'MOOD_CURATED', 'song', songId, before, { mood: m.name, action, confidence });
    const hasFeatures = await tx.one('SELECT 1 AS ok FROM audio_features WHERE song_id = ? AND is_current = 1', [songId]);
    if (hasFeatures) await tx.call('sp_analyze_song_moods', [await activeModel(tx, 'MOOD'), null, songId]);
  }, { actorId: actor });
  return songDetailAdmin(songId);
}

async function clearCuration(actor, songId, moodId) {
  await withTransaction(async (tx) => {
    const r = await tx.query('DELETE FROM song_mood_curations WHERE song_id = ? AND mood_id = ?', [songId, moodId]);
    if (!r.affectedRows) throw ApiError.notFound('Curation');
    await audit(tx, actor, 'MOOD_CURATION_CLEARED', 'song', songId, { mood_id: moodId }, null);
    const hasFeatures = await tx.one('SELECT 1 AS ok FROM audio_features WHERE song_id = ? AND is_current = 1', [songId]);
    if (hasFeatures) await tx.call('sp_analyze_song_moods', [await activeModel(tx, 'MOOD'), null, songId]);
  }, { actorId: actor });
  return songDetailAdmin(songId);
}

async function activeModel(tx, kind) {
  const m = await tx.one('SELECT model_id FROM intelligence_models WHERE kind = ? AND is_active = 1', [kind]);
  if (!m) throw new ApiError(409, 'NO_ACTIVE_MODEL', `No active ${kind} model.`);
  return m.model_id;
}

// ---------------------------------------------------------------------------
// artists, albums, moods, keywords
// ---------------------------------------------------------------------------
async function listArtists({ q = '' }) {
  return query(
    `SELECT a.artist_id AS id, a.name, a.disambiguation, a.artist_type AS type, a.country_code AS country, a.region_code AS region,
            l.name AS language, a.formed_year AS formedYear,
            (SELECT COUNT(*) FROM songs s WHERE s.primary_artist_id = a.artist_id) AS songs,
            (SELECT GROUP_CONCAT(alias SEPARATOR ', ') FROM artist_aliases al WHERE al.artist_id = a.artist_id) AS aliases
       FROM artists a LEFT JOIN languages l ON l.language_id = a.primary_language_id
      WHERE a.name LIKE ? ORDER BY a.name`, [`%${q}%`]);
}

async function createArtist(actor, a) {
  return withTransaction(async (tx) => {
    const r = await tx.query(
      `INSERT INTO artists (name, disambiguation, artist_type, country_code, region_code, primary_language_id, formed_year, bio)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [a.name, a.disambiguation || '', a.type, a.countryCode, a.regionCode || null, a.languageId || null, a.formedYear || null, a.bio || null]);
    for (const alias of a.aliases || []) {
      await tx.query("INSERT INTO artist_aliases (artist_id, alias, alias_type) VALUES (?, ?, 'SPELLING')", [r.insertId, alias]);
    }
    await audit(tx, actor, 'ARTIST_CREATED', 'artist', r.insertId, null, { name: a.name });
    return { id: r.insertId, name: a.name };
  }, { actorId: actor });
}

async function updateArtist(actor, artistId, a) {
  return withTransaction(async (tx) => {
    const before = await tx.one('SELECT name, bio, region_code, formed_year FROM artists WHERE artist_id = ? FOR UPDATE', [artistId]);
    if (!before) throw ApiError.notFound('Artist');
    const map = { name: 'name', disambiguation: 'disambiguation', type: 'artist_type', regionCode: 'region_code',
      languageId: 'primary_language_id', formedYear: 'formed_year', bio: 'bio' };
    const sets = []; const params = [];
    for (const [k, col] of Object.entries(map)) if (a[k] !== undefined) { sets.push(`${col} = ?`); params.push(a[k] === '' ? null : a[k]); }
    if (sets.length) await tx.query(`UPDATE artists SET ${sets.join(', ')} WHERE artist_id = ?`, [...params, artistId]);
    await audit(tx, actor, 'ARTIST_UPDATED', 'artist', artistId, before, a);
    return { id: artistId };
  }, { actorId: actor });
}

async function createAlbum(actor, a) {
  return withTransaction(async (tx) => {
    const r = await tx.query(
      `INSERT INTO albums (title, album_type, film_id, release_year, language_id, cover_color_1, cover_color_2)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [a.title, a.albumType, a.filmId || null, a.releaseYear, a.languageId || null, a.coverColor1, a.coverColor2]);
    for (const [i, artistId] of a.artistIds.entries()) {
      await tx.query('INSERT INTO album_artists (album_id, artist_id, credit_order) VALUES (?, ?, ?)', [r.insertId, artistId, i + 1]);
    }
    await audit(tx, actor, 'ALBUM_CREATED', 'album', r.insertId, null, { title: a.title, artists: a.artistIds });
    return { id: r.insertId, title: a.title };
  }, { actorId: actor });
}

/** New mood: stored, then the active mood model re-scores every song so the mood is immediately usable. */
async function createMood(actor, m) {
  const id = await withTransaction(async (tx) => {
    const r = await tx.query(
      `INSERT INTO moods (category_id, name, emoji, color_hex, description, target_energy, target_valence, target_danceability,
                          target_acousticness, target_instrumentalness, tempo_min, tempo_max)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [m.categoryId, m.name, m.emoji, m.colorHex, m.description, m.energy, m.valence, m.danceability, m.acousticness,
        m.instrumentalness, m.tempoMin, m.tempoMax]);
    await tx.query('INSERT INTO mood_keywords (phrase, mood_id, weight) VALUES (?, ?, 1)', [m.name.toLowerCase(), r.insertId]);
    await audit(tx, actor, 'MOOD_CREATED', 'mood', r.insertId, null, { name: m.name });
    if (m.reanalyze) await tx.call('sp_analyze_song_moods', [await activeModel(tx, 'MOOD'), null, null]);
    return r.insertId;
  }, { actorId: actor });
  moodParser.invalidate();
  const songs = await one('SELECT COUNT(*) AS n FROM v_current_song_moods WHERE mood_id = ?', [id]);
  return { id, name: m.name, songsTagged: songs.n };
}

async function addKeyword(actor, { phrase, moodId, weight }) {
  await withTransaction(async (tx) => {
    await tx.query('INSERT INTO mood_keywords (phrase, mood_id, weight) VALUES (?, ?, ?)', [phrase.toLowerCase(), moodId, weight]);
    await audit(tx, actor, 'KEYWORD_ADDED', 'mood_keyword', phrase.toLowerCase(), null, { mood_id: moodId, weight });
  }, { actorId: actor });
  moodParser.invalidate();
  return { phrase: phrase.toLowerCase(), moodId, weight };
}

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------
async function listUsers({ q = '' }) {
  return query(
    `SELECT u.user_id AS id, u.username, u.email, r.code AS role, u.is_active AS isActive, u.created_at AS createdAt,
            u.last_login_at AS lastLoginAt, p.display_name AS displayName, p.region_code AS region,
            vp.total_plays AS plays, vp.minutes_listened AS minutes, vp.favorite_genre AS favoriteGenre, vp.dominant_mood AS dominantMood,
            (u.locked_until IS NOT NULL AND u.locked_until > NOW()) AS locked
       FROM users u JOIN roles r ON r.role_id = u.role_id JOIN user_profiles p ON p.user_id = u.user_id
       LEFT JOIN v_user_music_profile vp ON vp.user_id = u.user_id
      WHERE u.username LIKE ? OR p.display_name LIKE ? OR u.email LIKE ?
      ORDER BY u.user_id`, [`%${q}%`, `%${q}%`, `%${q}%`]);
}

async function updateUser(actor, userId, { role, isActive }) {
  return withTransaction(async (tx) => {
    // lock only the users row (OF u): roles is read-only reference data for the app account
    const u = await tx.one('SELECT u.user_id, r.code AS role FROM users u JOIN roles r USING (role_id) WHERE u.user_id = ? FOR UPDATE OF u', [userId]);
    if (!u) throw ApiError.notFound('User');
    if (userId === actor && (role && role !== 'ADMIN' || isActive === false)) {
      throw new ApiError(409, 'SELF_LOCKOUT', 'You cannot remove your own admin access.');
    }
    if (u.role === 'ADMIN' && (role && role !== 'ADMIN' || isActive === false)) {
      // lock all admins so two concurrent demotions cannot leave zero admins
      const admins = await tx.query(`SELECT u.user_id FROM users u JOIN roles r USING (role_id)
                                      WHERE r.code = 'ADMIN' AND u.is_active = 1 FOR UPDATE OF u`);
      if (admins.length <= 1) throw new ApiError(409, 'LAST_ADMIN', 'At least one active admin must remain.');
    }
    if (role) {
      const r = await tx.one('SELECT role_id FROM roles WHERE code = ?', [role]);
      if (!r) throw new ApiError(400, 'INVALID_ROLE', 'Unknown role.');
      await tx.query('UPDATE users SET role_id = ? WHERE user_id = ?', [r.role_id, userId]);
    }
    if (isActive !== undefined) await tx.query('UPDATE users SET is_active = ? WHERE user_id = ?', [isActive ? 1 : 0, userId]);
    if (isActive === false) await sessions.revokeAll(userId, 'ADMIN_DEACTIVATED', { tx });   // signed out everywhere, at once
    return { id: userId, role: role || u.role, isActive };
  }, { actorId: actor });
}

// ---------------------------------------------------------------------------
// models (versioned, tunable)
// ---------------------------------------------------------------------------
async function models() {
  const rows = await query(
    `SELECT im.model_id AS id, im.kind, im.name, im.version, im.description, im.is_active AS isActive, im.created_at AS createdAt,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT('code', mp.param_code, 'value', mp.param_value, 'min', mp.min_value, 'max', mp.max_value,
                                              'description', mp.description))
               FROM model_parameters mp WHERE mp.model_id = im.model_id) AS params
       FROM intelligence_models im ORDER BY im.kind, im.version`);
  return rows.map((r) => ({ ...r, isActive: !!r.isActive,
    params: (typeof r.params === 'string' ? JSON.parse(r.params) : r.params || []).sort((a, b) => a.code.localeCompare(b.code)) }));
}

async function setParam(actor, modelId, code, value) {
  await withTransaction(async (tx) => {
    const p = await tx.one('SELECT min_value, max_value FROM model_parameters WHERE model_id = ? AND param_code = ? FOR UPDATE', [modelId, code]);
    if (!p) throw ApiError.notFound('Model parameter');
    if (value < Number(p.min_value) || value > Number(p.max_value)) {
      throw ApiError.badRequest(`value must be between ${Number(p.min_value)} and ${Number(p.max_value)}`);
    }
    await tx.query('UPDATE model_parameters SET param_value = ? WHERE model_id = ? AND param_code = ?', [value, modelId, code]);   // audited by trigger
  }, { actorId: actor });
  return models();
}

/** Switch the active version of a model kind (old versions and their outputs are kept). */
async function activateModel(actor, modelId) {
  await withTransaction(async (tx) => {
    const m = await tx.one('SELECT model_id, kind, name, version, is_active FROM intelligence_models WHERE model_id = ? FOR UPDATE', [modelId]);
    if (!m) throw ApiError.notFound('Model');
    if (m.is_active) return;
    if (m.kind === 'MOOD') {
      const n = await tx.one('SELECT COUNT(*) AS n FROM song_moods WHERE model_id = ?', [modelId]);
      if (!n.n) throw new ApiError(409, 'MODEL_NOT_RUN', 'This mood model has no analysis yet; run it before activating.');
    }
    const prev = await tx.one('SELECT model_id, version FROM intelligence_models WHERE kind = ? AND is_active = 1 FOR UPDATE', [m.kind]);
    // deactivate first, so the "one active per kind" unique key never sees two
    await tx.query('UPDATE intelligence_models SET is_active = 0 WHERE kind = ? AND is_active = 1', [m.kind]);
    await tx.query('UPDATE intelligence_models SET is_active = 1 WHERE model_id = ?', [modelId]);
    await audit(tx, actor, 'MODEL_ACTIVATED', 'model', modelId, prev ? { model_id: prev.model_id, version: prev.version } : null,
      { model_id: modelId, kind: m.kind, version: m.version });
  }, { actorId: actor });
  return models();
}

async function auditLog({ entityType = null, limit = 50 }) {
  return query(
    `SELECT a.audit_id AS id, a.action, a.entity_type AS entityType, a.entity_id AS entityId, a.old_values AS oldValues,
            a.new_values AS newValues, a.created_at AS createdAt, up.display_name AS actor
       FROM audit_logs a LEFT JOIN user_profiles up ON up.user_id = a.actor_user_id
      WHERE (? IS NULL OR a.entity_type = ?) ORDER BY a.audit_id DESC LIMIT ?`, [entityType, entityType, limit]);
}

module.exports = {
  overview, listeningStats, listSongs, references, createSong, songDetailAdmin, updateSong, deleteSong, curateMood, clearCuration,
  listArtists, createArtist, updateArtist, createAlbum, createMood, addKeyword, listUsers, updateUser, models, setParam, activateModel, auditLog,
};

// Mood-wise percentage ratings: how well a song fits each mood, 0–100, as judged by users.
//
// Four different numbers are kept apart on purpose (see docs/MOOD_RATINGS.md):
//   aiConfidence    song_moods.confidence via v_current_song_moods — the mood model's prediction (0–1)
//   mine            song_mood_ratings.match_percentage — the signed-in user's own judgement
//   average/count   v_song_mood_rating_stats — the plain average of all users' judgements
//   adjustedScore   a ranking score only (Bayesian shrinkage towards the mood's overall mean);
//                   never shown as if it were a user rating.
// User feedback never writes to song_moods, and a missing rating is "no data", not 0 %.
const { one, query, withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { toSong, withUserFlags } = require('./songMapper');
const { contentFilter } = require('./catalogService');

const MOOD_COLS = `m.mood_id AS id, m.name, m.emoji, m.color_hex AS color, mc.name AS category`;

function assertNotPrivate(user) {
  if (user.incognitoId) {
    throw new ApiError(409, 'INCOGNITO_ACTIVE', 'Mood ratings are paused in a private session so your profile stays unchanged.');
  }
}

/** The song must exist; listeners only see ACTIVE songs (curators may look at others). */
async function visibleSong(user, songId, { forWrite = false } = {}) {
  const s = await one('SELECT song_id, title, status FROM songs WHERE song_id = ?', [songId]);
  if (!s) throw ApiError.notFound('Song');
  if (s.status !== 'ACTIVE' && (forWrite || !user.permissions.has('catalog.write'))) throw ApiError.notFound('Song');
  return s;
}

const stat = (r) => (r && r.rating_count ? {
  average: Number(r.avg_match_percentage), count: Number(r.rating_count),
  min: Number(r.min_match_percentage), max: Number(r.max_match_percentage), lastRatedAt: r.last_rated_at,
} : null);

/** Every mood in the database with, for this song: AI confidence, the community average and the user's own rating. */
async function forSong(user, songId) {
  const song = await visibleSong(user, songId);
  const rows = await query(
    `SELECT ${MOOD_COLS},
            cm.confidence AS ai_confidence,
            st.rating_count, st.avg_match_percentage, st.min_match_percentage, st.max_match_percentage, st.last_rated_at,
            smr.match_percentage AS my_pct, smr.review_text AS my_review, smr.updated_at AS my_updated
       FROM moods m
       JOIN mood_categories mc ON mc.category_id = m.category_id
       LEFT JOIN v_current_song_moods cm ON cm.song_id = ? AND cm.mood_id = m.mood_id
       LEFT JOIN v_song_mood_rating_stats st ON st.song_id = ? AND st.mood_id = m.mood_id
       LEFT JOIN song_mood_ratings smr ON smr.user_id = ? AND smr.song_id = ? AND smr.mood_id = m.mood_id
      ORDER BY mc.category_id, m.mood_id`, [songId, songId, user.id, songId]);
  const totals = await one(
    'SELECT COUNT(*) AS ratings, COUNT(DISTINCT user_id) AS raters FROM song_mood_ratings WHERE song_id = ?', [songId]);
  return {
    songId: song.song_id,
    title: song.title,
    scale: { min: 0, max: 100, decimals: 2 },
    privateSession: !!user.incognitoId,
    totals: { ratings: Number(totals.ratings), raters: Number(totals.raters) },
    moods: rows.map((r) => ({
      id: r.id, name: r.name, emoji: r.emoji, color: r.color, category: r.category,
      aiConfidence: r.ai_confidence === null ? null : Number(r.ai_confidence),
      community: stat(r),
      mine: r.my_pct === null ? null : { matchPercentage: Number(r.my_pct), reviewText: r.my_review, updatedAt: r.my_updated },
    })),
  };
}

/**
 * Save one or more mood ratings for a song in ONE transaction (all or none).
 * mode 'create': a rating that already exists is a 409 DUPLICATE_MOOD_RATING (the primary key rejects it).
 * mode 'upsert': create or replace (match_percentage and review_text are both set from the request).
 */
async function save(user, songId, items, mode = 'upsert') {
  assertNotPrivate(user);
  await visibleSong(user, songId, { forWrite: true });
  const ids = items.map((i) => i.moodId);
  if (new Set(ids).size !== ids.length) throw ApiError.badRequest('Each mood may appear only once per request.');
  const known = await query('SELECT mood_id FROM moods WHERE mood_id IN (?)', [ids]);
  const missing = ids.filter((id) => !known.some((k) => k.mood_id === id));
  if (missing.length) throw new ApiError(404, 'NOT_FOUND', `Mood not found: ${missing.join(', ')}.`, { moodIds: missing });

  return withTransaction(async (tx) => {
    // serialise this user's writes (same lock the other feedback paths take)
    await tx.query('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', [user.id]);
    const before = await tx.query(
      'SELECT mood_id, match_percentage FROM song_mood_ratings WHERE user_id = ? AND song_id = ? AND mood_id IN (?) FOR UPDATE',
      [user.id, songId, ids]);
    const prev = new Map(before.map((r) => [r.mood_id, Number(r.match_percentage)]));
    for (const it of items) {
      const params = [user.id, songId, it.moodId, it.matchPercentage, it.reviewText || null];
      if (mode === 'create') {
        await tx.query('INSERT INTO song_mood_ratings (user_id, song_id, mood_id, match_percentage, review_text) VALUES (?, ?, ?, ?, ?)', params);
      } else {
        await tx.query(
          `INSERT INTO song_mood_ratings (user_id, song_id, mood_id, match_percentage, review_text) VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE match_percentage = VALUES(match_percentage), review_text = VALUES(review_text)`, params);
      }
    }
    const agg = await tx.query(
      `SELECT mood_id, COUNT(*) AS rating_count, ROUND(AVG(match_percentage), 2) AS avg_match_percentage,
              MIN(match_percentage) AS min_match_percentage, MAX(match_percentage) AS max_match_percentage, MAX(updated_at) AS last_rated_at
         FROM song_mood_ratings WHERE song_id = ? AND mood_id IN (?) GROUP BY mood_id`, [songId, ids]);
    const aggBy = new Map(agg.map((r) => [r.mood_id, stat(r)]));
    return {
      songId,
      saved: items.map((it) => ({
        moodId: it.moodId, matchPercentage: it.matchPercentage, reviewText: it.reviewText || null,
        created: !prev.has(it.moodId), previous: prev.has(it.moodId) ? prev.get(it.moodId) : null,
        community: aggBy.get(it.moodId) || null,
      })),
    };
  });
}

async function remove(user, songId, moodId) {
  assertNotPrivate(user);
  const r = await query('DELETE FROM song_mood_ratings WHERE user_id = ? AND song_id = ? AND mood_id = ?', [user.id, songId, moodId]);
  if (!r.affectedRows) throw ApiError.notFound('Mood rating');
  return { songId, moodId, removed: true };
}

/** The signed-in user's own mood ratings, newest first (optionally for one song). */
async function mine(user, { songId = null, page = 1, pageSize = 50 }) {
  const where = ['smr.user_id = ?'];
  const params = [user.id];
  if (songId) { where.push('smr.song_id = ?'); params.push(songId); }
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM song_mood_ratings smr WHERE ${where.join(' AND ')}`, params);
  const rows = await query(
    `SELECT smr.song_id, s.title, a.name AS artist_name, smr.mood_id, m.name AS mood_name, m.emoji, m.color_hex,
            smr.match_percentage, smr.review_text, smr.created_at, smr.updated_at
       FROM song_mood_ratings smr
       JOIN songs s ON s.song_id = smr.song_id
       JOIN artists a ON a.artist_id = s.primary_artist_id
       JOIN moods m ON m.mood_id = smr.mood_id
      WHERE ${where.join(' AND ')}
      ORDER BY smr.updated_at DESC, smr.song_id, smr.mood_id
      LIMIT ? OFFSET ?`, [...params, pageSize, (page - 1) * pageSize]);
  return {
    total: Number(total), page, pageSize,
    ratings: rows.map((r) => ({
      songId: r.song_id, title: r.title, artist: r.artist_name,
      mood: { id: r.mood_id, name: r.mood_name, emoji: r.emoji, color: r.color_hex },
      matchPercentage: Number(r.match_percentage), reviewText: r.review_text, createdAt: r.created_at, updatedAt: r.updated_at,
    })),
  };
}

/**
 * Songs ranked by how well users say they fit one mood.
 *   rank 'average'  — by the plain average of user ratings
 *   rank 'adjusted' — by a Bayesian average: (C·M + n·avg) / (C + n), where M is this mood's mean over all
 *                     ratings and C (`prior`) is how many "virtual" ratings at M every song starts with.
 *                     It pulls songs with few ratings towards the mood's mean; it is a ranking aid,
 *                     not a statistical guarantee. With C = 0 it equals the plain average.
 * Songs with fewer than `minRatings` ratings are left out (and counted). Songs nobody has rated for this
 * mood are never treated as 0 %: they are counted, and listed separately only when includeUnrated is set.
 * Ties break by rating count (more first), then song id — so the order is deterministic.
 */
async function topForMood(user, moodId, { page = 1, limit = 20, minRatings = 1, rank = 'average', prior = 5, includeUnrated = false }) {
  const mood = await one(`SELECT ${MOOD_COLS} FROM moods m JOIN mood_categories mc ON mc.category_id = m.category_id WHERE m.mood_id = ?`, [moodId]);
  if (!mood) throw ApiError.notFound('Mood');
  const [cf] = contentFilter(user);
  const meanRow = await one(
    'SELECT ROUND(AVG(match_percentage), 2) AS mean, COUNT(*) AS n FROM song_mood_ratings smr JOIN songs s ON s.song_id = smr.song_id WHERE smr.mood_id = ? AND s.status = \'ACTIVE\'', [moodId]);
  const mean = meanRow.n ? Number(meanRow.mean) : null;
  const C = rank === 'adjusted' ? prior : 0;
  const adjustedExpr = mean === null ? 'NULL'
    : '(? * ? + st.rating_count * st.avg_match_percentage) / (? + st.rating_count)';
  const adjParams = mean === null ? [] : [C, mean, C];
  const orderBy = rank === 'adjusted' && mean !== null
    ? 'adjusted_score DESC, st.rating_count DESC, sc.song_id ASC'
    : 'st.avg_match_percentage DESC, st.rating_count DESC, sc.song_id ASC';

  const base = `FROM v_song_mood_rating_stats st
                JOIN v_song_catalog sc ON sc.song_id = st.song_id
               WHERE st.mood_id = ? AND sc.status = 'ACTIVE'${cf}`;
  const [{ total }] = await query(`SELECT COUNT(*) AS total ${base} AND st.rating_count >= ?`, [moodId, minRatings]);
  const [{ below }] = await query(`SELECT COUNT(*) AS below ${base} AND st.rating_count < ?`, [moodId, minRatings]);
  const rows = await query(
    `SELECT sc.*, st.rating_count, st.avg_match_percentage, st.min_match_percentage, st.max_match_percentage, st.last_rated_at,
            ${adjustedExpr} AS adjusted_score, cm.confidence AS ai_confidence
       ${base.replace('WHERE', 'LEFT JOIN v_current_song_moods cm ON cm.song_id = st.song_id AND cm.mood_id = st.mood_id\n               WHERE')}
        AND st.rating_count >= ?
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?`, [...adjParams, moodId, minRatings, limit, (page - 1) * limit]);
  const songs = (await withUserFlags(user.id, rows.map(toSong))).map((s, i) => ({
    ...s,
    moodRating: {
      average: Number(rows[i].avg_match_percentage),
      count: Number(rows[i].rating_count),
      min: Number(rows[i].min_match_percentage),
      max: Number(rows[i].max_match_percentage),
      adjustedScore: rows[i].adjusted_score === null || rank !== 'adjusted' ? null : Math.round(Number(rows[i].adjusted_score) * 100) / 100,
      aiConfidence: rows[i].ai_confidence === null ? null : Number(rows[i].ai_confidence),
    },
  }));

  const unratedWhere = `sc.status = 'ACTIVE'${cf}
     AND NOT EXISTS (SELECT 1 FROM song_mood_ratings x WHERE x.song_id = sc.song_id AND x.mood_id = ?)`;
  const [{ unratedCount }] = await query(`SELECT COUNT(*) AS unratedCount FROM v_song_catalog sc WHERE ${unratedWhere}`, [moodId]);
  let unrated;
  if (includeUnrated) {
    // no user feedback yet: ordered by the AI's prediction for this mood, then popularity — clearly labelled as such
    const u = await query(
      `SELECT sc.*, cm.confidence AS ai_confidence FROM v_song_catalog sc
         LEFT JOIN v_current_song_moods cm ON cm.song_id = sc.song_id AND cm.mood_id = ?
        WHERE ${unratedWhere}
        ORDER BY cm.confidence IS NULL, cm.confidence DESC, sc.popularity DESC, sc.song_id ASC
        LIMIT ?`, [moodId, moodId, limit]);
    unrated = (await withUserFlags(user.id, u.map(toSong))).map((s, i) => ({
      ...s, moodRating: { average: null, count: 0, aiConfidence: u[i].ai_confidence === null ? null : Number(u[i].ai_confidence) },
    }));
  }
  return {
    mood,
    ranking: rank,
    prior: rank === 'adjusted' ? { weight: C, mean } : null,
    minRatings,
    page, limit, total: Number(total),
    belowMinimumCount: Number(below),
    unratedCount: Number(unratedCount),
    songs,
    ...(includeUnrated ? { unrated } : {}),
  };
}

module.exports = { forSong, save, remove, mine, topForMood };

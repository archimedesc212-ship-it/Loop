// Cold start. A new listener answers a few useful questions; the answers
// become onboarding_weight on the preference tables. sp_refresh_user_preferences
// blends them with behaviour:  blended = evidence·behaviour + (1 − evidence)·onboarding,
// where evidence grows with completed plays — so onboarding assumptions fade
// out as real listening accumulates. Region is stored as a signal only.
const { query, one, withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');

async function options(userId = null) {
  const [languages, regions, genres, moods, contexts, artists, composers] = await Promise.all([
    query(`SELECT l.language_id AS id, l.name, l.native_name AS nativeName,
                  (SELECT COUNT(*) FROM songs s WHERE s.language_id = l.language_id AND s.status = 'ACTIVE') AS songs
             FROM languages l ORDER BY l.name`),
    query("SELECT region_code AS code, name FROM regions ORDER BY country_code = 'XX', name"),
    query(`SELECT g.genre_id AS id, g.name, g.color_hex AS color, pg.name AS parent
             FROM genres g LEFT JOIN genres pg ON pg.genre_id = g.parent_genre_id ORDER BY g.name`),
    query('SELECT mood_id AS id, name, emoji, color_hex AS color FROM moods ORDER BY mood_id'),
    query('SELECT code, name, emoji, description FROM contexts ORDER BY sort_order'),
    // artists ordered by listeners so the most familiar names come first
    query(`SELECT a.artist_id AS id, a.name, l.name AS language,
                  (SELECT COUNT(DISTINCT lh.user_id) FROM listening_history lh JOIN songs s ON s.song_id = lh.song_id
                    WHERE s.primary_artist_id = a.artist_id) AS listeners
             FROM artists a LEFT JOIN languages l ON l.language_id = a.primary_language_id
            WHERE EXISTS (SELECT 1 FROM songs s WHERE s.primary_artist_id = a.artist_id AND s.status = 'ACTIVE')
            ORDER BY listeners DESC, a.name LIMIT 24`),
    // composers / film music: composer artists and anyone credited as COMPOSER, with the films they scored
    query(`SELECT a.artist_id AS id, a.name, l.name AS language,
                  (SELECT GROUP_CONCAT(DISTINCT f.title ORDER BY f.release_year DESC SEPARATOR ', ')
                     FROM songs s LEFT JOIN song_artists sa ON sa.song_id = s.song_id AND sa.artist_id = a.artist_id AND sa.role = 'COMPOSER'
                     JOIN albums al ON al.album_id = s.album_id JOIN films f ON f.film_id = al.film_id
                    WHERE s.status = 'ACTIVE' AND (s.primary_artist_id = a.artist_id OR sa.artist_id IS NOT NULL)) AS films
             FROM artists a LEFT JOIN languages l ON l.language_id = a.primary_language_id
            WHERE a.artist_type = 'COMPOSER'
               OR EXISTS (SELECT 1 FROM song_artists sa JOIN songs s ON s.song_id = sa.song_id
                           WHERE sa.artist_id = a.artist_id AND sa.role = 'COMPOSER' AND s.status = 'ACTIVE')
            ORDER BY a.name LIMIT 24`),
  ]);
  return { languages, regions, genres, moods, contexts, artists, composers, habits: ['BACKGROUND', 'ACTIVE', 'MIXED'],
    current: userId ? await current(userId) : null };
}

/** The listener's saved onboarding answers (to pre-fill "Redo onboarding"). */
async function current(userId) {
  const [langs, genres, artists, moods, contexts, profile] = await Promise.all([
    query('SELECT language_id AS id FROM user_languages WHERE user_id = ? ORDER BY priority', [userId]),
    query('SELECT genre_id AS id FROM user_genre_preferences WHERE user_id = ? AND onboarding_weight > 0 ORDER BY onboarding_weight DESC', [userId]),
    query(`SELECT uap.artist_id AS id, a.artist_type AS type FROM user_artist_preferences uap JOIN artists a ON a.artist_id = uap.artist_id
            WHERE uap.user_id = ? AND uap.onboarding_weight > 0 ORDER BY uap.onboarding_weight DESC`, [userId]),
    query('SELECT mood_id AS id FROM user_mood_preferences WHERE user_id = ? AND onboarding_weight > 0 ORDER BY onboarding_weight DESC', [userId]),
    query(`SELECT c.code FROM user_context_preferences ucp JOIN contexts c ON c.context_id = ucp.context_id
            WHERE ucp.user_id = ? AND ucp.onboarding_weight > 0 ORDER BY ucp.onboarding_weight DESC`, [userId]),
    one('SELECT region_code, listening_habit, content_filter, onboarding_completed_at FROM user_profiles WHERE user_id = ?', [userId]),
  ]);
  if (!profile || !profile.onboarding_completed_at) return null;
  return {
    languageIds: langs.map((x) => x.id), genreIds: genres.map((x) => x.id),
    artistIds: artists.filter((x) => x.type !== 'COMPOSER').map((x) => x.id),
    composerIds: artists.filter((x) => x.type === 'COMPOSER').map((x) => x.id),
    moodIds: moods.map((x) => x.id), contextCodes: contexts.map((x) => x.code),
    regionCode: profile.region_code || '', listeningHabit: profile.listening_habit || 'MIXED', contentFilter: profile.content_filter,
  };
}

/**
 * Save onboarding answers atomically and recompute the blended scores.
 * Order of a list = strength: the first pick gets weight 1.0, then 0.85, 0.7 …
 */
async function save(userId, a) {
  const rank = (i) => Math.max(0.4, Math.round((1 - i * 0.15) * 100) / 100);
  if (a.regionCode && !(await one('SELECT 1 AS ok FROM regions WHERE region_code = ?', [a.regionCode]))) {
    throw new ApiError(400, 'INVALID_REGION', 'Unknown region.');
  }
  await withTransaction(async (tx) => {
    await tx.query('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', [userId]);
    await tx.query(
      `UPDATE user_profiles SET region_code = ?, listening_habit = ?, content_filter = COALESCE(?, content_filter),
              onboarding_completed_at = COALESCE(onboarding_completed_at, NOW()) WHERE user_id = ?`,
      [a.regionCode || null, a.listeningHabit || null, a.contentFilter || null, userId]);

    await tx.query('DELETE FROM user_languages WHERE user_id = ?', [userId]);
    for (const [i, id] of a.languageIds.entries()) {
      await tx.query('INSERT INTO user_languages (user_id, language_id, priority) VALUES (?, ?, ?)', [userId, id, i + 1]);
    }
    // reset previous onboarding answers, keep behaviour columns untouched
    await tx.query('UPDATE user_genre_preferences SET onboarding_weight = 0 WHERE user_id = ?', [userId]);
    await tx.query('UPDATE user_artist_preferences SET onboarding_weight = 0 WHERE user_id = ?', [userId]);
    await tx.query('UPDATE user_mood_preferences SET onboarding_weight = 0 WHERE user_id = ?', [userId]);
    await tx.query('UPDATE user_context_preferences SET onboarding_weight = 0 WHERE user_id = ?', [userId]);
    for (const [i, id] of a.genreIds.entries()) {
      await tx.query(`INSERT INTO user_genre_preferences (user_id, genre_id, onboarding_weight) VALUES (?, ?, ?)
                      ON DUPLICATE KEY UPDATE onboarding_weight = VALUES(onboarding_weight)`, [userId, id, rank(i)]);
    }
    for (const [i, id] of a.artistIds.entries()) {
      await tx.query(`INSERT INTO user_artist_preferences (user_id, artist_id, onboarding_weight) VALUES (?, ?, ?)
                      ON DUPLICATE KEY UPDATE onboarding_weight = VALUES(onboarding_weight)`, [userId, id, rank(i)]);
    }
    // composers chosen on the "film music" step: artist affinity, slightly below named favourites
    for (const [i, id] of (a.composerIds || []).entries()) {
      await tx.query(`INSERT INTO user_artist_preferences (user_id, artist_id, onboarding_weight) VALUES (?, ?, ?)
                      ON DUPLICATE KEY UPDATE onboarding_weight = GREATEST(onboarding_weight, VALUES(onboarding_weight))`, [userId, id, Math.round(rank(i) * 90) / 100]);
    }
    for (const [i, id] of a.moodIds.entries()) {
      await tx.query(`INSERT INTO user_mood_preferences (user_id, mood_id, onboarding_weight) VALUES (?, ?, ?)
                      ON DUPLICATE KEY UPDATE onboarding_weight = VALUES(onboarding_weight)`, [userId, id, rank(i)]);
    }
    for (const [i, code] of a.contextCodes.entries()) {
      const c = await tx.one('SELECT context_id FROM contexts WHERE code = ?', [code]);
      if (!c) throw new ApiError(400, 'INVALID_CONTEXT', `Unknown context "${code}".`);
      await tx.query(`INSERT INTO user_context_preferences (user_id, context_id, onboarding_weight) VALUES (?, ?, ?)
                      ON DUPLICATE KEY UPDATE onboarding_weight = VALUES(onboarding_weight)`, [userId, c.context_id, rank(i)]);
    }
    await tx.call('sp_refresh_user_preferences_core', [userId]);
  });
  return { saved: true };
}

/** Settings page: the same profile fields, editable any time. */
async function updateSettings(userId, s) {
  if (s.regionCode && !(await one('SELECT 1 AS ok FROM regions WHERE region_code = ?', [s.regionCode]))) {
    throw new ApiError(400, 'INVALID_REGION', 'Unknown region.');
  }
  await withTransaction(async (tx) => {
    const sets = [];
    const params = [];
    if (s.displayName !== undefined) { sets.push('display_name = ?'); params.push(s.displayName); }
    if (s.regionCode !== undefined) { sets.push('region_code = ?'); params.push(s.regionCode || null); }
    if (s.contentFilter !== undefined) { sets.push('content_filter = ?'); params.push(s.contentFilter); }
    if (s.listeningHabit !== undefined) { sets.push('listening_habit = ?'); params.push(s.listeningHabit || null); }
    if (sets.length) await tx.query(`UPDATE user_profiles SET ${sets.join(', ')} WHERE user_id = ?`, [...params, userId]);
    if (s.languageIds) {
      await tx.query('DELETE FROM user_languages WHERE user_id = ?', [userId]);
      for (const [i, id] of s.languageIds.entries()) {
        await tx.query('INSERT INTO user_languages (user_id, language_id, priority) VALUES (?, ?, ?)', [userId, id, i + 1]);
      }
    }
  });
  return { saved: true };
}

module.exports = { options, save, updateSettings };

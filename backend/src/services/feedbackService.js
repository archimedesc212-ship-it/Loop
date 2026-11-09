// Ratings and likes: explicit permanent signals. Paused in private sessions,
// because they would change permanent intelligence.
const { one, query, withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');

function assertNotPrivate(user) {
  if (user.incognitoId) {
    throw new ApiError(409, 'INCOGNITO_ACTIVE', 'Ratings and likes are paused in a private session so your profile stays unchanged.');
  }
}

async function assertSong(songId) {
  const s = await one("SELECT song_id FROM songs WHERE song_id = ? AND status = 'ACTIVE'", [songId]);
  if (!s) throw ApiError.notFound('Song');
}

/** Rating + preference refresh in one transaction (both succeed or neither). */
// mode 'upsert' (PUT: set or change) or 'create' (POST: a second rating is a 409 DUPLICATE_RATING)
async function rate(user, songId, rating, mode = 'upsert') {
  assertNotPrivate(user);
  await assertSong(songId);
  return withTransaction(async (tx) => {
    await tx.query('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', [user.id]);
    const before = await tx.one('SELECT rating FROM ratings WHERE user_id = ? AND song_id = ?', [user.id, songId]);
    if (mode === 'create') {
      await tx.query('INSERT INTO ratings (user_id, song_id, rating) VALUES (?, ?, ?)', [user.id, songId, rating]);   // PK rejects a second rating
    } else {
      await tx.query(`INSERT INTO ratings (user_id, song_id, rating) VALUES (?, ?, ?)
                      ON DUPLICATE KEY UPDATE rating = VALUES(rating)`, [user.id, songId, rating]);
    }
    await tx.call('sp_refresh_user_preferences_core', [user.id]);
    const agg = await tx.one('SELECT ROUND(AVG(rating), 2) AS avg, COUNT(*) AS n FROM ratings WHERE song_id = ?', [songId]);
    return { songId, rating, previous: before ? before.rating : null, songAverage: agg.avg, ratingCount: agg.n };
  });
}

async function unrate(user, songId) {
  assertNotPrivate(user);
  return withTransaction(async (tx) => {
    await tx.query('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', [user.id]);
    const r = await tx.query('DELETE FROM ratings WHERE user_id = ? AND song_id = ?', [user.id, songId]);
    if (!r.affectedRows) throw ApiError.notFound('Rating');
    await tx.call('sp_refresh_user_preferences_core', [user.id]);
    return { songId, rating: null };
  });
}

async function like(user, songId, liked) {
  assertNotPrivate(user);
  await assertSong(songId);
  return withTransaction(async (tx) => {
    await tx.query('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', [user.id]);
    if (liked) await tx.query('INSERT IGNORE INTO user_likes (user_id, song_id) VALUES (?, ?)', [user.id, songId]);
    else await tx.query('DELETE FROM user_likes WHERE user_id = ? AND song_id = ?', [user.id, songId]);
    await tx.call('sp_refresh_user_preferences_core', [user.id]);
    return { songId, liked };
  });
}

/**
 * "Not for me": the song is left out of every future recommendation list for this
 * listener (sp_generate_recommendations filters song_dismissals). Undo with undismiss.
 */
async function dismiss(user, songId, batchId = null) {
  assertNotPrivate(user);
  await assertSong(songId);
  if (batchId) {
    const b = await one('SELECT user_id FROM recommendation_batches WHERE batch_id = ?', [batchId]);
    if (!b || b.user_id !== user.id) batchId = null;   // never link to someone else's list
  }
  await query(
    `INSERT INTO song_dismissals (user_id, song_id, batch_id) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE dismissed_at = NOW(), batch_id = COALESCE(VALUES(batch_id), batch_id)`, [user.id, songId, batchId]);
  return { songId, dismissed: true };
}

async function undismiss(user, songId) {
  assertNotPrivate(user);
  const r = await query('DELETE FROM song_dismissals WHERE user_id = ? AND song_id = ?', [user.id, songId]);
  return { songId, dismissed: false, changed: r.affectedRows > 0 };
}

async function dismissed(user) {
  return query(
    `SELECT sc.*, sd.dismissed_at FROM song_dismissals sd JOIN v_song_catalog sc ON sc.song_id = sd.song_id
      WHERE sd.user_id = ? ORDER BY sd.dismissed_at DESC LIMIT 200`, [user.id]);
}

module.exports = { rate, unrate, like, dismiss, undismiss, dismissed };

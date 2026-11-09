// Private (incognito) sessions.
// PERMANENT PROFILE --(read only)--> INCOGNITO SESSION --> TEMPORARY MEMORY --> SESSION RECOMMENDATIONS
// Nothing here ever writes to listening_history, preference tables, ratings or likes.
const { query, one, withTransaction } = require('../config/db');
const { jobs } = require('../config/env');
const ApiError = require('../utils/ApiError');
const playback = require('./playbackService');

async function status(user) {
  const s = await one(
    `SELECT i.incognito_id, i.started_at, i.expires_at, i.current_mood_id, m.name AS mood_name, m.emoji,
            TIMESTAMPDIFF(SECOND, NOW(), i.expires_at) AS seconds_left,
            (SELECT COUNT(*) FROM incognito_events e WHERE e.incognito_id = i.incognito_id) AS events
       FROM incognito_sessions i LEFT JOIN moods m ON m.mood_id = i.current_mood_id
      WHERE i.user_id = ? AND i.status = 'ACTIVE' AND i.expires_at > NOW()`, [user.id]);
  if (!s) return { active: false };
  const memory = await query(
    `SELECT vm.dimension, vm.ref_id, ROUND(vm.score, 2) AS score, vm.events,
            CASE vm.dimension WHEN 'GENRE' THEN (SELECT name FROM genres WHERE genre_id = vm.ref_id)
                              WHEN 'ARTIST' THEN (SELECT name FROM artists WHERE artist_id = vm.ref_id)
                              ELSE (SELECT name FROM moods WHERE mood_id = vm.ref_id) END AS name
       FROM v_incognito_memory vm WHERE vm.incognito_id = ? ORDER BY vm.dimension, vm.score DESC`, [s.incognito_id]);
  const recentSongs = await query(
    `SELECT e.song_id, sc.title, sc.artist_name, e.listened_sec, e.completed, e.skipped, e.occurred_at
       FROM incognito_events e JOIN v_song_catalog sc ON sc.song_id = e.song_id
      WHERE e.incognito_id = ? ORDER BY e.event_id DESC LIMIT 10`, [s.incognito_id]);
  return {
    active: true, id: s.incognito_id, startedAt: s.started_at, expiresAt: s.expires_at, secondsLeft: s.seconds_left,
    mood: s.current_mood_id ? { id: s.current_mood_id, name: s.mood_name, emoji: s.emoji } : null, events: s.events,
    memory: ['GENRE', 'ARTIST', 'MOOD'].map((d) => ({ dimension: d, items: memory.filter((m) => m.dimension === d).slice(0, 5) })),
    recentSongs,
  };
}

async function start(user, { moodId = null } = {}) {
  if (user.incognitoId) throw new ApiError(409, 'INCOGNITO_ACTIVE', 'A private session is already active.');
  if (moodId && !(await one('SELECT 1 AS ok FROM moods WHERE mood_id = ?', [moodId]))) throw new ApiError(400, 'INVALID_MOOD', 'Unknown mood.');
  // fold the current permanent session into the profile before going private
  await playback.closeOpenSessions(user.id);
  await query('INSERT INTO incognito_sessions (user_id, current_mood_id, expires_at) VALUES (?, ?, NOW() + INTERVAL ? MINUTE)',
    [user.id, moodId, jobs.incognitoTtlMinutes]);
  return status({ ...user });
}

async function setMood(user, moodId) {
  if (!user.incognitoId) throw new ApiError(409, 'NOT_PRIVATE', 'No private session is active.');
  await query('UPDATE incognito_sessions SET current_mood_id = ? WHERE incognito_id = ?', [moodId, user.incognitoId]);
  return status(user);
}

/** End now: the session's temporary memory and recommendation lists are deleted immediately. */
async function end(user) {
  if (!user.incognitoId) throw new ApiError(409, 'NOT_PRIVATE', 'No private session is active.');
  const purged = await withTransaction(async (tx) => {
    await tx.query("UPDATE incognito_sessions SET status = 'ENDED', ended_at = NOW() WHERE incognito_id = ? AND status = 'ACTIVE'", [user.incognitoId]);
    const ev = await tx.query('DELETE FROM incognito_events WHERE incognito_id = ?', [user.incognitoId]);
    const rb = await tx.query('DELETE FROM recommendation_batches WHERE incognito_id = ?', [user.incognitoId]);
    return { events: ev.affectedRows, lists: rb.affectedRows };
  });
  return { active: false, purged };
}

module.exports = { status, start, setMood, end };

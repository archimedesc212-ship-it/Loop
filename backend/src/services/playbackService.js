// Listening sessions, plays and playback events.
// Permanent mode writes listening_sessions / listening_history / playback_events
// and refreshes the user's preferences in the same transaction.
// Private (incognito) mode writes ONLY incognito_events. The database itself
// rejects permanent history while a private session is active (trg_lh_bi).
const { query, one, withTransaction } = require('../config/db');
const { jobs } = require('../config/env');
const ApiError = require('../utils/ApiError');
const media = require('./mediaService');

const ORIGINS = ['HOME', 'MOOD', 'CONTEXT', 'WORLD', 'SEARCH', 'PLAYLIST', 'LIBRARY', 'SMART_PLAYLIST'];

async function activeSong(songId) {
  const s = await one('SELECT song_id, title, duration_sec, status, explicit, content_rating, isrc FROM songs WHERE song_id = ?', [songId]);
  if (!s) throw ApiError.notFound('Song');
  if (s.status !== 'ACTIVE') throw new ApiError(409, 'NOT_PLAYABLE', 'This song is not available to play.');
  return s;
}

/** The song plus the first working permitted media source (see mediaService). */
async function playableSong(songId, opts) {
  const s = await activeSong(songId);
  const m = await media.resolve(s, opts);
  if (!m) throw new ApiError(409, 'NO_PLAYBACK_SOURCE', 'This song has metadata only — no permitted audio source is available for it.');
  return { ...s, media: m };
}

function contentAllowed(user, song) {
  if (user.contentFilter === 'OFF') return true;
  if (song.explicit) return false;
  return user.contentFilter === 'NO_EXPLICIT' || song.content_rating === 'ALL';
}

/** Start a play. Returns a handle the player uses for events and finish. */
async function start(user, { songId, origin = 'HOME', batchId = null, contextCode = null }) {
  if (!ORIGINS.includes(origin)) throw ApiError.badRequest(`origin must be one of: ${ORIGINS.join(', ')}`);
  const base = await activeSong(songId);
  if (!contentAllowed(user, base)) throw new ApiError(403, 'CONTENT_FILTERED', 'Your content filter hides this song. Change it in Settings.');
  const song = await playableSong(songId, { user });

  if (user.incognitoId) {
    return { private: true, playId: null, incognitoId: user.incognitoId, song: { id: song.song_id, durationSec: song.duration_sec }, media: song.media };
  }

  const ctx = contextCode ? await one('SELECT context_id FROM contexts WHERE code = ?', [contextCode]) : null;
  if (contextCode && !ctx) throw new ApiError(400, 'INVALID_CONTEXT', `Unknown context "${contextCode}".`);

  return withTransaction(async (tx) => {
    // Find the user's open session (idle less than SESSION_IDLE_MINUTES) or start one.
    let session = await tx.one(
      `SELECT session_id, context_id FROM listening_sessions
        WHERE user_id = ? AND status = 'OPEN' AND last_activity_at >= NOW() - INTERVAL ? MINUTE
        ORDER BY session_id DESC LIMIT 1 FOR UPDATE`, [user.id, jobs.sessionIdleMinutes]);
    if (!session) {
      const r = await tx.query('INSERT INTO listening_sessions (user_id, context_id, device) VALUES (?, ?, ?)',
        [user.id, ctx ? ctx.context_id : null, 'web']);
      session = { session_id: r.insertId };
    } else if (ctx && !session.context_id) {
      await tx.query('UPDATE listening_sessions SET context_id = ? WHERE session_id = ?', [ctx.context_id, session.session_id]);
    }
    if (batchId) {
      const b = await tx.one('SELECT user_id FROM recommendation_batches WHERE batch_id = ?', [batchId]);
      if (!b || b.user_id !== user.id) batchId = null;   // never link to someone else's list
    }
    const play = await tx.query(
      'INSERT INTO listening_history (session_id, user_id, song_id, batch_id, origin) VALUES (?, ?, ?, ?, ?)',
      [session.session_id, user.id, song.song_id, batchId, origin]);
    await tx.query("INSERT INTO playback_events (play_id, event_type, position_sec) VALUES (?, 'PLAY_STARTED', 0)", [play.insertId]);
    await tx.query('UPDATE listening_sessions SET last_activity_at = NOW() WHERE session_id = ?', [session.session_id]);
    const row = await tx.one('SELECT is_replay FROM listening_history WHERE play_id = ?', [play.insertId]);
    return { private: false, playId: play.insertId, sessionId: session.session_id, isReplay: !!row.is_replay,
      song: { id: song.song_id, durationSec: song.duration_sec }, media: song.media };
  });
}

async function ownedOpenPlay(user, playId) {
  const p = await one('SELECT play_id, user_id, ended_at, song_id FROM listening_history WHERE play_id = ?', [playId]);
  if (!p || p.user_id !== user.id) throw ApiError.notFound('Play');
  if (p.ended_at) throw new ApiError(409, 'PLAY_FINISHED', 'This play has already finished.');
  return p;
}

/** PAUSE / RESUME / SEEK (meaningful events only). */
async function event(user, playId, { type, positionSec, seekToSec = null }) {
  if (!['PAUSE', 'RESUME', 'SEEK'].includes(type)) throw ApiError.badRequest('type must be PAUSE, RESUME or SEEK');
  if (type === 'SEEK' && (seekToSec === null || seekToSec === undefined)) throw ApiError.badRequest('seekToSec is required for SEEK');
  await ownedOpenPlay(user, playId);
  await query('INSERT INTO playback_events (play_id, event_type, position_sec, seek_to_sec) VALUES (?, ?, ?, ?)',
    [playId, type, positionSec, type === 'SEEK' ? seekToSec : null]);
  return { ok: true };
}

/**
 * Finish a play: store listened time (the trigger derives completion %,
 * completed/skipped), add the final event, bump the session counters with
 * an atomic increment, and refresh preferences — all in one transaction.
 * Lock order (user row, then play row) matches the stored procedures.
 */
async function finish(user, playId, { listenedSec, positionSec = null }) {
  const p = await ownedOpenPlay(user, playId);
  return withTransaction(async (tx) => {
    await tx.query('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', [user.id]);
    const locked = await tx.one('SELECT play_id, session_id, ended_at FROM listening_history WHERE play_id = ? FOR UPDATE', [playId]);
    if (locked.ended_at) throw new ApiError(409, 'PLAY_FINISHED', 'This play has already finished.');
    await tx.query('UPDATE listening_history SET listened_sec = ?, ended_at = NOW() WHERE play_id = ?', [listenedSec, playId]);
    const row = await tx.one('SELECT completed, skipped, completion_pct, is_replay FROM listening_history WHERE play_id = ?', [playId]);
    await tx.query('INSERT INTO playback_events (play_id, event_type, position_sec) VALUES (?, ?, ?)',
      [playId, row.completed ? 'COMPLETED' : 'SKIP', positionSec ?? listenedSec]);
    await tx.query(
      `UPDATE listening_sessions SET plays = plays + 1, listen_sec = listen_sec + ?, last_activity_at = NOW()
        WHERE session_id = ?`, [listenedSec, locked.session_id]);
    await tx.call('sp_refresh_user_preferences_core', [user.id]);
    const learned = await tx.one(
      `SELECT g.name AS genre, ugp.blended_score AS score, ugp.plays
         FROM song_genres sg JOIN user_genre_preferences ugp ON ugp.genre_id = sg.genre_id AND ugp.user_id = ?
         JOIN genres g ON g.genre_id = sg.genre_id WHERE sg.song_id = ? AND sg.is_primary = 1`, [user.id, p.song_id]);
    return { playId, completed: !!row.completed, skipped: !!row.skipped, completionPct: Number(row.completion_pct),
      isReplay: !!row.is_replay, learned };
  });
}

/** Private-session play: only the temporary event table is written. */
async function finishPrivate(user, { songId, listenedSec }) {
  if (!user.incognitoId) throw new ApiError(409, 'NOT_PRIVATE', 'No private session is active.');
  await activeSong(songId);
  const r = await query('INSERT INTO incognito_events (incognito_id, song_id, listened_sec) VALUES (?, ?, ?)', [user.incognitoId, songId, listenedSec]);
  const e = await one('SELECT completed, skipped FROM incognito_events WHERE event_id = ?', [r.insertId]);
  return { private: true, completed: !!e.completed, skipped: !!e.skipped };
}

/** Close the user's open session now (e.g. on sign-out). */
async function closeOpenSessions(userId) {
  const open = await query("SELECT session_id FROM listening_sessions WHERE user_id = ? AND status = 'OPEN'", [userId]);
  for (const s of open) await query('CALL sp_close_listening_session(?)', [s.session_id]);
  return open.length;
}

async function recent(user, limit = 20) {
  return query(
    `SELECT lh.play_id, lh.started_at, lh.listened_sec, lh.completion_pct, lh.completed, lh.skipped, lh.is_replay, lh.origin, sc.*
       FROM listening_history lh JOIN v_song_catalog sc ON sc.song_id = lh.song_id
      WHERE lh.user_id = ? AND lh.ended_at IS NOT NULL
      ORDER BY lh.started_at DESC LIMIT ?`, [user.id, limit]);
}

module.exports = { activeSong, start, event, finish, finishPrivate, closeOpenSessions, recent, playableSong, contentAllowed };

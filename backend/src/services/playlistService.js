// Playlists (manual, saved mixes, smart) and smart-playlist generation.
// song_count / total_duration_sec / positions are maintained by triggers.
const { query, one, withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { toSong, withUserFlags } = require('./songMapper');
const rec = require('./recommendationService');

const KINDS = { MANUAL: 'MANUAL', SMART: 'SMART', SAVED_MIX: 'SAVED_MIX', WORLD: 'WORLD' };

function assertPermanent(user, what = 'Playlists') {
  if (user.incognitoId) {
    throw new ApiError(409, 'INCOGNITO_ACTIVE', `${what} are paused in a private session so your library stays unchanged.`);
  }
}

async function owned(user, playlistId, { forUpdate = false, tx = null } = {}) {
  const run = tx ? tx.one : one;
  const p = await run(`SELECT * FROM playlists WHERE playlist_id = ?${forUpdate ? ' FOR UPDATE' : ''}`, [playlistId]);
  if (!p || p.user_id !== user.id) throw ApiError.notFound('Playlist');
  return p;
}

async function list(user) {
  return query(
    `SELECT p.playlist_id AS id, p.name, p.description, p.kind, p.smart_type AS smartType, p.song_count AS songCount,
            p.total_duration_sec AS totalDurationSec, p.created_at AS createdAt, p.updated_at AS updatedAt,
            (SELECT JSON_ARRAYAGG(JSON_ARRAY(c1, c2)) FROM (
               SELECT sc.cover_color_1 AS c1, sc.cover_color_2 AS c2 FROM playlist_songs ps
                 JOIN v_song_catalog sc ON sc.song_id = ps.song_id
                WHERE ps.playlist_id = p.playlist_id ORDER BY ps.position LIMIT 4) x) AS covers
       FROM playlists p WHERE p.user_id = ? ORDER BY p.updated_at DESC, p.playlist_id DESC`, [user.id]);
}

async function detail(user, playlistId) {
  const p = await owned(user, playlistId);
  const rows = await query(
    `SELECT sc.*, ps.position, ps.added_at FROM playlist_songs ps JOIN v_song_catalog sc ON sc.song_id = ps.song_id
      WHERE ps.playlist_id = ? ORDER BY ps.position`, [playlistId]);
  const songs = await withUserFlags(user.id, rows.map((r) => ({ ...toSong(r), position: r.position, addedAt: r.added_at })));
  return {
    id: p.playlist_id, name: p.name, description: p.description, kind: p.kind, smartType: p.smart_type,
    sourceBatchId: p.source_batch_id, songCount: p.song_count, totalDurationSec: p.total_duration_sec,
    createdAt: p.created_at, updatedAt: p.updated_at, songs,
  };
}

/** Create a playlist and add its first songs in ONE transaction (all or nothing). */
async function create(user, { name, description = null, songIds = [], kind = KINDS.MANUAL, smartType = null, sourceBatchId = null }) {
  assertPermanent(user);
  const unique = [...new Set(songIds)];
  if (unique.length !== songIds.length) throw new ApiError(409, 'DUPLICATE_PLAYLIST_SONG', 'The same song appears twice in the list.');
  return withTransaction(async (tx) => {
    if (sourceBatchId) {
      const b = await tx.one('SELECT user_id FROM recommendation_batches WHERE batch_id = ?', [sourceBatchId]);
      if (!b || b.user_id !== user.id) throw ApiError.notFound('Recommendation list');
    }
    const r = await tx.query(
      'INSERT INTO playlists (user_id, name, description, kind, smart_type, source_batch_id) VALUES (?, ?, ?, ?, ?, ?)',
      [user.id, name, description, kind, smartType, sourceBatchId]);
    for (const songId of unique) {
      const s = await tx.one("SELECT song_id FROM songs WHERE song_id = ? AND status = 'ACTIVE'", [songId]);
      if (!s) throw new ApiError(404, 'NOT_FOUND', `Song ${songId} not found.`);   // rolls back the playlist too
      await tx.query('INSERT INTO playlist_songs (playlist_id, song_id) VALUES (?, ?)', [r.insertId, songId]);
    }
    return { id: r.insertId };
  }).then(({ id }) => detail(user, id));
}

/** Save a generated list (any recommendation batch) as a playlist, keeping its rank order. */
async function saveBatch(user, { batchId, name, description = null, smartType: requested = null }) {
  const b = await one('SELECT user_id, strategy, label FROM recommendation_batches WHERE batch_id = ?', [batchId]);
  if (!b || b.user_id !== user.id) throw ApiError.notFound('Recommendation list');
  const items = await query('SELECT song_id FROM recommendation_items WHERE batch_id = ? ORDER BY rank_position', [batchId]);
  if (!items.length) throw new ApiError(400, 'EMPTY_LIST', 'That list has no songs to save.');
  const smartType = requested && SMART[requested] ? requested
    : b.strategy === 'SMART_PLAYLIST' && SMART[b.label] ? b.label : null;
  const kind = b.strategy === 'WORLD' ? KINDS.WORLD : smartType ? KINDS.SMART : KINDS.SAVED_MIX;
  return create(user, { name, description: description || `Saved from ${SMART[b.label] ? SMART[b.label].name : b.label || b.strategy.toLowerCase()}`,
    songIds: items.map((i) => i.song_id), kind, smartType, sourceBatchId: batchId });
}

async function update(user, playlistId, { name, description }) {
  assertPermanent(user);
  await owned(user, playlistId);
  const sets = []; const params = [];
  if (name !== undefined) { sets.push('name = ?'); params.push(name); }
  if (description !== undefined) { sets.push('description = ?'); params.push(description || null); }
  if (sets.length) await query(`UPDATE playlists SET ${sets.join(', ')}, updated_at = NOW() WHERE playlist_id = ?`, [...params, playlistId]);
  return detail(user, playlistId);
}

async function remove(user, playlistId) {
  assertPermanent(user);
  await owned(user, playlistId);
  await query('DELETE FROM playlists WHERE playlist_id = ?', [playlistId]);
  return { deleted: true };
}

async function addSong(user, playlistId, songId) {
  assertPermanent(user);
  return withTransaction(async (tx) => {
    await owned(user, playlistId, { forUpdate: true, tx });     // serialises concurrent adds (positions stay unique)
    const s = await tx.one("SELECT song_id FROM songs WHERE song_id = ? AND status = 'ACTIVE'", [songId]);
    if (!s) throw ApiError.notFound('Song');
    await tx.query('INSERT INTO playlist_songs (playlist_id, song_id) VALUES (?, ?)', [playlistId, songId]);   // PK rejects duplicates
    const p = await tx.one('SELECT song_count, total_duration_sec FROM playlists WHERE playlist_id = ?', [playlistId]);
    return { playlistId, songId, songCount: p.song_count, totalDurationSec: p.total_duration_sec };
  });
}

async function removeSong(user, playlistId, songId) {
  assertPermanent(user);
  await owned(user, playlistId);
  const r = await query('DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?', [playlistId, songId]);
  if (!r.affectedRows) throw ApiError.notFound('Song in this playlist');
  return { removed: true };
}

// ---------------------------------------------------------------------------
// SMART PLAYLISTS — every one is built from the user's real signals
// ---------------------------------------------------------------------------
const SMART = {
  ENERGY_BOOST: { name: 'My Energy Boost', blurb: 'High-energy songs that fit your taste', moods: { Energetic: 1, Motivational: 0.8, Euphoric: 0.7 } },
  CALM_MIX: { name: 'My Calm Mix', blurb: 'Soft, steady songs for winding down', context: 'RELAX' },
  LATE_NIGHT: { name: 'My Late Night Mix', blurb: 'Low light, low tempo', context: 'NIGHT' },
  STUDY: { name: 'My Study Mix', blurb: 'Mostly instrumental, steady tempo', context: 'STUDY' },
  ROAD_TRIP: { name: 'My Road Trip Mix', blurb: 'Wide-open, forward-moving songs', context: 'TRAVEL' },
  MOST_REPLAYED: { name: 'My Most Replayed', blurb: 'The songs you come back to most (last 90 days)' },
  DISCOVERY: { name: 'My Discovery Mix', blurb: 'Close to your taste, never played before' },
  REGIONAL: { name: 'My Regional Mix', blurb: 'Your first language, tuned to your sound' },
};

function smartTypes() {
  return Object.entries(SMART).map(([type, s]) => ({ type, name: s.name, blurb: s.blurb }));
}

async function mostReplayed(user, limit) {
  // aggregate the user's plays first, then join the catalogue view (keeps GROUP BY on base-table keys)
  const rows = await query(
    `SELECT sc.*, x.replays, x.completes, RANK() OVER (ORDER BY x.replays DESC, x.completes DESC) AS rnk
       FROM (SELECT lh.song_id, SUM(lh.is_replay) AS replays, SUM(lh.completed) AS completes
               FROM listening_history lh
              WHERE lh.user_id = ? AND lh.started_at >= NOW() - INTERVAL 90 DAY
              GROUP BY lh.song_id HAVING SUM(lh.completed) > 0) x
       JOIN v_song_catalog sc ON sc.song_id = x.song_id AND sc.status = 'ACTIVE'
      ORDER BY x.replays DESC, x.completes DESC, sc.song_id LIMIT ?`, [user.id, limit]);
  const songs = await withUserFlags(user.id, rows.map((r) => ({
    ...toSong(r), rank: r.rnk,
    reasons: [{ code: 'REPLAYED', text: `Replayed ${r.replays} time${Number(r.replays) === 1 ? '' : 's'}, finished ${r.completes} time${Number(r.completes) === 1 ? '' : 's'}` }],
  })));
  return { batchId: null, strategy: 'SMART_PLAYLIST', title: SMART.MOST_REPLAYED.name, subtitle: SMART.MOST_REPLAYED.blurb, songs };
}

async function generateSmart(user, type, limit = 20) {
  const def = SMART[type];
  if (!def) throw new ApiError(400, 'INVALID_SMART_TYPE', `Unknown smart playlist "${type}".`);
  if (type === 'MOST_REPLAYED') return { ...(await mostReplayed(user, limit)), smartType: type };
  if (type === 'DISCOVERY') return { ...(await rec.discovery(user, { limit })), title: def.name, smartType: type };
  if (type === 'REGIONAL') return { ...(await rec.regional(user, { limit })), title: def.name, smartType: type };

  let moods; let targets; let ctx = null;
  if (def.context) {
    ctx = await rec.contextByCode(def.context);
    moods = await rec.contextMoods(ctx.context_id);
    targets = rec.normalise(rec.profileOf(ctx));
  } else {
    const all = await query('SELECT mood_id, name FROM moods');
    moods = Object.entries(def.moods).map(([name, weight]) => ({ moodId: all.find((m) => m.name === name).mood_id, name, weight }));
    targets = rec.normalise(rec.blend(await rec.moodRows(moods.map((m) => m.moodId)), (r) => moods.find((m) => m.moodId === r.mood_id).weight));
  }
  const { batchId, rows } = await rec.createAndRun(user, { strategy: 'SMART_PLAYLIST', label: type, contextId: ctx ? ctx.context_id : null,
    targets, moods, limit });
  const out = await rec.shape(user, batchId, rows, { strategy: 'SMART_PLAYLIST', title: def.name, subtitle: def.blurb, moods, targets,
    context: ctx ? { code: ctx.code, name: ctx.name, emoji: ctx.emoji } : null });
  return { ...out, smartType: type };
}

/** Save MOST_REPLAYED (which has no batch) directly; others go through saveBatch. */
async function saveSmart(user, type, name) {
  assertPermanent(user);
  if (type !== 'MOST_REPLAYED') throw new ApiError(400, 'USE_BATCH', 'Save this list with its batchId.');
  const r = await mostReplayed(user, 25);
  if (!r.songs.length) throw new ApiError(400, 'EMPTY_LIST', 'Finish a few songs first; there is nothing replayed yet.');
  return create(user, { name: name || SMART[type].name, description: SMART[type].blurb, songIds: r.songs.map((s) => s.id),
    kind: KINDS.SMART, smartType: type });
}

module.exports = { list, detail, create, saveBatch, update, remove, addSong, removeSong, smartTypes, generateSmart, saveSmart };

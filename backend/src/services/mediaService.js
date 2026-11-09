// Playback media: which permitted source can actually play a song right now.
//
// Order (song_media.priority, then music_sources.priority):
//   1. USER_LOCAL        — a licensed file in LOCAL_MEDIA_DIR, streamed by /api/media/:id
//   2. PREVIEW           — EXTERNAL_PREVIEW provider, resolved by ISRC at play time
//                          (song_media.uri holds the marker 'provider:EXTERNAL_PREVIEW'; the
//                          real, short-lived URL is fetched per play and never stored)
//   3. GENERATED_SKETCH  — DEMO FIXTURE synthesised in the browser (not the recording)
//   none                 — metadata only: the song is shown but cannot be played
//
// A source that turns out not to work (file missing, provider says "no preview") is
// marked UNAVAILABLE so the catalogue stops calling the song playable. A transient
// provider failure (timeout, 5xx) is skipped for this play only.
const { query, one } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { localMedia, externalPreview } = require('../providers');

const LABELS = {
  USER_LOCAL: 'Licensed local file',
  PREVIEW: 'Licensed preview',
  FULL: 'Full track',
  GENERATED_SKETCH: 'Demo fixture — a sound sketch synthesised from the song’s features, not the recording',
};

async function candidates(songId) {
  return query(
    `SELECT sm.media_id, sm.media_type, sm.uri, sm.rights_status, sm.availability,
            COALESCE(sm.attribution, ms.attribution_text) AS attribution, ms.code AS source, ms.name AS source_name
       FROM song_media sm JOIN music_sources ms ON ms.source_id = sm.source_id
      WHERE sm.song_id = ? AND ms.is_enabled = 1 AND sm.rights_status <> 'RESTRICTED' AND sm.availability <> 'UNAVAILABLE'
      ORDER BY sm.priority, ms.priority, sm.media_id`, [songId]);
}

async function mark(mediaId, availability) {
  await query('UPDATE song_media SET availability = ?, last_checked_at = NOW() WHERE media_id = ?', [availability, mediaId]);
}

const out = (m, extra = {}) => ({
  mediaId: m.media_id, type: m.media_type, source: m.source, sourceName: m.source_name,
  label: LABELS[m.media_type] || m.media_type, attribution: m.attribution || null, uri: null,
  demo: m.media_type === 'GENERATED_SKETCH', ...extra,
});

/**
 * Pick the first working source for a song. Returns a media descriptor, or null
 * when nothing can play it (metadata-only). `fetchImpl` is for tests.
 */
async function resolve(song, { fetchImpl } = {}) {
  for (const m of await candidates(song.song_id)) {
    if (m.media_type === 'USER_LOCAL') {
      if (m.source === 'LOCAL_MEDIA' && localMedia.available(m.uri)) {
        if (m.availability !== 'AVAILABLE') await mark(m.media_id, 'AVAILABLE');
        return out(m, { uri: `/api/media/${m.media_id}` });
      }
      await mark(m.media_id, 'UNAVAILABLE');
      continue;
    }
    if (m.media_type === 'PREVIEW' && m.source === 'EXTERNAL_PREVIEW') {
      if (externalPreview.check().state !== 'ready') continue;
      try {
        const p = await externalPreview.resolvePreview({ isrc: song.isrc, fetchImpl });
        if (!p) { await mark(m.media_id, 'UNAVAILABLE'); continue; }
        if (m.availability !== 'AVAILABLE') await mark(m.media_id, 'AVAILABLE');
        return out(m, { uri: p.uri, attribution: p.attribution || m.attribution, previewSec: p.durationSec, expiresAt: p.expiresAt });
      } catch (err) {
        console.warn(`[media] ${err.provider || 'EXTERNAL_PREVIEW'} ${err.code}: ${err.message}`);
        continue;   // transient: fall back for this play, do not mark
      }
    }
    if (m.media_type === 'GENERATED_SKETCH') return out(m);
    if ((m.media_type === 'PREVIEW' || m.media_type === 'FULL') && m.uri && /^https:\/\//.test(m.uri)) return out(m, { uri: m.uri });
  }
  return null;
}

/** For GET /api/media/:id — the local file behind a registered USER_LOCAL media row. */
async function localFile(mediaId) {
  const m = await one(
    `SELECT sm.media_id, sm.song_id, sm.uri, s.status, s.explicit, s.content_rating
       FROM song_media sm JOIN music_sources ms ON ms.source_id = sm.source_id JOIN songs s ON s.song_id = sm.song_id
      WHERE sm.media_id = ? AND sm.media_type = 'USER_LOCAL' AND ms.code = 'LOCAL_MEDIA' AND ms.is_enabled = 1
        AND sm.rights_status <> 'RESTRICTED'`, [mediaId]);
  if (!m || m.status !== 'ACTIVE') throw ApiError.notFound('Media');
  const f = localMedia.available(m.uri) ? localMedia.resolveFile(m.uri) : null;
  if (!f) { await mark(m.media_id, 'UNAVAILABLE'); throw new ApiError(404, 'MEDIA_UNAVAILABLE', 'This audio file is no longer available.'); }
  return { ...f, song: m };
}

/** Curator: attach a file from LOCAL_MEDIA_DIR to a song. Idempotent per (song, file). */
async function registerLocal(songId, fileName, { rights = 'PERMITTED', attribution = null } = {}) {
  if (!localMedia.resolveFile(fileName)) throw ApiError.badRequest('fileName must be a plain audio file name (mp3, m4a, aac, ogg, opus, wav, flac).');
  if (!localMedia.available(fileName)) throw new ApiError(404, 'FILE_NOT_FOUND', `No file named "${fileName}" in the local media folder.`);
  const song = await one('SELECT song_id FROM songs WHERE song_id = ?', [songId]);
  if (!song) throw ApiError.notFound('Song');
  const src = await one("SELECT source_id FROM music_sources WHERE code = 'LOCAL_MEDIA'");
  const existing = await one("SELECT media_id FROM song_media WHERE song_id = ? AND media_type = 'USER_LOCAL' AND uri = ?", [songId, fileName]);
  if (existing) {
    await query(
      `UPDATE song_media SET availability = 'AVAILABLE', last_checked_at = NOW(), rights_status = ?,
              attribution = COALESCE(?, attribution) WHERE media_id = ?`, [rights, attribution, existing.media_id]);
    return { mediaId: existing.media_id, created: false };
  }
  const r = await query(
    `INSERT INTO song_media (song_id, source_id, media_type, uri, rights_status, availability, last_checked_at, attribution, priority)
     VALUES (?, ?, 'USER_LOCAL', ?, ?, 'AVAILABLE', NOW(), ?, 10)`, [songId, src.source_id, fileName, rights, attribution]);
  return { mediaId: r.insertId, created: true };
}

/**
 * Re-check local files (cheap, no network). Preview rows are checked lazily at
 * play time to stay inside provider quotas.
 */
async function checkLocal() {
  const rows = await query(
    `SELECT sm.media_id, sm.uri, sm.availability FROM song_media sm JOIN music_sources ms ON ms.source_id = sm.source_id
      WHERE sm.media_type = 'USER_LOCAL' AND ms.code = 'LOCAL_MEDIA'`);
  let available = 0; let unavailable = 0;
  for (const r of rows) {
    const ok = localMedia.available(r.uri);
    ok ? available++ : unavailable++;
    await mark(r.media_id, ok ? 'AVAILABLE' : 'UNAVAILABLE');
  }
  return { checked: rows.length, available, unavailable };
}

async function summary() {
  return query(
    `SELECT sm.media_type AS type, ms.code AS source, sm.availability, COUNT(*) AS n
       FROM song_media sm JOIN music_sources ms ON ms.source_id = sm.source_id
      GROUP BY sm.media_type, ms.code, sm.availability ORDER BY sm.media_type, ms.code, sm.availability`);
}

module.exports = { resolve, localFile, registerLocal, checkLocal, summary, LABELS };

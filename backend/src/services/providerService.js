// Admin-facing provider operations: status, an explicit connection test, TMDB
// film enrichment and YouTube link lookup. Every import is idempotent
// (source_records is unique per source + entity type + external id) and records
// provenance and attribution. Nothing here runs unless an admin asks for it.
const crypto = require('crypto');
const { query, one, withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');
const providers = require('../providers');
const { ProviderError } = require('../providers/http');

const VERSION = 'providers-1';
const hash = (o) => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '');

/** ProviderError -> an API error the admin UI can show. Never includes secrets. */
function toApiError(err) {
  if (!(err instanceof ProviderError)) return err;
  const p = err.provider;
  switch (err.code) {
    case 'DISABLED':
    case 'MISCONFIGURED':
      return new ApiError(409, 'PROVIDER_NOT_CONFIGURED', `${err.message} See docs/PROVIDERS.md.`);
    case 'TIMEOUT':
      return new ApiError(504, 'PROVIDER_TIMEOUT', `${p} did not answer in time. Try again later.`);
    case 'NETWORK':
      return new ApiError(502, 'PROVIDER_UNREACHABLE', `${p} could not be reached from the server.`);
    case 'RATE_LIMITED':
      return new ApiError(429, 'PROVIDER_RATE_LIMITED', `${p} is rate-limiting requests. Wait and try again.`);
    case 'HTTP_ERROR':
      if (err.status === 401 || err.status === 403) {
        return new ApiError(502, 'PROVIDER_CREDENTIALS_REJECTED', `${p} rejected the configured credentials (HTTP ${err.status}). Check the key in .env.`);
      }
      return new ApiError(502, 'PROVIDER_ERROR', `${p} returned HTTP ${err.status}.`);
    case 'NOT_FOUND':
      return new ApiError(404, 'PROVIDER_NOT_FOUND', `${p} has no matching record.`);
    default:
      return new ApiError(502, 'PROVIDER_BAD_RESPONSE', `${p} returned an unexpected response.`);
  }
}

async function guarded(fn) {
  try { return await fn(); } catch (err) { throw toApiError(err); }
}

async function markSuccess(code) {
  await query('UPDATE music_sources SET last_success_at = NOW() WHERE code = ?', [code]);
}

/** Configuration state (env) joined with the catalogue switch (music_sources). */
async function status() {
  const rows = await query('SELECT code, is_enabled, last_success_at FROM music_sources');
  const db = new Map(rows.map((r) => [r.code, r]));
  return providers.status().map((p) => {
    const r = db.get(p.code);
    return { ...p, catalogueEnabled: r ? !!r.is_enabled : null, lastSuccessAt: r ? r.last_success_at : null };
  });
}

/** One small real request, only when an admin presses "Test". */
async function test(code, { fetchImpl } = {}) {
  const t = Date.now();
  const result = await guarded(async () => {
    switch (code) {
      case 'MUSICBRAINZ': {
        const r = await providers.musicbrainz.discover({ query: 'recording:"Vande Mataram"', limit: 1, fetchImpl });
        return { sample: r.records ? r.records.length : 0 };
      }
      case 'THEAUDIODB': {
        const r = await providers.theAudioDb.artistArtwork({ name: 'Coldplay', fetchImpl });
        return { sample: r ? 1 : 0, note: 'artist metadata/artwork only; no audio is provided' };
      }
      case 'TMDB': return { sample: (await providers.tmdb.searchMovie({ title: 'Baahubali', fetchImpl })).length };
      case 'YOUTUBE_DATA': return { sample: (await providers.youtube.searchVideos({ q: 'Indian classical music', max: 1, fetchImpl })).length, note: 'used 1 of the daily search calls' };
      case 'AI': {
        const r = await providers.ai.interpretMood({ text: 'a calm evening', moodNames: ['Calm', 'Happy'], contextCodes: ['RELAX'], fetchImpl });
        return { sample: r.moods.length };
      }
      case 'LOCAL_MEDIA': {
        const s = providers.localMedia.check();
        if (s.state !== 'ready') throw new ProviderError('LOCAL_MEDIA', 'DISABLED', 'Local media is disabled (LOCAL_MEDIA_ENABLED=false).');
        return { sample: providers.localMedia.list().length };
      }
      case 'EXTERNAL_PREVIEW': {
        const s = providers.externalPreview.check();
        if (s.state !== 'ready') throw new ProviderError('EXTERNAL_PREVIEW', s.state === 'disabled' ? 'DISABLED' : 'MISCONFIGURED', 'External preview provider is not configured.');
        const song = await one("SELECT isrc FROM songs WHERE isrc IS NOT NULL AND status = 'ACTIVE' ORDER BY popularity DESC LIMIT 1");
        if (!song) return { sample: 0, note: 'no song with an ISRC to test with' };
        return { sample: (await providers.externalPreview.resolvePreview({ isrc: song.isrc, fetchImpl })) ? 1 : 0 };
      }
      default: throw ApiError.notFound('Provider');
    }
  });
  if (code !== 'LOCAL_MEDIA') await markSuccess(code);
  return { code, ok: true, ms: Date.now() - t, ...result };
}

/**
 * Attach TMDB film metadata to a MUSE film. Without `tmdbId`, MUSE accepts only a
 * confident match (same title, year within 1); otherwise it returns candidates
 * and stores nothing, so an admin can choose.
 */
async function enrichFilm(filmId, { tmdbId = null, fetchImpl } = {}) {
  const film = await one(
    `SELECT f.film_id, f.title, f.release_year, l.iso_code FROM films f JOIN languages l ON l.language_id = f.language_id
      WHERE f.film_id = ?`, [filmId]);
  if (!film) throw ApiError.notFound('Film');
  const results = await guarded(() => providers.tmdb.searchMovie({ title: film.title, year: tmdbId ? null : film.release_year, fetchImpl }));
  await markSuccess('TMDB');
  let pick = null;
  if (tmdbId) {
    pick = results.find((r) => r.externalId === String(tmdbId));
    if (!pick) throw new ApiError(404, 'PROVIDER_NOT_FOUND', `TMDB id ${tmdbId} was not among the results for "${film.title}".`);
  } else {
    const confident = results.filter((r) => norm(r.title) === norm(film.title) && r.year && Math.abs(r.year - film.release_year) <= 1);
    if (confident.length === 1) [pick] = confident;
  }
  if (!pick) {
    return { filmId, stored: false, reason: results.length ? 'NO_CONFIDENT_MATCH' : 'NO_RESULTS',
      candidates: results.slice(0, 5).map((r) => ({ tmdbId: r.externalId, title: r.title, year: r.year, url: r.sourceUrl })) };
  }
  const payload = { title: pick.title, originalTitle: pick.originalTitle, year: pick.year, overview: pick.overview,
    originalLanguage: pick.originalLanguage, releaseDate: pick.year ? String(pick.year) : null };
  return withTransaction(async (tx) => {
    const src = await tx.one("SELECT source_id FROM music_sources WHERE code = 'TMDB'");
    const existing = await tx.one(
      "SELECT record_id, film_id, payload_hash FROM source_records WHERE source_id = ? AND entity_type = 'FILM' AND external_id = ? FOR UPDATE",
      [src.source_id, pick.externalId]);
    if (existing && existing.film_id !== filmId) {
      throw new ApiError(409, 'ALREADY_LINKED', `TMDB film ${pick.externalId} is already linked to another MUSE film (#${existing.film_id}).`);
    }
    const h = hash(payload);
    if (existing) {
      await tx.query('UPDATE source_records SET payload = ?, payload_hash = ?, last_verified_at = NOW() WHERE record_id = ?',
        [JSON.stringify(payload), h, existing.record_id]);
      return { filmId, stored: true, created: false, changed: existing.payload_hash !== h, tmdbId: pick.externalId, attribution: providers.tmdb.ATTRIBUTION };
    }
    await tx.query(
      `INSERT INTO source_records (source_id, entity_type, external_id, film_id, source_url, rights_status, payload, payload_hash, status,
                                   match_method, match_confidence, processing_version)
       VALUES (?, 'FILM', ?, ?, ?, 'METADATA_ONLY', ?, ?, 'COMPLETED', ?, ?, ?)`,
      [src.source_id, pick.externalId, filmId, pick.sourceUrl, JSON.stringify(payload), h, tmdbId ? 'MANUAL' : 'EXACT', tmdbId ? 1 : 0.9, VERSION]);
    return { filmId, stored: true, created: true, changed: true, tmdbId: pick.externalId, attribution: providers.tmdb.ATTRIBUTION };
  });
}

/** Find up to 3 public YouTube videos for a song and store them as links (metadata only). */
async function findVideoLinks(songId, { fetchImpl } = {}) {
  const song = await one(
    `SELECT s.song_id, s.title, a.name AS artist FROM songs s JOIN artists a ON a.artist_id = s.primary_artist_id WHERE s.song_id = ?`, [songId]);
  if (!song) throw ApiError.notFound('Song');
  const videos = await guarded(() => providers.youtube.searchVideos({ q: `${song.artist} ${song.title}`, max: 3, fetchImpl }));
  await markSuccess('YOUTUBE_DATA');
  const stored = [];
  await withTransaction(async (tx) => {
    const src = await tx.one("SELECT source_id FROM music_sources WHERE code = 'YOUTUBE_DATA'");
    for (const v of videos.slice(0, 3)) {
      const payload = { title: v.title, channel: v.channel, publishedAt: v.publishedAt, query: `${song.artist} ${song.title}` };
      const existing = await tx.one("SELECT record_id, song_id FROM source_records WHERE source_id = ? AND entity_type = 'SONG' AND external_id = ? FOR UPDATE",
        [src.source_id, v.externalId]);
      if (existing && existing.song_id !== songId) continue;   // already linked to another song: never move it silently
      if (existing) {
        await tx.query('UPDATE source_records SET payload = ?, payload_hash = ?, last_verified_at = NOW() WHERE record_id = ?',
          [JSON.stringify(payload), hash(payload), existing.record_id]);
      } else {
        await tx.query(
          `INSERT INTO source_records (source_id, entity_type, external_id, song_id, source_url, rights_status, payload, payload_hash, status,
                                       match_method, match_confidence, processing_version)
           VALUES (?, 'SONG', ?, ?, ?, 'METADATA_ONLY', ?, ?, 'COMPLETED', 'FUZZY', 0.5, ?)`,
          [src.source_id, v.externalId, songId, v.sourceUrl, JSON.stringify(payload), hash(payload), VERSION]);
      }
      stored.push({ videoId: v.externalId, url: v.sourceUrl, title: v.title, channel: v.channel, created: !existing });
    }
  });
  return { songId, found: videos.length, stored };
}

module.exports = { status, test, enrichFilm, findVideoLinks, toApiError };

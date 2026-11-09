// MusicBrainz Web Service (metadata only; core data CC0).
// https://musicbrainz.org/doc/MusicBrainz_API  — requires a descriptive User-Agent
// with contact details and at most one request per second.
// Provides NO audio, artwork or audio features: ingested songs stay
// PENDING_ANALYSIS (metadata-only) until an approved analyser supplies features.
const cfg = require('./config');
const { requestJson, ProviderError } = require('./http');

const CODE = 'MUSICBRAINZ';

function check() {
  const c = cfg.musicbrainz;
  if (!c.enabled) return { state: 'disabled' };
  if (!c.userAgent) return { state: 'missing_credentials', missing: ['MUSICBRAINZ_USER_AGENT'] };
  if (!/\(.*(@|https?:\/\/).*\)/.test(c.userAgent)) {
    return { state: 'invalid_config', message: 'MUSICBRAINZ_USER_AGENT must include contact details in parentheses, e.g. "MUSE/1.0 (you@example.com)"' };
  }
  return { state: 'ready' };
}

function assertReady() {
  const s = check();
  if (s.state === 'disabled') throw new ProviderError(CODE, 'DISABLED', 'MusicBrainz is disabled (MUSICBRAINZ_ENABLED is not "true").');
  if (s.state !== 'ready') throw new ProviderError(CODE, 'MISCONFIGURED', s.message || `MusicBrainz needs ${s.missing.join(', ')}.`);
}

/** Map one MusicBrainz recording JSON to MUSE's feed record shape (pure). */
function mapRecording(r) {
  const credit = (r['artist-credit'] || [])[0];
  const isrc = (r.isrcs || [])[0] || null;
  const release = (r.releases || [])[0];
  const year = release && release.date ? Number(String(release.date).slice(0, 4)) : null;
  return {
    externalId: r.id,
    entityType: 'SONG',
    sourceUrl: `https://musicbrainz.org/recording/${r.id}`,
    rights: 'METADATA_ONLY',
    payload: {
      title: r.title,
      artist: credit ? (credit.name || (credit.artist && credit.artist.name)) : null,
      album: release ? release.title : null,
      duration_sec: r.length ? Math.round(r.length / 1000) : null,
      isrc: isrc && /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/.test(isrc) ? isrc : null,
      release_year: Number.isInteger(year) ? year : null,
      language: null,
      genre: null,
      explicit: false,
      content_rating: 'ALL',
      popularity: 40,
    },
  };
}

async function discover({ query = 'tag:indian AND country:IN', limit = 10, fetchImpl } = {}) {
  assertReady();
  const c = cfg.musicbrainz;
  const url = `${c.baseUrl}/recording?query=${encodeURIComponent(query)}&limit=${Math.min(25, limit)}&fmt=json&inc=isrcs+artist-credits+releases`;
  const body = await requestJson(CODE, url, { headers: { 'User-Agent': c.userAgent }, timeoutMs: cfg.timeoutMs, retries: cfg.retries, minIntervalMs: c.minIntervalMs, fetchImpl });
  if (!body || !Array.isArray(body.recordings)) throw new ProviderError(CODE, 'BAD_RESPONSE', 'MusicBrainz response has no "recordings" list');
  return { label: `musicbrainz query "${query}"`, records: body.recordings.map(mapRecording) };
}

module.exports = { code: CODE, check, discover, mapRecording };

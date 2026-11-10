// MusicBrainz metadata + Cover Art Archive lookups. No audio is provided here.
const cfg = require('./config');
const { requestJson, ProviderError } = require('./http');
const CODE = 'MUSICBRAINZ';
function check() {
  const c = cfg.musicbrainz;
  if (!c.enabled) return { state: 'disabled' };
  if (!c.userAgent) return { state: 'missing_credentials', missing: ['MUSICBRAINZ_USER_AGENT'] };
  if (!/\(.*(@|https?:\/\/).*\)/.test(c.userAgent)) return { state: 'invalid_config', message: 'MUSICBRAINZ_USER_AGENT must include contact details in parentheses.' };
  return { state: 'ready' };
}
function assertReady() {
  const s = check();
  if (s.state === 'disabled') throw new ProviderError(CODE, 'DISABLED', 'MusicBrainz is disabled (MUSICBRAINZ_ENABLED is not "true").');
  if (s.state !== 'ready') throw new ProviderError(CODE, 'MISCONFIGURED', s.message || `MusicBrainz needs ${s.missing.join(', ')}.`);
}
function mapRecording(r) {
  const credit = (r['artist-credit'] || [])[0];
  const isrc = (r.isrcs || [])[0] || null;
  const release = (r.releases || [])[0];
  const year = release && release.date ? Number(String(release.date).slice(0, 4)) : null;
  return {
    externalId: r.id, entityType: 'SONG', sourceUrl: `https://musicbrainz.org/recording/${r.id}`, rights: 'METADATA_ONLY',
    payload: { title: r.title, artist: credit ? (credit.name || (credit.artist && credit.artist.name)) : null,
      album: release ? release.title : null, releaseMbid: release?.id || null,
      duration_sec: r.length ? Math.round(r.length / 1000) : null,
      isrc: isrc && /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/.test(isrc) ? isrc : null,
      release_year: Number.isInteger(year) ? year : null, language: null, genre: null, explicit: false, content_rating: 'ALL', popularity: 40 },
  };
}
async function discover({ query = 'tag:indian AND country:IN', limit = 10, fetchImpl } = {}) {
  assertReady(); const c = cfg.musicbrainz;
  const url = `${c.baseUrl}/recording?query=${encodeURIComponent(query)}&limit=${Math.min(25, limit)}&fmt=json&inc=isrcs+artist-credits+releases`;
  const body = await requestJson(CODE, url, { headers: { 'User-Agent': c.userAgent }, timeoutMs: cfg.timeoutMs, retries: cfg.retries, minIntervalMs: c.minIntervalMs, fetchImpl });
  if (!body || !Array.isArray(body.recordings)) throw new ProviderError(CODE, 'BAD_RESPONSE', 'MusicBrainz response has no "recordings" list');
  return { label: `musicbrainz query "${query}"`, records: body.recordings.map(mapRecording) };
}
async function searchRecordings({ q, limit = 8, fetchImpl } = {}) {
  assertReady(); const c = cfg.musicbrainz;
  const query = String(q || '').trim();
  if (query.length < 2 || query.length > 120) throw new ProviderError(CODE, 'BAD_QUERY', 'Search query must be between 2 and 120 characters.');
  const url = `${c.baseUrl}/recording?query=${encodeURIComponent(query)}&limit=${Math.min(12, Math.max(1, Number(limit) || 8))}&fmt=json&inc=isrcs+artist-credits+releases`;
  const body = await requestJson(CODE, url, { headers: { 'User-Agent': c.userAgent }, timeoutMs: cfg.timeoutMs, retries: cfg.retries, minIntervalMs: c.minIntervalMs, fetchImpl });
  if (!body || !Array.isArray(body.recordings)) throw new ProviderError(CODE, 'BAD_RESPONSE', 'MusicBrainz response has no recordings list');
  return body.recordings.map((r) => {
    const mapped = mapRecording(r);
    return { ...mapped.payload, recordingMbid: r.id, recordingUrl: mapped.sourceUrl,
      releases: (r.releases || []).slice(0, 5).map((rel) => ({ id: rel.id, title: rel.title, date: rel.date || null, country: rel.country || null })) };
  });
}
async function coverArt(releaseMbid, { fetchImpl } = {}) {
  if (!/^[0-9a-f-]{36}$/i.test(String(releaseMbid || ''))) throw new ProviderError('COVER_ART_ARCHIVE', 'BAD_QUERY', 'A valid MusicBrainz release MBID is required.');
  const fetcher = fetchImpl || fetch;
  const url = `https://coverartarchive.org/release/${releaseMbid}/`;
  let response;
  try { response = await fetcher(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(cfg.timeoutMs) }); }
  catch { return { releaseMbid, front: null, images: [] }; }
  if (response.status === 404) return { releaseMbid, front: null, images: [] };
  if (!response.ok) throw new ProviderError('COVER_ART_ARCHIVE', 'HTTP_ERROR', `Cover Art Archive responded HTTP ${response.status}.`, { status: response.status });
  const body = await response.json();
  const images = (body.images || []).map((img) => ({
    front: !!img.front, back: !!img.back, image: img.image || null,
    thumbnails: img.thumbnails || {},
    types: img.types || [],
  }));
  const front = images.find((img) => img.front);
  return { releaseMbid, front: front?.thumbnails?.['500'] || front?.thumbnails?.large || front?.image || null, images };
}
module.exports = { code: CODE, check, discover, mapRecording, searchRecordings, coverArt };

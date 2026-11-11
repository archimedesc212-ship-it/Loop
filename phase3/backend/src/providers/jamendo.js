// Jamendo API v3 adapter. Streams are played directly from Jamendo's returned
// audio URL; LOOP does not download, cache, proxy, or re-host catalogue audio.
const cfg = require('./config');
const { requestJson, ProviderError } = require('./http');
const CODE = 'JAMENDO';

function check() {
  const c = cfg.jamendo;
  if (!c.enabled) return { state: 'disabled' };
  if (!c.clientId) return { state: 'missing_credentials', missing: ['JAMENDO_CLIENT_ID'] };
  if (!/^https:\/\//i.test(c.baseUrl)) return { state: 'invalid_config', message: 'JAMENDO_BASE_URL must use HTTPS.' };
  return { state: 'ready' };
}
function assertReady() {
  const state = check();
  if (state.state === 'disabled') throw new ProviderError(CODE, 'DISABLED', 'Jamendo is disabled (JAMENDO_ENABLED is not true).');
  if (state.state !== 'ready') throw new ProviderError(CODE, 'MISCONFIGURED', state.message || `Jamendo needs ${state.missing.join(', ')}.`);
}
function safeHttps(value) {
  try { const u = new URL(value); return u.protocol === 'https:' ? u.toString() : null; } catch { return null; }
}
function mapTrack(track) {
  if (!track || !track.id) return null;
  const streamUrl = safeHttps(track.audio);
  if (!streamUrl) return null;
  const licenseUrl = safeHttps(track.license_ccurl) || (typeof track.license_ccurl === 'string' && track.license_ccurl.startsWith('http://') ? track.license_ccurl.replace(/^http:/, 'https:') : null);
  const trackUrl = safeHttps(track.shareurl);
  const artworkUrl = safeHttps(track.album_image || track.image);
  const durationSec = Number(track.duration);
  return {
    id: String(track.id), title: String(track.name || 'Untitled track'),
    artist: String(track.artist_name || 'Unknown artist'), album: track.album_name || null,
    durationSec: Number.isFinite(durationSec) && durationSec > 0 ? Math.round(durationSec) : 0,
    artworkUrl, streamUrl, trackUrl, licenseUrl,
    license: track.license_ccname || track.license || null,
    attribution: `“${String(track.name || 'Untitled track')}” by ${String(track.artist_name || 'Unknown artist')} · Jamendo`,
    source: 'JAMENDO', playback: { playable: true, type: 'JAMENDO_STREAM', source: 'JAMENDO' },
  };
}
async function searchTracks({ q, limit = 12, fetchImpl } = {}) {
  assertReady();
  const query = String(q || '').trim();
  if (query.length < 2 || query.length > 120) throw new ProviderError(CODE, 'BAD_QUERY', 'Search query must be between 2 and 120 characters.');
  const c = cfg.jamendo;
  const params = new URLSearchParams({ client_id: c.clientId, format: 'json', search: query,
    limit: String(Math.max(1, Math.min(30, Number(limit) || 12))), include: 'licenses', audioformat: 'mp32' });
  const body = await requestJson(CODE, `${c.baseUrl.replace(/\/$/, '')}/tracks/?${params}`, {
    timeoutMs: cfg.timeoutMs, retries: cfg.retries, minIntervalMs: c.minIntervalMs, fetchImpl,
  });
  if (body?.headers?.status !== 'success' || !Array.isArray(body.results)) throw new ProviderError(CODE, 'BAD_RESPONSE', 'Jamendo response did not contain successful track results.');
  return body.results.map(mapTrack).filter(Boolean);
}
module.exports = { code: CODE, check, searchTracks, mapTrack, safeHttps };

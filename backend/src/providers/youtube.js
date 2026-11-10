// YouTube Data API v3 search. Playback is always the official YouTube iframe embed;
// LOOP never extracts, downloads, proxies, or re-hosts YouTube audio.
const cfg = require('./config');
const { requestJson, ProviderError } = require('./http');
const CODE = 'YOUTUBE_DATA';
function check() {
  const c = cfg.youtube;
  if (!c.enabled) return { state: 'disabled' };
  if (!c.apiKey) return { state: 'missing_credentials', missing: ['YOUTUBE_API_KEY'] };
  return { state: 'ready' };
}
function assertReady() {
  const s = check();
  if (s.state === 'disabled') throw new ProviderError(CODE, 'DISABLED', 'YouTube Data API is disabled (YOUTUBE_ENABLED is not "true").');
  if (s.state !== 'ready') throw new ProviderError(CODE, 'MISCONFIGURED', `YouTube Data API needs ${s.missing.join(', ')}.`);
}
function mapVideo(item) {
  const id = item && item.id && item.id.videoId;
  if (!id || !/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null;
  const sn = item.snippet || {};
  const thumbnail = sn.thumbnails && (sn.thumbnails.high || sn.thumbnails.medium || sn.thumbnails.default);
  return {
    externalId: id,
    sourceUrl: `https://www.youtube.com/watch?v=${id}`,
    embedUrl: `https://www.youtube.com/embed/${id}?enablejsapi=1`,
    title: sn.title || 'YouTube video',
    channel: sn.channelTitle || null,
    description: sn.description || '',
    publishedAt: sn.publishedAt || null,
    thumbnailUrl: thumbnail?.url || null,
    playback: { playable: true, type: 'YOUTUBE_EMBED', label: 'YouTube embedded player' },
  };
}
async function searchVideos({ q, max = 10, fetchImpl } = {}) {
  assertReady();
  const query = String(q || '').trim();
  if (query.length < 2 || query.length > 120) throw new ProviderError(CODE, 'BAD_QUERY', 'Search query must be between 2 and 120 characters.');
  const c = cfg.youtube;
  const params = new URLSearchParams({
    part: 'snippet', type: 'video', videoEmbeddable: 'true', videoSyndicated: 'true', q: query,
    maxResults: String(Math.max(1, Math.min(20, Number(max) || 10))), safeSearch: 'moderate', key: c.apiKey,
  });
  const body = await requestJson(CODE, `${c.baseUrl}/search?${params}`, {
    timeoutMs: cfg.timeoutMs, retries: cfg.retries, minIntervalMs: c.minIntervalMs, fetchImpl,
  });
  if (!body || !Array.isArray(body.items)) throw new ProviderError(CODE, 'BAD_RESPONSE', 'YouTube response has no "items" list');
  return body.items.map(mapVideo).filter(Boolean);
}
module.exports = { code: CODE, check, searchVideos, mapVideo };

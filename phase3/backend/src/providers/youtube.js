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
function parseIso8601Duration(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  const [, days = '0', hours = '0', minutes = '0', seconds = '0'] = match;
  const total = Number(days) * 86400 + Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  return Number.isSafeInteger(total) && total >= 0 ? total : null;
}

function mapVideo(item, detail = null) {
  const id = item && item.id && item.id.videoId;
  if (!id || !/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null;
  if (detail?.status?.embeddable === false) return null;
  const sn = item.snippet || {};
  const thumbnail = sn.thumbnails && (sn.thumbnails.high || sn.thumbnails.medium || sn.thumbnails.default);
  return {
    externalId: id,
    sourceUrl: `https://www.youtube.com/watch?v=${id}`,
    embedUrl: `https://www.youtube.com/embed/${id}?enablejsapi=1&autoplay=1&playsinline=1`,
    title: sn.title || 'YouTube video',
    channel: sn.channelTitle || null,
    description: sn.description || '',
    publishedAt: sn.publishedAt || null,
    thumbnailUrl: thumbnail?.url || null,
    durationSec: parseIso8601Duration(detail?.contentDetails?.duration),
    embeddable: detail?.status?.embeddable ?? true,
    playback: { playable: true, type: 'YOUTUBE_EMBED', label: 'YouTube embedded player' },
  };
}
async function searchVideos({ q, max = 10, fetchImpl } = {}) {
  assertReady();
  const query = String(q || '').trim();
  if (query.length < 2 || query.length > 120) throw new ProviderError(CODE, 'BAD_QUERY', 'Search query must be between 2 and 120 characters.');
  const c = cfg.youtube;
  const params = new URLSearchParams({
    part: 'snippet', type: 'video', videoCategoryId: '10', videoEmbeddable: 'true', videoSyndicated: 'true', q: query,
    maxResults: String(Math.max(1, Math.min(20, Number(max) || 10))), safeSearch: 'moderate', key: c.apiKey,
  });
  const body = await requestJson(CODE, `${c.baseUrl}/search?${params}`, {
    timeoutMs: cfg.timeoutMs, retries: cfg.retries, minIntervalMs: c.minIntervalMs, fetchImpl,
  });
  if (!body || !Array.isArray(body.items)) throw new ProviderError(CODE, 'BAD_RESPONSE', 'YouTube response has no "items" list');
  const ids = body.items.map((item) => item?.id?.videoId).filter((id) => typeof id === 'string' && /^[A-Za-z0-9_-]{6,20}$/.test(id));
  let details = new Map();
  if (ids.length) {
    const detailParams = new URLSearchParams({ part: 'contentDetails,status', id: ids.join(','), key: c.apiKey });
    try {
      // videos.list is a low-cost lookup that gives LOOP the real uploaded
      // duration and current embed permission. Search results remain usable if
      // this optional enrichment call is unavailable.
      const detailBody = await requestJson(CODE, `${c.baseUrl}/videos?${detailParams}`, {
        timeoutMs: Math.min(cfg.timeoutMs, 5000), retries: 0, minIntervalMs: c.minIntervalMs, fetchImpl,
      });
      if (Array.isArray(detailBody?.items)) {
        details = new Map(detailBody.items.map((item) => [item.id, item]));
      }
    } catch { /* Keep search results; duration will be shown as unavailable. */ }
  }
  return body.items.map((item) => mapVideo(item, details.get(item?.id?.videoId))).filter(Boolean);
}
module.exports = { code: CODE, check, searchVideos, mapVideo, parseIso8601Duration };

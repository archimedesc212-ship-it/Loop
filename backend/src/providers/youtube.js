// YouTube Data API v3 — finds a public video LINK for a song (metadata only).
// https://developers.google.com/youtube/v3  — API key from Google Cloud Console.
// Quota: by default a project may make 100 search.list calls per day (Google may change this;
// check the Quotas page of your Google Cloud project).
// MUSE stores the video id, title, channel and watch URL, and links out to
// YouTube. It never downloads, re-hosts or extracts audio from videos.
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
  return { externalId: id, sourceUrl: `https://www.youtube.com/watch?v=${id}`, title: sn.title || null, channel: sn.channelTitle || null, publishedAt: sn.publishedAt || null };
}

async function searchVideos({ q, max = 5, fetchImpl } = {}) {
  assertReady();
  const c = cfg.youtube;
  const params = new URLSearchParams({ part: 'snippet', type: 'video', q, maxResults: String(Math.min(10, max)), safeSearch: 'moderate', key: c.apiKey });
  const body = await requestJson(CODE, `${c.baseUrl}/search?${params}`, { timeoutMs: cfg.timeoutMs, retries: cfg.retries, minIntervalMs: c.minIntervalMs, fetchImpl });
  if (!body || !Array.isArray(body.items)) throw new ProviderError(CODE, 'BAD_RESPONSE', 'YouTube response has no "items" list');
  return body.items.map(mapVideo).filter(Boolean);
}

module.exports = { code: CODE, check, searchVideos, mapVideo };

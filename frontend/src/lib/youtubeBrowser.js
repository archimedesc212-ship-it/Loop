// Browser-side YouTube Data API helper. The public key can be entered once in
// LOOP Settings, or supplied through VITE_YOUTUBE_API_KEY at build time.
import { getYouTubeApiKey } from './providerSettings';

const CACHE_PREFIX = 'loop.youtubeSearch.v1.';
const CACHE_TTL_MS = 30 * 60 * 1000;

function readCachedSearch(query, limit) {
  try {
    const key = `${CACHE_PREFIX}${encodeURIComponent(query.toLowerCase())}.${limit}`;
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    if (value?.expiresAt > Date.now() && Array.isArray(value.items)) return value.items;
    if (value) localStorage.removeItem(key);
  } catch { /* cache is an optimisation only */ }
  return null;
}

function cacheSearch(query, limit, items) {
  try {
    const key = `${CACHE_PREFIX}${encodeURIComponent(query.toLowerCase())}.${limit}`;
    localStorage.setItem(key, JSON.stringify({ expiresAt: Date.now() + CACHE_TTL_MS, items }));
  } catch { /* storage may be full or disabled */ }
}

export async function searchYouTubeBrowser(query, limit = 5, { signal, apiKey } = {}) {
  const q = String(query || '').trim().slice(0, 120);
  if (q.length < 2) return [];
  const maxResults = Math.min(10, Math.max(1, Number(limit) || 5));
  if (signal?.aborted) throw signal.reason || new DOMException('The operation was aborted.', 'AbortError');
  const cached = readCachedSearch(q, maxResults);
  if (cached) return cached;
  const API_KEY = String(apiKey || getYouTubeApiKey()).trim();
  if (!API_KEY) return [];
  const params = new URLSearchParams({
    part: 'snippet', type: 'video', videoCategoryId: '10', videoEmbeddable: 'true', videoSyndicated: 'true',
    q, maxResults: String(maxResults),
    safeSearch: 'moderate', key: API_KEY,
  });
  const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, { signal });
  if (!response.ok) throw new Error(`YouTube search failed (${response.status}). Check the API key and referrer restrictions.`);
  const data = await response.json();
  const items = (data.items || []).filter((item) => item.id?.videoId);
  const ids = items.map((item) => item.id.videoId);
  let details = new Map();
  if (ids.length) {
    const detailParams = new URLSearchParams({ part: 'contentDetails,status', id: ids.join(','), key: API_KEY });
    try {
      const detailResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?${detailParams}`, { signal });
      if (detailResponse.ok) {
        const detailBody = await detailResponse.json();
        details = new Map((detailBody.items || []).map((item) => [item.id, item]));
      }
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      // Keep discovery results even if optional duration/embeddability details fail.
    }
  }
  const parseDuration = (value) => {
    const match = typeof value === 'string' && value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    if (!match) return null;
    return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
  };
  const mapped = items.filter((item) => details.get(item.id.videoId)?.status?.embeddable !== false).map((item) => {
    const id = item.id.videoId;
    const thumbs = item.snippet?.thumbnails || {};
    const detail = details.get(id);
    return {
      externalId: id,
      title: item.snippet?.title || 'YouTube video',
      channel: item.snippet?.channelTitle || 'YouTube',
      thumbnailUrl: (thumbs.high || thumbs.medium || thumbs.default)?.url || null,
      sourceUrl: `https://www.youtube.com/watch?v=${id}`,
      embedUrl: `https://www.youtube.com/embed/${id}?enablejsapi=1&autoplay=1&playsinline=1`,
      durationSec: parseDuration(detail?.contentDetails?.duration),
      embeddable: detail?.status?.embeddable !== false,
    };
  });
  cacheSearch(q, maxResults, mapped);
  return mapped;
}

/** Verify a key with a one-unit videos.list request (rather than a 100-unit search.list). */
export async function verifyYouTubeApiKey(apiKey, { fetchImpl = fetch, signal } = {}) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('Paste your YouTube Data API key first.');
  const params = new URLSearchParams({ part: 'id', id: 'dQw4w9WgXcQ', key });
  const response = await fetchImpl(`https://www.googleapis.com/youtube/v3/videos?${params}`, { signal });
  if (!response.ok) {
    let message = `YouTube rejected the key (HTTP ${response.status}).`;
    try { const body = await response.json(); if (body?.error?.message) message = body.error.message; } catch { /* keep HTTP message */ }
    throw new Error(message);
  }
  return true;
}

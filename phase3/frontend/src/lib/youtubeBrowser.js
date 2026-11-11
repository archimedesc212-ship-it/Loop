// Optional browser-side YouTube Data API fallback for database-free Vercel deployments.
// Restrict this key to YouTube Data API v3 and the deployed site's HTTP referrers in Google Cloud.
const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY || '';

export async function searchYouTubeBrowser(query, limit = 5, { signal } = {}) {
  if (!API_KEY) return [];
  const params = new URLSearchParams({
    part: 'snippet', type: 'video', videoCategoryId: '10', videoEmbeddable: 'true', videoSyndicated: 'true',
    q: String(query || '').slice(0, 120), maxResults: String(Math.min(10, Math.max(1, limit))),
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
  return items.filter((item) => details.get(item.id.videoId)?.status?.embeddable !== false).map((item) => {
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
}

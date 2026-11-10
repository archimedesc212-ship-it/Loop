// Optional browser-side YouTube Data API fallback for database-free Vercel deployments.
// Restrict this key to YouTube Data API v3 and the deployed site's HTTP referrers in Google Cloud.
const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY || '';

export async function searchYouTubeBrowser(query, limit = 5) {
  if (!API_KEY) return [];
  const params = new URLSearchParams({
    part: 'snippet', type: 'video', videoEmbeddable: 'true', videoSyndicated: 'true',
    q: String(query || '').slice(0, 120), maxResults: String(Math.min(10, Math.max(1, limit))),
    safeSearch: 'moderate', key: API_KEY,
  });
  const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  if (!response.ok) throw new Error(`YouTube search failed (${response.status}). Check the API key and referrer restrictions.`);
  const data = await response.json();
  return (data.items || []).filter((item) => item.id?.videoId).map((item) => {
    const id = item.id.videoId;
    const thumbs = item.snippet?.thumbnails || {};
    return {
      externalId: id,
      title: item.snippet?.title || 'YouTube video',
      channel: item.snippet?.channelTitle || 'YouTube',
      thumbnailUrl: (thumbs.high || thumbs.medium || thumbs.default)?.url || null,
      sourceUrl: `https://www.youtube.com/watch?v=${id}`,
      embedUrl: `https://www.youtube.com/embed/${id}?enablejsapi=1&autoplay=1&playsinline=1`,
      embeddable: true,
    };
  });
}

// Spotify catalogue search adapter.
// Authentication is supplied by the signed-in Spotify user via Authorization Code + PKCE.
// Track audio is never downloaded, proxied, cached, or re-hosted: the UI uses Spotify's
// official Embed player for playback.
const { requestJson, ProviderError } = require('./http');

const CODE = 'SPOTIFY';
const BASE = 'https://api.spotify.com/v1';

function check() {
  return { state: 'user_oauth_required', credential: 'Spotify Client ID configured in LOOP Settings; OAuth Authorization Code with PKCE' };
}

function mapTrack(track) {
  if (!track || typeof track.id !== 'string' || !/^[A-Za-z0-9]{10,32}$/.test(track.id)) return null;
  const album = track.album || {};
  const image = Array.isArray(album.images)
    ? album.images.find((item) => Number(item?.width) >= 250) || album.images[0]
    : null;
  const spotifyUrl = track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`;
  return {
    id: track.id,
    title: track.name || 'Untitled track',
    artists: Array.isArray(track.artists) ? track.artists.map((artist) => ({ id: artist.id || null, name: artist.name || 'Unknown artist', url: artist.external_urls?.spotify || null })) : [],
    artist: Array.isArray(track.artists) ? track.artists.map((artist) => artist.name).filter(Boolean).join(', ') : 'Unknown artist',
    album: { id: album.id || null, title: album.name || '', artworkUrl: image?.url || null, spotifyUrl: album.external_urls?.spotify || null },
    durationMs: Number.isFinite(track.duration_ms) ? track.duration_ms : null,
    explicit: !!track.explicit,
    popularity: Number.isFinite(track.popularity) ? track.popularity : null,
    spotifyUrl,
    spotifyUri: track.uri || `spotify:track:${track.id}`,
    embedUrl: `https://open.spotify.com/embed/track/${track.id}?utm_source=generator&theme=0`,
    playableInMarket: track.is_playable !== false,
  };
}

async function searchTracks({ q, limit = 12, market = 'IN', accessToken, fetchImpl } = {}) {
  const term = String(q || '').trim();
  if (term.length < 2 || term.length > 120) {
    throw new ProviderError(CODE, 'BAD_QUERY', 'Search query must be between 2 and 120 characters.');
  }
  if (typeof accessToken !== 'string' || accessToken.length < 20 || accessToken.length > 4096) {
    throw new ProviderError(CODE, 'AUTH_REQUIRED', 'Connect Spotify in Settings before searching the Spotify catalogue.');
  }
  const params = new URLSearchParams({
    q: term,
    type: 'track',
    limit: String(Math.max(1, Math.min(20, Number(limit) || 12))),
    market: /^[A-Z]{2}$/.test(market) ? market : 'IN',
  });
  const body = await requestJson(CODE, `${BASE}/search?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` }, timeoutMs: 9000, retries: 1, minIntervalMs: 120,
    fetchImpl: fetchImpl || fetch,
  });
  if (body?.error?.status === 401) throw new ProviderError(CODE, 'TOKEN_EXPIRED', 'Your Spotify connection expired. Reconnect Spotify in Settings.', { status: 401 });
  if (!Array.isArray(body?.tracks?.items)) throw new ProviderError(CODE, 'BAD_RESPONSE', 'Spotify returned an unexpected track search response.');
  return body.tracks.items.map(mapTrack).filter(Boolean);
}

module.exports = { code: CODE, check, searchTracks, mapTrack };

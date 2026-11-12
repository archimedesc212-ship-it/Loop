// Convert Spotify catalogue metadata into LOOP's queue shape.
// Playback remains inside Spotify's official iframe; LOOP never receives audio bytes.
export function toSpotifySong(track) {
  if (!track?.id || !track.embedUrl || !track.spotifyUrl || track.playableInMarket === false) return null;
  const artistName = track.artist || (Array.isArray(track.artists) ? track.artists.map((item) => item.name).join(', ') : '') || 'Unknown artist';
  return {
    id: `spotify-${track.id}`,
    title: track.title || 'Untitled track',
    artist: { name: artistName },
    album: { title: track.album?.title || '' },
    durationSec: Number.isFinite(track.durationMs) ? Math.round(track.durationMs / 1000) : 0,
    artworkUrl: track.album?.artworkUrl || null,
    cover: ['#1f2937', '#475569'],
    playback: { playable: true, type: 'SPOTIFY_EMBED' },
    spotify: { trackId: track.id, embedUrl: track.embedUrl, spotifyUrl: track.spotifyUrl },
    provider: 'Spotify',
  };
}

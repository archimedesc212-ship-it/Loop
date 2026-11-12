/**
 * A plain hand-off to Spotify's own app/site. This deliberately does not call
 * Spotify's Web API, display Spotify catalogue data, or stream Spotify audio.
 * LOOP is a multi-provider music app; adding Spotify Content/streams here would
 * require a policy review and written approval for any conflicting use case.
 */
export function spotifySearchUrl(query) {
  const value = String(query || '').trim();
  if (!value) return 'https://open.spotify.com/';
  return `https://open.spotify.com/search/${encodeURIComponent(value)}`;
}

const test = require('node:test');
const assert = require('node:assert/strict');
const spotify = require('../src/providers/spotify');
const http = require('../src/providers/http');

const sampleTrack = {
  id: '4uLU6hMCjMI75M1A2tKUQC',
  name: 'Never Gonna Give You Up',
  artists: [{ id: 'artist-1', name: 'Rick Astley', external_urls: { spotify: 'https://open.spotify.com/artist/artist-1' } }],
  album: {
    id: 'album-1', name: 'Whenever You Need Somebody',
    images: [{ width: 640, url: 'https://i.scdn.co/image/cover' }],
    external_urls: { spotify: 'https://open.spotify.com/album/album-1' },
  },
  duration_ms: 213000,
  popularity: 85,
  explicit: false,
  is_playable: true,
  external_urls: { spotify: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC' },
  uri: 'spotify:track:4uLU6hMCjMI75M1A2tKUQC',
};

test('Spotify adapter reports user OAuth as its credential mode', () => {
  assert.equal(spotify.check().state, 'user_oauth_required');
});

test('Spotify mapper keeps catalogue metadata and official embed links only', () => {
  const track = spotify.mapTrack(sampleTrack);
  assert.equal(track.title, 'Never Gonna Give You Up');
  assert.equal(track.artist, 'Rick Astley');
  assert.equal(track.durationMs, 213000);
  assert.equal(track.album.artworkUrl, 'https://i.scdn.co/image/cover');
  assert.equal(track.embedUrl, 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC?utm_source=generator&theme=0');
  assert.equal(track.spotifyUrl, sampleTrack.external_urls.spotify);
  assert.equal(Object.hasOwn(track, 'audioUrl'), false, 'the API adapter never invents a raw audio stream URL');
});

test('Spotify mapper rejects malformed ids and marks unavailable-in-market tracks', () => {
  assert.equal(spotify.mapTrack({ ...sampleTrack, id: 'not-a-spotify-id' }), null);
  assert.equal(spotify.mapTrack({ ...sampleTrack, is_playable: false }).playableInMarket, false);
});

test('Spotify search sends a bounded query with the user bearer token', async () => {
  http._reset();
  let requestUrl;
  let requestOptions;
  const results = await spotify.searchTracks({
    q: 'rick astley', limit: 99, market: 'IN', accessToken: 'a'.repeat(48),
    fetchImpl: async (url, options) => {
      requestUrl = new URL(url);
      requestOptions = options;
      return { ok: true, text: async () => JSON.stringify({ tracks: { items: [sampleTrack] } }) };
    },
  });
  assert.equal(requestUrl.pathname, '/v1/search');
  assert.equal(requestUrl.searchParams.get('q'), 'rick astley');
  assert.equal(requestUrl.searchParams.get('type'), 'track');
  assert.equal(requestUrl.searchParams.get('limit'), '20');
  assert.equal(requestUrl.searchParams.get('market'), 'IN');
  assert.equal(requestOptions.headers.Authorization, `Bearer ${'a'.repeat(48)}`);
  assert.equal(results.length, 1);
  assert.equal(results[0].id, sampleTrack.id);
});

test('Spotify search rejects missing user OAuth before calling the network', async () => {
  let called = false;
  await assert.rejects(
    spotify.searchTracks({ q: 'a song', fetchImpl: async () => { called = true; } }),
    (error) => error.code === 'AUTH_REQUIRED',
  );
  assert.equal(called, false);
});

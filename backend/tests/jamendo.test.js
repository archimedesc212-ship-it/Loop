const test = require('node:test');
const assert = require('node:assert/strict');
const cfg = require('../src/providers/config');
const jamendo = require('../src/providers/jamendo');

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, text: async () => JSON.stringify(body) });

test('Jamendo is off by default and reports missing credentials', () => {
  const old = { ...cfg.jamendo };
  try {
    Object.assign(cfg.jamendo, { enabled: false, clientId: '' });
    assert.equal(jamendo.check().state, 'disabled');
    Object.assign(cfg.jamendo, { enabled: true });
    assert.deepEqual(jamendo.check().missing, ['JAMENDO_CLIENT_ID']);
  } finally { Object.assign(cfg.jamendo, old); }
});

test('Jamendo search maps stream metadata and requests licences without caching', async () => {
  const old = { ...cfg.jamendo };
  try {
    Object.assign(cfg.jamendo, { enabled: true, clientId: 'test-client', baseUrl: 'https://jamendo.test/v3.0', minIntervalMs: 0 });
    let requested;
    const tracks = await jamendo.searchTracks({ q: 'ambient', limit: 5, fetchImpl: async (url) => {
      requested = new URL(url);
      return response({ headers: { status: 'success' }, results: [{ id: '123', name: 'Quiet Light', artist_name: 'Example Artist', duration: 187,
        audio: 'https://stream.jamendo.test/123.mp3', shareurl: 'https://www.jamendo.com/track/123',
        album_image: 'https://usercontent.jamendo.com/123.jpg', license_ccurl: 'http://creativecommons.org/licenses/by-nc-sa/4.0/' }] });
    } });
    assert.equal(requested.searchParams.get('client_id'), 'test-client');
    assert.equal(requested.searchParams.get('include'), 'licenses');
    assert.equal(tracks.length, 1);
    assert.equal(tracks[0].playback.type, 'JAMENDO_STREAM');
    assert.equal(tracks[0].durationSec, 187);
    assert.equal(tracks[0].streamUrl, 'https://stream.jamendo.test/123.mp3');
    assert.equal(tracks[0].licenseUrl, 'https://creativecommons.org/licenses/by-nc-sa/4.0/');
  } finally { Object.assign(cfg.jamendo, old); }
});

test('Jamendo rejects insecure stream URLs and malformed responses', async () => {
  const old = { ...cfg.jamendo };
  try {
    Object.assign(cfg.jamendo, { enabled: true, clientId: 'test-client', baseUrl: 'https://jamendo.test/v3.0', minIntervalMs: 0 });
    const mapped = jamendo.mapTrack({ id: '1', audio: 'http://insecure.test/a.mp3' });
    assert.equal(mapped, null);
    await assert.rejects(jamendo.searchTracks({ q: 'ambient', fetchImpl: async () => response({ nope: true }) }), (e) => e.code === 'BAD_RESPONSE');
  } finally { Object.assign(cfg.jamendo, old); }
});

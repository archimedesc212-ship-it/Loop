const test = require('node:test');
const assert = require('node:assert/strict');
const cfg = require('../src/providers/config');
const youtube = require('../src/providers/youtube');
const http = require('../src/providers/http');

test('YouTube search hydrates actual durations and excludes videos no longer embeddable', async () => {
  Object.assign(cfg.youtube, { enabled: true, apiKey: 'test-key', baseUrl: 'https://youtube.test/youtube/v3', minIntervalMs: 0 });
  http._reset();
  const urls = [];
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    urls.push(parsed);
    if (parsed.pathname.endsWith('/search')) {
      return { ok: true, text: async () => JSON.stringify({ items: [
        { id: { videoId: 'abcDEF12345' }, snippet: { title: 'Full song', channelTitle: 'Official', thumbnails: { high: { url: 'https://img.test/a.jpg' } } } },
        { id: { videoId: 'xyzABC12345' }, snippet: { title: 'Blocked embed', channelTitle: 'Uploader' } },
      ] }) };
    }
    return { ok: true, text: async () => JSON.stringify({ items: [
      { id: 'abcDEF12345', contentDetails: { duration: 'PT3M42S' }, status: { embeddable: true } },
      { id: 'xyzABC12345', contentDetails: { duration: 'PT35S' }, status: { embeddable: false } },
    ] }) };
  };
  const result = await youtube.searchVideos({ q: 'Full song', max: 2, fetchImpl });
  assert.equal(urls.length, 2);
  assert.equal(urls[1].pathname.endsWith('/videos'), true);
  assert.equal(urls[1].searchParams.get('part'), 'contentDetails,status');
  assert.equal(result.length, 1);
  assert.equal(result[0].durationSec, 222);
  assert.equal(result[0].embeddable, true);
});

test('YouTube search still returns usable results when optional duration hydration fails', async () => {
  Object.assign(cfg.youtube, { enabled: true, apiKey: 'test-key', baseUrl: 'https://youtube.test/youtube/v3', minIntervalMs: 0 });
  http._reset();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return { ok: true, text: async () => JSON.stringify({ items: [
      { id: { videoId: 'abcDEF12345' }, snippet: { title: 'Search result', channelTitle: 'Uploader' } },
    ] }) };
    return { ok: false, status: 403, headers: { get: () => null }, text: async () => '{}' };
  };
  const result = await youtube.searchVideos({ q: 'Search result', max: 1, fetchImpl });
  assert.equal(result.length, 1);
  assert.equal(result[0].durationSec, null);
});

test('YouTube ISO duration parser handles hours, minutes and seconds', () => {
  assert.equal(youtube.parseIso8601Duration('PT3M42S'), 222);
  assert.equal(youtube.parseIso8601Duration('PT1H2M3S'), 3723);
  assert.equal(youtube.parseIso8601Duration('P1DT1H'), 90000);
  assert.equal(youtube.parseIso8601Duration('not-a-duration'), null);
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveMusicProviderSettings } from './providerSettings';
import { searchYouTubeBrowser, verifyYouTubeApiKey } from './youtubeBrowser';

const response = (payload, ok = true, status = 200) => ({ ok, status, json: async () => payload });

describe('browser YouTube discovery', () => {
  beforeEach(() => {
    localStorage.clear();
    saveMusicProviderSettings({ youtubeApiKey: 'test-public-key' });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('returns embeddable music results and caches them for repeated homepage/search use', async () => {
    const fetchMock = vi.fn(async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/search')) return response({ items: [{
        id: { videoId: 'video-1' },
        snippet: { title: 'Global song', channelTitle: 'Artist', thumbnails: { high: { url: 'https://img.example/1.jpg' } } },
      }] });
      return response({ items: [{ id: 'video-1', contentDetails: { duration: 'PT3M10S' }, status: { embeddable: true } }] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = await searchYouTubeBrowser('global music', 5);
    const second = await searchYouTubeBrowser('global music', 5);

    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ title: 'Global song', durationSec: 190, embeddable: true });
    expect(first[0].embedUrl).toContain('enablejsapi=1');
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns no results when no API key or cached response exists', async () => {
    saveMusicProviderSettings({ youtubeApiKey: '' });
    vi.stubGlobal('fetch', vi.fn());
    expect(await searchYouTubeBrowser('unknown song')).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('tests a key with the lightweight videos.list endpoint', async () => {
    const fetchMock = vi.fn(async () => response({ items: [{ id: 'dQw4w9WgXcQ' }] }));
    await expect(verifyYouTubeApiKey('test-public-key', { fetchImpl: fetchMock })).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/videos?');
  });
});

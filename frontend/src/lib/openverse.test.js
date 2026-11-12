import { describe, expect, it, vi } from 'vitest';
import { formatOpenverseLicense, mapOpenverseTrack, searchOpenverseAudio } from './openverse';

const record = {
  id: '7d573956-f2f0-457a-9ed6-3b2de0280c4e',
  title: 'Ambient Dance',
  creator: 'Zeropage',
  creator_url: 'https://www.jamendo.com/artist/2986/zeropage',
  foreign_landing_url: 'https://www.jamendo.com/track/23557',
  url: 'https://prod-1.storage.jamendo.com/?trackid=23557&format=mp32',
  license: 'by',
  license_version: '3.0',
  license_url: 'https://creativecommons.org/licenses/by/3.0/',
  attribution: '“Ambient Dance” by Zeropage is licensed under CC BY 3.0.',
  category: 'music',
  duration: 228000,
  thumbnail: 'https://api.openverse.org/v1/audio/example/thumb/',
};

const okResponse = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe('Openverse audio adapter', () => {
  it('maps direct HTTPS audio with source, creator, attribution and licence', () => {
    const mapped = mapOpenverseTrack(record);
    expect(mapped).toMatchObject({
      id: record.id,
      title: 'Ambient Dance',
      artist: 'Zeropage',
      durationSec: 228,
      licenseLabel: 'CC BY 3.0',
      source: 'OPENVERSE',
      streamUrl: record.url,
      licenseUrl: record.license_url,
    });
  });

  it('rejects non-music results and tracks missing source or licence URLs', () => {
    expect(mapOpenverseTrack({ ...record, category: 'sound_effect' })).toBeNull();
    expect(mapOpenverseTrack({ ...record, url: 'http://insecure.example/audio.mp3' })).toBeNull();
    expect(mapOpenverseTrack({ ...record, license_url: '' })).toBeNull();
  });

  it('rejects an unknown licence identifier instead of assuming reuse rights', () => {
    expect(mapOpenverseTrack({ ...record, license: 'unknown-license' })).toBeNull();
  });

  it('requests bounded anonymous audio search and maps returned results', async () => {
    const fetchImpl = vi.fn(async () => okResponse({ results: [record] }));
    const results = await searchOpenverseAudio('ambient', 50, { fetchImpl });
    const requestedUrl = new URL(fetchImpl.mock.calls[0][0]);
    expect(requestedUrl.searchParams.get('q')).toBe('ambient');
    expect(requestedUrl.searchParams.get('page_size')).toBe('20');
    expect(fetchImpl.mock.calls[0][1].cache).toBe('no-store');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(record.id);
  });

  it('reports rate limiting clearly and rejects malformed responses', async () => {
    await expect(searchOpenverseAudio('ambient', 5, { fetchImpl: async () => okResponse({}, 429) }))
      .rejects.toThrow(/limit reached/i);
    await expect(searchOpenverseAudio('ambient', 5, { fetchImpl: async () => okResponse({ nope: true }) }))
      .rejects.toThrow(/did not include audio results/i);
  });

  it('labels known Creative Commons licences', () => {
    expect(formatOpenverseLicense('by-nc-nd', '3.0')).toBe('CC BY-NC-ND 3.0');
    expect(formatOpenverseLicense('pdm')).toBe('Public Domain Mark');
  });
});

import { describe, expect, it } from 'vitest';
import { buildAppleMusicEmbed, normaliseMusicText, scoreAppleMusicMatch } from './appleMusic';

const song = { title: 'Creep', artist: { name: 'Radiohead' } };
const result = {
  wrapperType: 'track', kind: 'song', trackId: 123456,
  trackName: 'Creep', artistName: 'Radiohead', collectionId: 98765,
  collectionName: 'Pablo Honey', trackViewUrl: 'https://music.apple.com/in/album/pablo-honey/98765?i=123456',
  previewUrl: 'https://audio-ssl.itunes.apple.com/preview.mp3', trackTimeMillis: 240000,
};

describe('Apple Music link matching', () => {
  it('normalises accents and punctuation for safe matching', () => {
    expect(normaliseMusicText('Beyoncé — Déjà Vu!')).toBe('beyonce deja vu');
  });

  it('scores matching track and artist above an unrelated result', () => {
    expect(scoreAppleMusicMatch(song, result)).toBe(1);
    expect(scoreAppleMusicMatch(song, { ...result, artistName: 'Another Artist' })).toBeLessThan(0.78);
  });

  it('builds the official Apple Music embedded player URL with the matching track id', () => {
    expect(buildAppleMusicEmbed(result)).toEqual({
      embedUri: 'https://embed.music.apple.com/in/album/pablo-honey/98765?i=123456',
      storeUrl: result.trackViewUrl,
    });
  });

  it('rejects non-Apple URLs and entries without a track id', () => {
    expect(buildAppleMusicEmbed({ ...result, trackViewUrl: 'https://example.com/audio' })).toBeNull();
    expect(buildAppleMusicEmbed({ ...result, trackId: null })).toBeNull();
  });
});

describe('Apple Music catalogue lookup', () => {
  it('uses JSONP and returns an official embed for a close title-and-artist match', async () => {
    const fakeWindow = {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    };
    const fakeDocument = {
      createElement: () => ({ remove() {}, set async(value) { this.isAsync = value; } }),
      head: {
        appendChild(script) {
          const callback = new URL(script.src).searchParams.get('callback');
          queueMicrotask(() => fakeWindow[callback]({ results: [result] }));
        },
      },
    };
    const { lookupAppleMusic } = await import('./appleMusic');
    const match = await lookupAppleMusic(song, { documentRef: fakeDocument, windowRef: fakeWindow, timeoutMs: 500 });
    expect(match.embedUri).toBe('https://embed.music.apple.com/in/album/pablo-honey/98765?i=123456');
    expect(match.trackName).toBe('Creep');
    expect(match.previewUri).toBe('https://audio-ssl.itunes.apple.com/preview.mp3');
    expect(match.storefront).toBe('in');
  });

  it('returns null rather than selecting a weak or unrelated result', async () => {
    const fakeWindow = {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    };
    const fakeDocument = {
      createElement: () => ({ remove() {} }),
      head: {
        appendChild(script) {
          const callback = new URL(script.src).searchParams.get('callback');
          queueMicrotask(() => fakeWindow[callback]({ results: [{ ...result, trackName: 'Different Song', artistName: 'Different Artist' }] }));
        },
      },
    };
    const { lookupAppleMusic } = await import('./appleMusic');
    expect(await lookupAppleMusic(song, { documentRef: fakeDocument, windowRef: fakeWindow, timeoutMs: 500 })).toBeNull();
  });
});


describe('worldwide Apple catalogue search', () => {
  it('searches multiple storefronts and returns playable track metadata with artwork', async () => {
    const fakeWindow = {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    };
    const requested = [];
    const fakeDocument = {
      createElement: () => ({ remove() {} }),
      head: {
        appendChild(script) {
          const url = new URL(script.src);
          requested.push(url.searchParams.get('country'));
          const callback = url.searchParams.get('callback');
          queueMicrotask(() => fakeWindow[callback]({ results: [{ ...result, artworkUrl100: 'https://is1-ssl.mzstatic.com/image.jpg' }] }));
        },
      },
    };
    const { searchAppleMusicCatalog } = await import('./appleMusic');
    const songs = await searchAppleMusicCatalog('Creep Radiohead', { countries: ['in', 'us', 'gb'], documentRef: fakeDocument, windowRef: fakeWindow, timeoutMs: 500 });
    expect(requested).toEqual(['IN', 'US', 'GB']);
    expect(songs).toHaveLength(1);
    expect(songs[0].appleMusic.previewUri).toBe('https://audio-ssl.itunes.apple.com/preview.mp3');
    expect(songs[0].artworkUrl).toBe('https://is1-ssl.mzstatic.com/image.jpg');
    expect(songs[0].id).toBe('apple-123456');
  });

  it('rejects insecure or non-Apple preview URLs', async () => {
    const fakeWindow = { setTimeout: globalThis.setTimeout.bind(globalThis), clearTimeout: globalThis.clearTimeout.bind(globalThis) };
    const fakeDocument = { createElement: () => ({ remove() {} }), head: { appendChild(script) {
      const callback = new URL(script.src).searchParams.get('callback');
      queueMicrotask(() => fakeWindow[callback]({ results: [{ ...result, previewUrl: 'https://evil.example/audio.mp3' }] }));
    } } };
    const { searchAppleMusicCatalog } = await import('./appleMusic');
    const [song] = await searchAppleMusicCatalog('Creep Radiohead', { countries: ['us'], documentRef: fakeDocument, windowRef: fakeWindow, timeoutMs: 500 });
    expect(song.appleMusic.previewUri).toBeNull();
  });
});

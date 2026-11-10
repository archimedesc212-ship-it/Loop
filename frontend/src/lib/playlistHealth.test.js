import { describe, expect, test } from 'vitest';
import { analysePlaylistHealth, findPlaylistDuplicates } from './playlistHealth';

const song = (id, title, artist, extra = {}) => ({ id, title, artist: { id: artist, name: `Artist ${artist}` }, ...extra });

describe('playlist health', () => {
  test('groups duplicate titles by normalised title and artist', () => {
    const groups = findPlaylistDuplicates([
      song(1, 'Night—Drive', 4), song(2, 'night drive', 4), song(3, 'Night Drive', 5),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].map((x) => x.id)).toEqual([1, 2]);
  });

  test('reports unavailable, hidden, duplicate and abrupt-energy issues', () => {
    const songs = [
      song(1, 'A', 1, { playback: { playable: false }, dismissed: true, features: { energy: 0.1 } }),
      song(2, 'B', 1, { features: { energy: 0.9 } }),
      song(3, 'A', 1, { features: { energy: 0.9 } }),
    ];
    const health = analysePlaylistHealth(songs);
    expect(health.score).toBeLessThan(100);
    expect(health.counts).toMatchObject({ unavailable: 1, hidden: 1, duplicateExtras: 1, energyJumps: 1 });
    expect(health.issues.map((x) => x.code)).toEqual(expect.arrayContaining(['UNAVAILABLE', 'HIDDEN', 'DUPLICATES', 'ENERGY_JUMPS']));
  });

  test('does not penalise missing playability or audio-feature metadata', () => {
    const health = analysePlaylistHealth([song(1, 'A', 1), song(2, 'B', 2)]);
    expect(health.score).toBe(100);
    expect(health.issues).toEqual([]);
  });
});

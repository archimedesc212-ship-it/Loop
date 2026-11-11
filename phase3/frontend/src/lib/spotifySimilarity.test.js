import { describe, expect, it } from 'vitest';
import { FEATURE_KEYS, recommendByFeatureCentroid } from './spotifySimilarity';

const song = (id, title, f) => ({ id, title, releaseYear: 2000, features: {
  energy: f[0], valence: f[1], danceability: f[2], acousticness: f[3],
  instrumentalness: f[4], loudnessIndex: f[5],
} });

describe('Spotify notebook similarity adaptation', () => {
  const seed = song(1, 'Seed', [0.8, 0.75, 0.8, 0.1, 0.05, 0.9]);
  const near = song(2, 'Near', [0.78, 0.73, 0.82, 0.12, 0.04, 0.88]);
  const middle = song(3, 'Middle', [0.5, 0.5, 0.5, 0.5, 0.4, 0.5]);
  const far = song(4, 'Far', [0.08, 0.12, 0.1, 0.95, 0.9, 0.1]);

  it('uses the feature columns that exist in LOOP and includes release year', () => {
    expect(FEATURE_KEYS).toEqual(['energy', 'valence', 'danceability', 'acousticness', 'instrumentalness', 'loudnessIndex', 'releaseYear']);
  });

  it('ranks a feature-neighbour ahead of a dissimilar song and excludes seeds', () => {
    const ranked = recommendByFeatureCentroid([seed, near, middle, far], [seed], 10);
    expect(ranked.map((item) => item.song.title)).toEqual(['Near', 'Middle', 'Far']);
    expect(ranked[0].distance).toBeLessThan(ranked[2].distance);
  });

  it('uses the mean of multiple seed songs', () => {
    const seed2 = song(5, 'Seed 2', [0.76, 0.74, 0.79, 0.13, 0.06, 0.87]);
    const ranked = recommendByFeatureCentroid([seed, seed2, near, middle, far], [seed, seed2], 2);
    expect(ranked.map((item) => item.song.id)).toEqual([2, 3]);
  });

  it('returns an empty list for missing seeds or invalid catalogue features', () => {
    expect(recommendByFeatureCentroid([seed, near], [], 5)).toEqual([]);
    expect(recommendByFeatureCentroid([seed, { id: 7, features: {} }], [seed], 5)).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { makeCatalogue } from './demoMode';
import { regionalSeeds } from './regionalSeeds';

const offlineFallback = {
  schemaVersion: 1,
  source: { title: 'LOOP curated offline starter catalogue', recordCount: 0, fallback: true },
  artists: [],
  genres: [],
  records: [],
};

describe('database-free catalogue fallback', () => {
  it('uses curated seed metadata instead of inventing a placeholder track', () => {
    const catalogue = makeCatalogue(offlineFallback);

    expect(catalogue.songs).toHaveLength(regionalSeeds.length);
    expect(catalogue.songs.some((song) => song.title === 'LOOP Starter Track')).toBe(false);
    expect(catalogue.artists.length).toBeGreaterThan(0);
    expect(catalogue.genres.length).toBeGreaterThan(0);
    expect(catalogue.source.fallback).toBe(true);
  });

  it('still rejects an empty catalogue that is not explicitly marked as fallback', () => {
    expect(() => makeCatalogue({
      ...offlineFallback,
      source: { title: 'Unexpected empty catalogue', recordCount: 0 },
    })).toThrow(/missing or incomplete/i);
  });
});

import { describe, expect, it } from 'vitest';
import { buildSearchSuggestions } from './searchSuggestions';

describe('buildSearchSuggestions', () => {
  it('maps songs, artists and albums to searchable rows', () => {
    const rows = buildSearchSuggestions({
      songs: [{ id: 7, title: 'Night Drive', artist: { name: 'Nova' } }],
      artists: [{ id: 3, name: 'Nova', type: 'SOLO' }],
      albums: [{ id: 9, title: 'After Hours', artist: 'Nova' }],
    });
    expect(rows.map((row) => row.kind)).toEqual(['Song', 'Artist', 'Album']);
    expect(rows[0].query).toBe('Night Drive Nova');
    expect(rows[2].query).toBe('After Hours Nova');
  });

  it('limits each result group and tolerates missing data', () => {
    const rows = buildSearchSuggestions({
      songs: Array.from({ length: 10 }, (_, id) => ({ id, title: `Song ${id}` })),
      artists: Array.from({ length: 6 }, (_, id) => ({ id, name: `Artist ${id}` })),
      albums: Array.from({ length: 5 }, (_, id) => ({ id, title: `Album ${id}` })),
    });
    expect(rows).toHaveLength(10);
    expect(buildSearchSuggestions(null)).toEqual([]);
    expect(buildSearchSuggestions({ songs: [null], artists: [{}], albums: [{}] })).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { EMPTY_LYRICS, normalizeLyricsPayload } from './lyrics';

describe('normalizeLyricsPayload', () => {
  it('provides an empty lines array when an API response omits optional lines', () => {
    expect(normalizeLyricsPayload({ lyric: null })).toEqual({
      lyric: null, lines: [], note: null, favourite: false,
    });
  });

  it('keeps valid lyric rows and boolean favourite state', () => {
    const line = { id: 'line-1', text: 'Sample', annotations: [] };
    expect(normalizeLyricsPayload({ lines: [line, null, 'bad'], favourite: 1 }).lines).toEqual([line]);
    expect(normalizeLyricsPayload({ lines: [line], favourite: 1 }).favourite).toBe(true);
  });

  it('normalizes an absent response', () => {
    expect(normalizeLyricsPayload(undefined)).toEqual({ ...EMPTY_LYRICS });
  });
});

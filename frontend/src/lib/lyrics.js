export const EMPTY_LYRICS = Object.freeze({
  lyric: null,
  lines: [],
  note: null,
  favourite: false,
});

/** API responses may omit optional lyrics fields; normalize before rendering. */
export function normalizeLyricsPayload(payload) {
  const value = payload && typeof payload === 'object' ? payload : {};
  return {
    lyric: value.lyric && typeof value.lyric === 'object' ? value.lyric : null,
    lines: Array.isArray(value.lines)
      ? value.lines.filter((line) => line && typeof line === 'object')
      : [],
    note: value.note && typeof value.note === 'object' ? value.note : null,
    favourite: Boolean(value.favourite),
  };
}

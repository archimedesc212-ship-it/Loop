const normaliseText = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\b(feat(?:uring)?|ft)\.?\b.*$/i, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/** Same title + artist, independent of punctuation/case/diacritics. */
export function findPlaylistDuplicates(songs = []) {
  const groups = new Map();
  for (const song of songs) {
    const title = normaliseText(song.title);
    const artist = normaliseText(song.artist?.name);
    const version = normaliseText(song.version);
    if (!title || !artist) continue;
    const key = `${artist}::${title}::${version}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(song);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

/**
 * Playlist health is a transparent heuristic, not a model prediction.
 * Unknown playability is not scored as unavailable; only an explicit false is.
 */
export function analysePlaylistHealth(songs = []) {
  const list = Array.isArray(songs) ? songs : [];
  const duplicates = findPlaylistDuplicates(list);
  const unavailable = list.filter((song) => song.playback?.playable === false);
  const hidden = list.filter((song) => song.dismissed === true);
  const energyJumps = [];
  const artistRuns = [];
  let runStart = 0;

  for (let i = 1; i < list.length; i += 1) {
    const beforeRaw = list[i - 1].features?.energy;
    const afterRaw = list[i].features?.energy;
    const before = beforeRaw === null || beforeRaw === undefined ? NaN : Number(beforeRaw);
    const after = afterRaw === null || afterRaw === undefined ? NaN : Number(afterRaw);
    if (Number.isFinite(before) && Number.isFinite(after) && Math.abs(after - before) >= 0.45) {
      energyJumps.push({ from: list[i - 1], to: list[i], delta: Math.abs(after - before) });
    }
  }
  while (runStart < list.length) {
    let end = runStart + 1;
    const artistId = list[runStart].artist?.id;
    const artistName = list[runStart].artist?.name;
    while (end < list.length && (artistId != null
      ? list[end].artist?.id === artistId
      : normaliseText(list[end].artist?.name) === normaliseText(artistName))) end += 1;
    if (end - runStart >= 3) artistRuns.push({ artist: artistName || 'Unknown artist', count: end - runStart });
    runStart = end;
  }

  const duplicateExtras = duplicates.reduce((sum, group) => sum + group.length - 1, 0);
  const penalty = unavailable.length * 12 + hidden.length * 12 + duplicateExtras * 8 + energyJumps.length * 4
    + artistRuns.reduce((sum, run) => sum + (run.count - 2) * 3, 0);
  const score = list.length ? Math.max(0, 100 - penalty) : 100;
  const issues = [];
  if (unavailable.length) issues.push({ code: 'UNAVAILABLE', count: unavailable.length, message: `${unavailable.length} track${unavailable.length === 1 ? '' : 's'} have no playable audio source.` });
  if (hidden.length) issues.push({ code: 'HIDDEN', count: hidden.length, message: `${hidden.length} track${hidden.length === 1 ? '' : 's'} are marked “Not for me”.` });
  if (duplicateExtras) issues.push({ code: 'DUPLICATES', count: duplicateExtras, message: `${duplicateExtras} duplicate entr${duplicateExtras === 1 ? 'y' : 'ies'} found across ${duplicates.length} title/artist group${duplicates.length === 1 ? '' : 's'}.` });
  if (energyJumps.length) issues.push({ code: 'ENERGY_JUMPS', count: energyJumps.length, message: `${energyJumps.length} adjacent transition${energyJumps.length === 1 ? '' : 's'} have a large energy change.` });
  if (artistRuns.length) issues.push({ code: 'ARTIST_RUNS', count: artistRuns.length, message: `${artistRuns.length} stretch${artistRuns.length === 1 ? '' : 'es'} play the same artist at least three times in a row.` });

  return {
    score,
    label: score >= 85 ? 'Healthy' : score >= 65 ? 'Could be smoother' : 'Needs attention',
    issues,
    duplicates,
    counts: { tracks: list.length, unavailable: unavailable.length, hidden: hidden.length, duplicateExtras, energyJumps: energyJumps.length, artistRuns: artistRuns.length },
  };
}

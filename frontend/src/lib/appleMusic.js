// Search Apple Music's public catalogue and open its official embedded player.
// LOOP does not download or store preview audio: the Apple iframe handles playback.
let callbackSequence = 0;
const LOOKUP_TIMEOUT_MS = 9000;

export function normaliseMusicText(value) {
  return String(value || '').normalize('NFKD').toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenScore(left, right) {
  const a = normaliseMusicText(left);
  const b = normaliseMusicText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length) * 0.18 + 0.82;
  const aa = new Set(a.split(' '));
  const bb = new Set(b.split(' '));
  const overlap = [...aa].filter((token) => bb.has(token)).length;
  return (2 * overlap) / (aa.size + bb.size);
}

export function scoreAppleMusicMatch(song, result) {
  if (!song || !result || !result.trackId || !result.trackViewUrl) return 0;
  const title = tokenScore(song.title, result.trackName);
  const artist = tokenScore(song.artist?.name, result.artistName);
  return title * 0.7 + artist * 0.3;
}

const slug = (value) => normaliseMusicText(value).replace(/\s+/g, '-').slice(0, 100) || 'song';

export function buildAppleMusicEmbed(result, country = 'in') {
  if (!result || !Number.isInteger(Number(result.trackId)) || !result.trackViewUrl) return null;
  const trackId = Number(result.trackId);
  const storeUrl = String(result.trackViewUrl);
  let source;
  try { source = new URL(storeUrl); } catch { return null; }
  if (!['music.apple.com', 'itunes.apple.com'].includes(source.hostname.toLowerCase())) return null;

  const parts = source.pathname.split('/').filter(Boolean);
  const storeCountry = /^[a-z]{2}$/i.test(parts[0] || '') ? parts[0].toLowerCase() : country.toLowerCase();
  let path;
  const albumIndex = parts.findIndex((part) => part.toLowerCase() === 'album');
  const songIndex = parts.findIndex((part) => part.toLowerCase() === 'song');
  if (albumIndex >= 0 && parts[albumIndex + 2] && /^\d+$/.test(parts[albumIndex + 2])) {
    const albumSlug = parts[albumIndex + 1] || slug(result.collectionName);
    const collectionId = Number(parts[albumIndex + 2]);
    path = `/${storeCountry}/album/${encodeURIComponent(albumSlug)}/${collectionId}`;
  } else if (songIndex >= 0 && parts[songIndex + 2] && /^\d+$/.test(parts[songIndex + 2])) {
    const songSlug = parts[songIndex + 1] || slug(result.trackName);
    path = `/${storeCountry}/song/${encodeURIComponent(songSlug)}/${trackId}`;
  } else if (Number.isInteger(Number(result.collectionId)) && Number(result.collectionId) > 0) {
    path = `/${storeCountry}/album/${encodeURIComponent(slug(result.collectionName))}/${Number(result.collectionId)}`;
  } else {
    path = `/${storeCountry}/song/${encodeURIComponent(slug(result.trackName))}/${trackId}`;
  }
  const embed = new URL(`https://embed.music.apple.com${path}`);
  if (albumIndex >= 0 || (result.collectionId && songIndex < 0)) embed.searchParams.set('i', String(trackId));
  return { embedUri: embed.href, storeUrl };
}

function chooseResult(song, results, country) {
  const candidates = (Array.isArray(results) ? results : [])
    .filter((item) => item && item.wrapperType === 'track' && item.kind === 'song' && item.trackId && item.trackViewUrl)
    .map((item) => ({ item, score: scoreAppleMusicMatch(song, item) }))
    .sort((a, b) => b.score - a.score);
  const best = candidates[0];
  // Fail closed on loose matches: do not play a different track that happens
  // to share only a title or a broad artist name.
  if (!best || best.score < 0.78 || tokenScore(song.title, best.item.trackName) < 0.78 || tokenScore(song.artist?.name, best.item.artistName) < 0.66) return null;
  const links = buildAppleMusicEmbed(best.item, country);
  if (!links) return null;
  return {
    ...links,
    trackId: best.item.trackId,
    trackName: best.item.trackName,
    artistName: best.item.artistName,
    artworkUrl: best.item.artworkUrl100 || null,
    collectionName: best.item.collectionName || null,
  };
}

/** JSONP is used because Apple's Search API documents script callbacks for cross-site search. */
export function lookupAppleMusic(song, { country = 'in', timeoutMs = LOOKUP_TIMEOUT_MS, documentRef = globalThis.document, windowRef = globalThis.window } = {}) {
  if (!documentRef || !windowRef || !song?.title || !song?.artist?.name) return Promise.resolve(null);
  const term = `${song.title} ${song.artist.name}`.trim();
  const url = new URL('https://itunes.apple.com/search');
  url.search = new URLSearchParams({ term, country: country.toUpperCase(), media: 'music', entity: 'song', limit: '8' }).toString();
  const callbackName = `__loopAppleSearch${Date.now()}_${++callbackSequence}`;
  url.searchParams.set('callback', callbackName);

  return new Promise((resolve) => {
    const script = documentRef.createElement('script');
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      windowRef.clearTimeout(timer);
      script.onerror = null;
      script.remove();
      try { delete windowRef[callbackName]; } catch { windowRef[callbackName] = undefined; }
      resolve(value);
    };
    const timer = windowRef.setTimeout(() => finish(null), timeoutMs);
    windowRef[callbackName] = (payload) => finish(chooseResult(song, payload?.results, country));
    script.async = true;
    script.src = url.href;
    script.onerror = () => finish(null);
    documentRef.head.appendChild(script);
  });
}

// Apple Music catalogue adapter. Playback uses Apple's official short preview
// in LOOP when available; otherwise the official Apple Music embed is rendered
// inline. No audio is scraped, downloaded or re-hosted by LOOP.
let callbackSequence = 0;
const LOOKUP_TIMEOUT_MS = 9000;
const DEFAULT_STOREFRONTS = ['us', 'gb', 'ca', 'au', 'in', 'de', 'fr', 'jp', 'kr', 'br', 'mx', 'za'];

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

export function buildAppleMusicEmbed(result, country = 'us') {
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

function safePreviewUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !/(^|\.)apple\.com$/i.test(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}

function mapResult(item, country) {
  const links = buildAppleMusicEmbed(item, country);
  if (!links) return null;
  return {
    ...links,
    trackId: Number(item.trackId),
    trackName: item.trackName,
    artistName: item.artistName,
    artworkUrl: item.artworkUrl600 || item.artworkUrl100 || null,
    collectionName: item.collectionName || null,
    previewUri: safePreviewUrl(item.previewUrl),
    durationSec: Number.isFinite(Number(item.trackTimeMillis)) ? Math.round(Number(item.trackTimeMillis) / 1000) : null,
    storefront: country,
  };
}

function jsonpSearch(term, country, { timeoutMs, documentRef, windowRef }) {
  const url = new URL('https://itunes.apple.com/search');
  url.search = new URLSearchParams({ term, country: country.toUpperCase(), media: 'music', entity: 'song', limit: '25' }).toString();
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
    const timer = windowRef.setTimeout(() => finish([]), timeoutMs);
    windowRef[callbackName] = (payload) => finish(Array.isArray(payload?.results) ? payload.results : []);
    script.async = true;
    script.src = url.href;
    script.onerror = () => finish([]);
    documentRef.head.appendChild(script);
  });
}

function preferredStorefront() {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || navigator.language || 'en-US';
    const country = locale.split(/[-_]/)[1]?.toLowerCase();
    return country && /^[a-z]{2}$/.test(country) ? country : 'us';
  } catch { return 'us'; }
}

function storefrontsFor(country, countries) {
  const preferred = String(country || preferredStorefront()).toLowerCase();
  const list = Array.isArray(countries) && countries.length ? countries : [preferred, ...DEFAULT_STOREFRONTS];
  return [...new Set(list.map((item) => String(item).toLowerCase()).filter((item) => /^[a-z]{2}$/.test(item)))].slice(0, 10);
}

/** Search a track across several Apple storefronts, deduplicating global results. */
export async function searchAppleMusicCatalog(term, { country, countries, timeoutMs = LOOKUP_TIMEOUT_MS, documentRef = globalThis.document, windowRef = globalThis.window } = {}) {
  const query = String(term || '').trim();
  if (query.length < 2 || !documentRef || !windowRef) return [];
  const stores = storefrontsFor(country, countries);
  const responses = await Promise.all(stores.map(async (store) => ({
    store,
    results: await jsonpSearch(query, store, { timeoutMs, documentRef, windowRef }),
  })));
  const seen = new Set();
  const output = [];
  for (const response of responses) {
    for (const item of response.results) {
      if (!item?.trackId || item.wrapperType !== 'track' || item.kind !== 'song' || seen.has(String(item.trackId))) continue;
      const mapped = mapResult(item, response.store);
      if (!mapped) continue;
      seen.add(String(item.trackId));
      output.push({
        id: `apple-${mapped.trackId}`,
        title: mapped.trackName,
        artist: { id: null, name: mapped.artistName },
        album: { id: mapped.trackId, title: mapped.collectionName || 'Single' },
        durationSec: mapped.previewUri ? 30 : (mapped.durationSec || 0),
        releaseYear: item.releaseDate ? Number(String(item.releaseDate).slice(0, 4)) : null,
        cover: ['#202020', '#1ed760'],
        artworkUrl: mapped.artworkUrl,
        playback: { playable: true, type: 'APPLE_MUSIC_LOOKUP', source: 'APPLE_MUSIC' },
        appleMusic: mapped,
        genre: { name: item.primaryGenreName || 'Music' },
        explicit: item.trackExplicitness === 'explicit',
      });
    }
  }
  return output;
}

/** Exact title + artist lookup for a LOOP catalogue record, across global storefronts. */
export async function lookupAppleMusic(song, options = {}) {
  if (!song?.title || !song?.artist?.name) return null;
  const results = await searchAppleMusicCatalog(`${song.title} ${song.artist.name}`, options);
  const candidates = results
    .map((item) => ({ item, score: scoreAppleMusicMatch(song, { trackId: item.appleMusic.trackId, trackViewUrl: item.appleMusic.storeUrl, trackName: item.title, artistName: item.artist.name }) }))
    .filter((candidate) => candidate.score >= 0.78)
    .sort((a, b) => (b.score - a.score) || Number(!!b.item.appleMusic.previewUri) - Number(!!a.item.appleMusic.previewUri));
  const best = candidates[0];
  if (!best || tokenScore(song.title, best.item.title) < 0.78 || tokenScore(song.artist.name, best.item.artist.name) < 0.66) return null;
  return best.item.appleMusic;
}

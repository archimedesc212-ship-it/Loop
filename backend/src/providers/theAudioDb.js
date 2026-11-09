// TheAudioDB v1 — artist/album metadata and artwork only (never audio).
// Free API: https://www.theaudiodb.com/free_music_api
// Shared free key 123; 30 requests/minute. Cache lookups and keep requests spaced.
const cfg = require('./config');
const { requestJson, ProviderError } = require('./http');

const CODE = 'THEAUDIODB';
const IMAGE_HOSTS = new Set(['r2.theaudiodb.com', 'www.theaudiodb.com']);
const cache = new Map();

const normalise = (s) => String(s || '').toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');

function imageUrl(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && IMAGE_HOSTS.has(u.hostname) ? u.href : null;
  } catch { return null; }
}

function check() {
  const c = cfg.theAudioDb;
  if (!c.enabled) return { state: 'disabled' };
  if (!c.apiKey) return { state: 'missing_credentials', missing: ['THEAUDIODB_API_KEY'] };

  let baseUrl;
  try {
    baseUrl = new URL(c.baseUrl || '');
  } catch {
    return { state: 'invalid_config', message: 'THEAUDIODB_BASE_URL must be a valid URL.' };
  }

  // Plain HTTP is accepted only for loopback test mocks, never in deployed environments.
  const localTestMock = process.env.NODE_ENV === 'test'
    && baseUrl.protocol === 'http:'
    && ['localhost', '127.0.0.1', '::1', '[::1]'].includes(baseUrl.hostname);
  if (baseUrl.protocol !== 'https:' && !localTestMock) {
    return {
      state: 'invalid_config',
      message: 'THEAUDIODB_BASE_URL must use HTTPS (HTTP is allowed only for loopback test mocks).',
    };
  }
  return { state: 'ready' };
}

function assertReady() {
  const s = check();
  if (s.state === 'disabled') throw new ProviderError(CODE, 'DISABLED', 'TheAudioDB is disabled (THEAUDIODB_ENABLED is not true).');
  if (s.state !== 'ready') throw new ProviderError(CODE, 'MISCONFIGURED', s.message || `TheAudioDB needs ${(s.missing || []).join(', ')}.`);
}

function endpoint(name, params = {}) {
  const c = cfg.theAudioDb;
  const base = String(c.baseUrl || '').replace(/\/$/, '');
  // Accept either the host root or an already-versioned API base without duplicating the path.
  const apiBase = /\/api\/v1\/json(?:\/)?$/i.test(base) ? base : `${base}/api/v1/json`;
  const url = new URL(`${apiBase}/${encodeURIComponent(c.apiKey)}/${name}.php`);
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v); });
  return url.toString();
}

async function cached(key, load) {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const value = await load();
  cache.set(key, { value, expiresAt: Date.now() + (value ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000) });
  return value;
}

async function getJson(name, params, fetchImpl) {
  assertReady();
  return requestJson(CODE, endpoint(name, params), {
    timeoutMs: cfg.timeoutMs, retries: cfg.retries,
    minIntervalMs: cfg.theAudioDb.minIntervalMs, fetchImpl,
  });
}

function mapArtist(row) {
  if (!row) return null;
  const id = row.idArtist || null;
  return {
    id,
    name: row.strArtist || null,
    banner: imageUrl(row.strArtistBanner),
    fanart: imageUrl(row.strArtistFanart),
    fanart2: imageUrl(row.strArtistFanart2),
    fanart3: imageUrl(row.strArtistFanart3),
    thumbnail: imageUrl(row.strArtistThumb),
    logo: imageUrl(row.strArtistLogo),
    clearart: imageUrl(row.strArtistClearart),
    biography: row.strBiographyEN || null,
    genre: row.strGenre || null,
    style: row.strStyle || null,
    country: row.strCountry || null,
    source: 'TheAudioDB',
    sourceUrl: 'https://www.theaudiodb.com/',
    attribution: 'Artist metadata and artwork via TheAudioDB',
  };
}

function mapAlbum(row) {
  if (!row) return null;
  return {
    id: row.idAlbum || null,
    title: row.strAlbum || null,
    artist: row.strArtist || null,
    year: row.intYearReleased ? Number(row.intYearReleased) : null,
    thumbnail: imageUrl(row.strAlbumThumb),
    highQualityThumbnail: imageUrl(row.strAlbumThumbHQ),
    cdArt: imageUrl(row.strAlbumCDart),
    source: 'TheAudioDB',
    sourceUrl: 'https://www.theaudiodb.com/',
    attribution: 'Album artwork via TheAudioDB',
  };
}

/** Free v1 artist search normally returns one match; reject fuzzy mismatches. */
async function searchArtist({ name, fetchImpl } = {}) {
  const query = String(name || '').trim();
  if (query.length < 2 || query.length > 100) throw new ProviderError(CODE, 'BAD_RESPONSE', 'Artist search must be between 2 and 100 characters.');
  const key = `artist:${normalise(query)}`;
  return cached(key, async () => {
    const body = await getJson('search', { s: query }, fetchImpl);
    const rows = Array.isArray(body.artists) ? body.artists : [];
    const wanted = normalise(query);
    const exact = rows.find((r) => normalise(r.strArtist) === wanted);
    return exact ? mapArtist(exact) : null;
  });
}

async function artistArtwork({ name, fetchImpl } = {}) {
  return searchArtist({ name, fetchImpl });
}

/** Album lookup by artist + title; free-key availability can vary by endpoint. */
async function searchAlbum({ artist, title, fetchImpl } = {}) {
  const artistName = String(artist || '').trim();
  const albumName = String(title || '').trim();
  if (artistName.length < 2 || albumName.length < 1) return null;
  const key = `album:${normalise(artistName)}:${normalise(albumName)}`;
  return cached(key, async () => {
    const body = await getJson('searchalbum', { s: artistName, a: albumName }, fetchImpl);
    const rows = Array.isArray(body.album) ? body.album : [];
    const wanted = normalise(albumName);
    const exact = rows.find((r) => normalise(r.strAlbum) === wanted
      && (!r.strArtist || normalise(r.strArtist) === normalise(artistName)));
    return exact ? mapAlbum(exact) : null;
  });
}

module.exports = {
  code: CODE, check, searchArtist, artistArtwork, searchAlbum,
  _resetCache: () => cache.clear(),
};

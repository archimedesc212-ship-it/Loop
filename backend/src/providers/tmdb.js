// TMDB (The Movie Database) — film metadata for soundtrack albums.
// https://developer.themoviedb.org/docs  — free API key; attribution required:
// "This product uses the TMDB API but is not endorsed or certified by TMDB."
// MUSE stores the TMDB id, title, year, overview and a link back. It does NOT
// download or store posters/backdrops (artwork terms are separate).
const cfg = require('./config');
const { requestJson, ProviderError } = require('./http');

const CODE = 'TMDB';
const ATTRIBUTION = 'This product uses the TMDB API but is not endorsed or certified by TMDB.';

function check() {
  const c = cfg.tmdb;
  if (!c.enabled) return { state: 'disabled' };
  if (!c.readToken && !c.apiKey) return { state: 'missing_credentials', missing: ['TMDB_READ_ACCESS_TOKEN (or TMDB_API_KEY)'] };
  return { state: 'ready' };
}

function assertReady() {
  const s = check();
  if (s.state === 'disabled') throw new ProviderError(CODE, 'DISABLED', 'TMDB is disabled (TMDB_ENABLED is not "true").');
  if (s.state !== 'ready') throw new ProviderError(CODE, 'MISCONFIGURED', `TMDB needs ${s.missing.join(', ')}.`);
}

function mapMovie(m) {
  const year = m.release_date ? Number(String(m.release_date).slice(0, 4)) : null;
  return {
    externalId: String(m.id),
    sourceUrl: `https://www.themoviedb.org/movie/${m.id}`,
    title: m.title || m.original_title,
    originalTitle: m.original_title || null,
    year: Number.isInteger(year) ? year : null,
    originalLanguage: m.original_language || null,
    overview: m.overview ? String(m.overview).slice(0, 600) : null,
  };
}

/** Search films by title (and year). Returns mapped candidates, best first. */
async function searchMovie({ title, year = null, language = null, fetchImpl } = {}) {
  assertReady();
  const c = cfg.tmdb;
  const params = new URLSearchParams({ query: title, include_adult: 'false' });
  if (year) params.set('year', String(year));
  if (language) params.set('language', language);
  const headers = {};
  if (c.readToken) headers.Authorization = `Bearer ${c.readToken}`; else params.set('api_key', c.apiKey);
  const body = await requestJson(CODE, `${c.baseUrl}/search/movie?${params}`, { headers, timeoutMs: cfg.timeoutMs, retries: cfg.retries, minIntervalMs: c.minIntervalMs, fetchImpl });
  if (!body || !Array.isArray(body.results)) throw new ProviderError(CODE, 'BAD_RESPONSE', 'TMDB response has no "results" list');
  return body.results.map(mapMovie);
}

module.exports = { code: CODE, check, searchMovie, mapMovie, ATTRIBUTION };

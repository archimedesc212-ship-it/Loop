const API_BASE = 'https://api.openverse.org/v1/audio/';

function safeHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function formatOpenverseLicense(license, version) {
  const code = String(license || '').toLowerCase();
  const names = {
    by: 'CC BY',
    'by-sa': 'CC BY-SA',
    'by-nc': 'CC BY-NC',
    'by-nc-sa': 'CC BY-NC-SA',
    'by-nd': 'CC BY-ND',
    'by-nc-nd': 'CC BY-NC-ND',
    cc0: 'CC0',
    pdm: 'Public Domain Mark',
  };
  const name = names[code] || (code ? code.toUpperCase() : 'Licence not listed');
  return version && name.startsWith('CC ') ? `${name} ${version}` : name;
}

export function mapOpenverseTrack(item) {
  if (!item || item.category !== 'music') return null;
  const streamUrl = safeHttps(item.url);
  const sourceUrl = safeHttps(item.foreign_landing_url);
  const licenseUrl = safeHttps(item.license_url);
  if (!item.id || !item.title || !streamUrl || !sourceUrl || !licenseUrl) return null;

  const licenseCode = String(item.license || '').toLowerCase();
  const knownLicenses = new Set(['by', 'by-sa', 'by-nc', 'by-nc-sa', 'by-nd', 'by-nc-nd', 'cc0', 'pdm']);
  if (!knownLicenses.has(licenseCode)) return null;

  const creator = String(item.creator || 'Unknown artist');
  const title = String(item.title || 'Untitled track');
  const rawDuration = Number(item.duration);
  // Openverse audio durations are returned in milliseconds.
  const durationSec = Number.isFinite(rawDuration) && rawDuration > 0 ? Math.round(rawDuration / 1000) : 0;
  const thumbnailUrl = safeHttps(item.thumbnail);
  const creatorUrl = safeHttps(item.creator_url);
  const licenseLabel = formatOpenverseLicense(item.license, item.license_version);

  return {
    id: String(item.id),
    title,
    artist: creator,
    durationSec,
    artworkUrl: thumbnailUrl,
    streamUrl,
    sourceUrl,
    creatorUrl,
    license: licenseCode,
    licenseVersion: item.license_version || null,
    licenseLabel,
    licenseUrl,
    attribution: String(item.attribution || `“${title}” by ${creator}. Source: Openverse.`),
    source: 'OPENVERSE',
  };
}

export async function searchOpenverseAudio(query, limit = 8, { fetchImpl = fetch, signal } = {}) {
  const q = String(query || '').trim();
  if (q.length < 2 || q.length > 120) throw new Error('Search query must be between 2 and 120 characters.');
  const pageSize = Math.max(1, Math.min(20, Number(limit) || 8));
  const url = new URL(API_BASE);
  url.searchParams.set('q', q);
  url.searchParams.set('page_size', String(pageSize));

  let response;
  try {
    response = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new Error('Openverse could not be reached. Check your connection and try again.');
  }

  if (response.status === 429) {
    throw new Error('Openverse search limit reached. Please wait before searching again.');
  }
  if (!response.ok) {
    throw new Error(`Openverse search failed (HTTP ${response.status}).`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Openverse returned an unreadable response.');
  }
  if (!payload || !Array.isArray(payload.results)) {
    throw new Error('Openverse response did not include audio results.');
  }
  return payload.results.map(mapOpenverseTrack).filter(Boolean);
}

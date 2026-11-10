import { demoRequest } from '../lib/demoMode';
// Thin fetch wrapper. Every call goes to the Express API (/api/...), which
// queries MySQL; the frontend never holds data it did not get from there.
//
// Authentication: the API keeps the session in an httpOnly cookie that page
// scripts cannot read. State-changing requests also send the CSRF token from the
// readable `muse_csrf` cookie (double-submit, verified server-side with an HMAC).
// No token is ever stored in localStorage.

export const isDemoMode = import.meta.env.VITE_DEMO_MODE !== 'false';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export function readCookie(name, source) {
  const all = source !== undefined ? source : (typeof document !== 'undefined' ? document.cookie : '');
  for (const part of String(all || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

// Earlier versions kept a JWT in localStorage; remove it so nothing stale lingers.
try { localStorage.removeItem('muse.token'); } catch { /* storage unavailable */ }

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };
let onNetwork = () => {};
export const setNetworkHandler = (fn) => { onNetwork = fn; };

/** Headers for a request: JSON, and the CSRF token on unsafe methods. */
export function buildHeaders(method, hasBody, cookieSource) {
  const headers = { Accept: 'application/json' };
  if (hasBody) headers['Content-Type'] = 'application/json';
  if (!SAFE.has(method)) {
    const csrf = readCookie('muse_csrf', cookieSource);
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }
  return headers;
}

const QUIET_401 = new Set(['/auth/me', '/auth/login', '/auth/register']);

export async function request(method, path, body) {
  // Presentation mode is intentionally database-free: all demo data stays in this browser.
  if (isDemoMode) return demoRequest(method, path, body);
  let res;
  let text;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  try {
    res = await fetch(`/api${path}`, {
      method, credentials: 'same-origin', headers: buildHeaders(method, body !== undefined),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    text = await res.text();
  } catch (err) {
    onNetwork(false);
    if (err && err.name === 'AbortError') {
      throw new ApiError(0, 'TIMEOUT', 'LOOP is taking too long to respond. Its server may be unavailable. Please try again shortly.');
    }
    throw new ApiError(0, 'NETWORK', 'Can’t reach the LOOP server. Check your connection or try again shortly.');
  } finally {
    clearTimeout(timeoutId);
  }
  onNetwork(res.status < 500);
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    const fallbackMessage = [502, 503, 504].includes(res.status)
      ? 'LOOP is temporarily unavailable. Please try again shortly.'
      : res.status === 404
        ? 'This LOOP endpoint was not found. Reload the page and try again.'
        : 'Something went wrong.';
    const e = data && data.error ? data.error : { code: `HTTP_${res.status}`, message: fallbackMessage };
    if (res.status === 401 && !QUIET_401.has(path)) onUnauthorized(e);
    throw new ApiError(res.status, e.code, e.message || fallbackMessage, e.details);
  }
  return data;
}

const qs = (o = {}) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return p.length ? `?${new URLSearchParams(p).toString()}` : '';
};

let pendingGuestSession = null;
function createGuestSession() {
  if (!pendingGuestSession) {
    pendingGuestSession = request('POST', '/auth/session', {}).finally(() => {
      pendingGuestSession = null;
    });
  }
  return pendingGuestSession;
}

export const api = {
  // auth & profile
  me: () => request('GET', '/auth/me'),
  session: () => request('GET', '/auth/session'),
  register: (b) => request('POST', '/auth/register', b),
  login: (b) => request('POST', '/auth/login', b),
  createGuestSession,
  logout: () => request('POST', '/auth/logout', {}),
  logoutAll: () => request('POST', '/auth/logout-all', {}),
  sessions: () => request('GET', '/me/sessions'),
  revokeSession: (id) => request('DELETE', `/me/sessions/${id}`),
  changePassword: (b) => request('POST', '/me/password', b),
  deleteAccount: (b) => request('DELETE', '/me', b),
  exportData: (b) => request('POST', '/me/export', b),
  moodDiary: (days = 90, asOfDate = undefined) => request('GET', `/me/mood-diary${qs({ days, asOfDate })}`),
  saveMoodDiaryToday: (b) => request('PUT', '/me/mood-diary/today', b),
  deleteMoodDiaryEntry: (id) => request('DELETE', `/me/mood-diary/${id}`),
  dismissals: () => request('GET', '/me/dismissals'),
  onboardingOptions: () => request('GET', '/me/onboarding'),
  saveOnboarding: (b) => request('POST', '/me/onboarding', b),
  updateSettings: (b) => request('PATCH', '/me/settings', b),
  // catalogue
  songs: (q) => request('GET', `/songs${qs(q)}`),
  song: (id) => request('GET', `/songs/${id}`),
  artist: (id) => request('GET', `/artists/${id}`),
  artistArtwork: (id) => request('GET', `/artists/${id}/artwork`),
  albumArtwork: (id) => request('GET', `/albums/${id}/artwork`),
  album: (id) => request('GET', `/albums/${id}`),
  film: (id) => request('GET', `/films/${id}`),
  language: (id) => request('GET', `/languages/${id}`),
  genres: () => request('GET', '/genres'),
  moods: () => request('GET', '/moods'),
  moodSongs: (id, q) => request('GET', `/moods/${id}/songs${qs(q)}`),
  contexts: () => request('GET', '/contexts'),
  languages: () => request('GET', '/languages'),
  regions: () => request('GET', '/regions'),
  search: (q) => request('GET', `/search${qs({ q })}`),
  trending: (q) => request('GET', `/trending${qs(q)}`),
  // recommendations
  recMood: (b) => request('POST', '/recommendations/mood', b),
  recDial: (b) => request('POST', '/recommendations/dial', b),
  recJourney: (b) => request('POST', '/recommendations/journey', b),
  parse: (text) => request('POST', '/recommendations/parse', { text }),
  recContext: (code, limit) => request('GET', `/recommendations/context/${code}${qs({ limit })}`),
  recDaily: (limit) => request('GET', `/recommendations/daily${qs({ limit })}`),
  recSimilar: (seed, limit) => request('GET', `/recommendations/similar${qs({ seed, limit })}`),
  recRegional: (languageId, limit) => request('GET', `/recommendations/regional${qs({ languageId, limit })}`),
  recDiscovery: (limit, intensity = 50) => request('GET', `/recommendations/discovery${qs({ limit, intensity })}`),
  recRecovery: () => request('GET', '/recommendations/recovery'),
  batch: (id) => request('GET', `/recommendations/batches/${id}`),
  rebuildBatch: (id) => request('POST', `/recommendations/batches/${id}/rebuild`, {}),
  // playback & feedback
  playStart: (b) => request('POST', '/playback/start', b),
  playEvent: (playId, b) => request('POST', `/playback/${playId}/events`, b),
  playFinish: (playId, b) => request('POST', `/playback/${playId}/finish`, b),
  playPrivate: (b) => request('POST', '/playback/private', b),
  history: (limit) => request('GET', `/history${qs({ limit })}`),
  rate: (songId, rating) => request('PUT', `/songs/${songId}/rating`, { rating }),
  unrate: (songId) => request('DELETE', `/songs/${songId}/rating`),
  // mood-wise percentage ratings (0–100): the user's own judgement, separate from the AI's mood confidence
  moodRatings: (songId) => request('GET', `/songs/${songId}/mood-ratings`),
  saveMoodRatings: (songId, ratings) => request('PUT', `/songs/${songId}/mood-ratings`, { ratings }),
  removeMoodRating: (songId, moodId) => request('DELETE', `/songs/${songId}/mood-ratings/${moodId}`),
  myMoodRatings: (q) => request('GET', `/me/mood-ratings${qs(q)}`),
  topRatedForMood: (moodId, q) => request('GET', `/moods/${moodId}/top-rated${qs(q)}`),
  like: (songId, liked) => request('PUT', `/songs/${songId}/like`, { liked }),
  likes: () => request('GET', '/likes'),
  dismiss: (songId, batchId) => request('PUT', `/songs/${songId}/dismiss`, batchId ? { batchId } : {}),
  undismiss: (songId) => request('DELETE', `/songs/${songId}/dismiss`),
  // playlists
  playlists: () => request('GET', '/playlists'),
  playlist: (id) => request('GET', `/playlists/${id}`),
  createPlaylist: (b) => request('POST', '/playlists', b),
  saveBatch: (b) => request('POST', '/playlists/from-batch', b),
  updatePlaylist: (id, b) => request('PATCH', `/playlists/${id}`, b),
  deletePlaylist: (id) => request('DELETE', `/playlists/${id}`),
  addToPlaylist: (id, songId) => request('POST', `/playlists/${id}/songs`, { songId }),
  removeFromPlaylist: (id, songId) => request('DELETE', `/playlists/${id}/songs/${songId}`),
  reorderPlaylist: (id, songIds) => request('PUT', `/playlists/${id}/order`, { songIds }),
  smartTypes: () => request('GET', '/playlists/smart'),
  smart: (type, limit) => request('GET', `/playlists/smart/${type}${qs({ limit })}`),
  saveSmart: (type, name) => request('POST', `/playlists/smart/${type}`, { name }),
  // insights
  profile: (days) => request('GET', `/insights/profile${qs({ days })}`),
  activity: () => request('GET', '/insights/activity'),
  calendarInsights: (days = 365) => request('GET', `/insights/calendar${qs({ days })}`),
  journey: (period) => request('GET', `/insights/journey${qs({ period })}`),
  skipPatterns: (days = 30) => request('GET', `/insights/skip-patterns${qs({ days })}`),
  preferences: () => request('GET', '/insights/preferences'),
  // independent artist onboarding and private audio upload
  artist: {
    profile: () => request('GET', '/artist/me'),
    apply: (b) => request('POST', '/artist/applications', b),
    createUpload: (b) => request('POST', '/artist/uploads', b),
    withdraw: (id) => request('POST', `/artist/uploads/${id}/withdraw`, {}),
    report: (id, b) => request('POST', `/artist/uploads/${id}/reports`, b),
    uploadFile: async (id, file) => {
      if (isDemoMode) throw new ApiError(400, 'DEMO_MODE', 'Artist uploads require the connected LOOP API. Set VITE_DEMO_MODE=false to use server-backed features.');
      let response;
      try {
        response = await fetch(`/api/artist/uploads/${id}/content`, {
          method: 'PUT', credentials: 'same-origin',
          headers: { ...buildHeaders('PUT', false), 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        });
      } catch {
        throw new ApiError(0, 'NETWORK', 'The upload connection was interrupted. The private upload intent can be retried only if it is still open.');
      }
      const raw = await response.text();
      let data = null;
      try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
      if (!response.ok) {
        const e = data?.error || { code: `HTTP_${response.status}`, message: 'The upload could not be completed.' };
        throw new ApiError(response.status, e.code, e.message, e.details);
      }
      return data;
    },
  },
  // private sessions & worlds
  incognito: () => request('GET', '/incognito'),
  startIncognito: (moodId) => request('POST', '/incognito', moodId ? { moodId } : {}),
  endIncognito: () => request('DELETE', '/incognito'),
  world: () => request('GET', '/worlds/current'),
  regenerateWorld: () => request('POST', '/worlds/current/regenerate'),
  rollbackWorld: () => request('POST', '/worlds/current/rollback'),
  worldFeedback: (id, feedback) => (feedback ? request('PUT', `/worlds/${id}/feedback`, { feedback }) : request('DELETE', `/worlds/${id}/feedback`)),
  // admin
  admin: {
    overview: () => request('GET', '/admin/overview'),
    permissions: () => request('GET', '/admin/permissions'),
    migrations: () => request('GET', '/admin/migrations'),
    stats: () => request('GET', '/admin/stats'),
    references: () => request('GET', '/admin/references'),
    songs: (q) => request('GET', `/admin/songs${qs(q)}`),
    song: (id) => request('GET', `/admin/songs/${id}`),
    createSong: (b) => request('POST', '/admin/songs', b),
    updateSong: (id, b) => request('PATCH', `/admin/songs/${id}`, b),
    deleteSong: (id) => request('DELETE', `/admin/songs/${id}`),
    curate: (id, moodId, b) => request('PUT', `/admin/songs/${id}/moods/${moodId}`, b),
    clearCuration: (id, moodId) => request('DELETE', `/admin/songs/${id}/moods/${moodId}`),
    merge: (b) => request('POST', '/admin/songs/merge', b),
    artists: (q) => request('GET', `/admin/artists${qs({ q })}`),
    createArtist: (b) => request('POST', '/admin/artists', b),
    createAlbum: (b) => request('POST', '/admin/albums', b),
    createMood: (b) => request('POST', '/admin/moods', b),
    addKeyword: (b) => request('POST', '/admin/mood-keywords', b),
    users: (q) => request('GET', `/admin/users${qs({ q })}`),
    updateUser: (id, b) => request('PATCH', `/admin/users/${id}`, b),
    models: () => request('GET', '/admin/models'),
    setParam: (id, code, value) => request('PATCH', `/admin/models/${id}/params/${code}`, { value }),
    activateModel: (id) => request('POST', `/admin/models/${id}/activate`),
    audit: (q) => request('GET', `/admin/audit${qs(q)}`),
    reviews: (status) => request('GET', `/admin/reviews${qs({ status })}`),
    decide: (id, b) => request('POST', `/admin/reviews/${id}/decision`, b),
    health: () => request('GET', '/admin/health'),
    performance: () => request('GET', '/admin/performance'),
    sources: () => request('GET', '/admin/sources'),
    updateSource: (code, b) => request('PATCH', `/admin/sources/${code}`, b),
    jobs: () => request('GET', '/admin/jobs'),
    job: (id) => request('GET', `/admin/jobs/${id}`),
    feeds: () => request('GET', '/admin/feeds'),
    ingest: (b) => request('POST', '/admin/pipeline/ingest', b),
    weekly: (force) => request('POST', '/admin/pipeline/weekly', { force }),
    trends: () => request('POST', '/admin/pipeline/trends', {}),
    providers: () => request('GET', '/admin/providers'),
    testProvider: (code) => request('POST', `/admin/providers/${code}/test`, {}),
    films: () => request('GET', '/admin/films'),
    enrichFilm: (id, tmdbId) => request('POST', `/admin/films/${id}/enrich`, tmdbId ? { tmdbId } : {}),
    videoLinks: (songId) => request('POST', `/admin/songs/${songId}/video-links`, {}),
    media: () => request('GET', '/admin/media'),
    checkMedia: () => request('POST', '/admin/media/check', {}),
    registerMedia: (songId, b) => request('POST', `/admin/songs/${songId}/media`, b),
    artistApplications: (status = 'PENDING') => request('GET', `/admin/artist-applications${qs({ status })}`),
    decideArtistApplication: (id, b) => request('POST', `/admin/artist-applications/${id}/decision`, b),
    artistUploads: (status = 'ALL') => request('GET', `/admin/artist-uploads${qs({ status })}`),
    scanArtistUpload: (id) => request('POST', `/admin/artist-uploads/${id}/scan`, {}),
    decideArtistUpload: (id, b) => request('POST', `/admin/artist-uploads/${id}/decision`, b),
    publishArtistUpload: (id) => request('POST', `/admin/artist-uploads/${id}/publish`, {}),
    artistRightsReports: (status = 'OPEN') => request('GET', `/admin/artist-rights-reports${qs({ status })}`),
    resolveArtistRightsReport: (id, b) => request('POST', `/admin/artist-rights-reports/${id}/decision`, b),
  },
};

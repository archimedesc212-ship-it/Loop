const CLIENT_KEY = 'loop.spotify.clientId.v1';
const ACCESS_KEY = 'loop.spotify.accessToken.v1';
const REFRESH_KEY = 'loop.spotify.refreshToken.v1';
const EXPIRY_KEY = 'loop.spotify.expiresAt.v1';
const VERIFIER_KEY = 'loop.spotify.pkceVerifier.v1';
const STATE_KEY = 'loop.spotify.oauthState.v1';

function storage() {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}
function session() {
  try { return typeof window !== 'undefined' ? window.sessionStorage : null; } catch { return null; }
}
function base64Url(bytes) {
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function randomToken(length = 64) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}
async function challengeFor(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export function getSpotifyClientId() {
  return storage()?.getItem(CLIENT_KEY) || '';
}
export function saveSpotifyClientId(value) {
  const clientId = String(value || '').trim();
  if (clientId && !/^[A-Za-z0-9]{20,64}$/.test(clientId)) throw new Error('Spotify Client ID format looks incorrect. Copy the Client ID from your Spotify Developer Dashboard.');
  const s = storage();
  if (!s) throw new Error('Browser storage is unavailable.');
  if (clientId) s.setItem(CLIENT_KEY, clientId); else s.removeItem(CLIENT_KEY);
  return clientId;
}
export function getSpotifyRedirectUri() {
  const { protocol, hostname, port, origin } = window.location;
  if (protocol === 'https:') return `${origin}/spotify/callback`;
  if (protocol === 'http:' && hostname === '127.0.0.1') return `${origin}/spotify/callback`;
  if (protocol === 'http:' && hostname === 'localhost') return `http://127.0.0.1${port ? `:${port}` : ''}/spotify/callback`;
  if (protocol === 'http:' && (hostname === '[::1]' || hostname === '::1')) return `http://[::1]${port ? `:${port}` : ''}/spotify/callback`;
  throw new Error('Spotify requires HTTPS, except for the explicit 127.0.0.1 or [::1] loopback addresses during local development.');
}
export function isSpotifyConnected() {
  const s = session();
  return !!(s?.getItem(ACCESS_KEY) && Number(s.getItem(EXPIRY_KEY) || 0) > Date.now() + 30000);
}
export function disconnectSpotify() {
  const s = session();
  [ACCESS_KEY, REFRESH_KEY, EXPIRY_KEY, VERIFIER_KEY, STATE_KEY].forEach((key) => s?.removeItem(key));
}

export async function beginSpotifyAuth(clientId) {
  if (window.location.protocol === 'http:' && window.location.hostname === 'localhost') {
    throw new Error('Spotify no longer accepts localhost redirect URIs. Open LOOP at http://127.0.0.1:5173, then connect again.');
  }
  const id = saveSpotifyClientId(clientId);
  if (!id) throw new Error('Add your Spotify Client ID first.');
  if (!window.crypto?.subtle) throw new Error('Spotify login needs a secure context (HTTPS or localhost) with Web Crypto support.');
  const verifier = randomToken(64);
  const state = randomToken(24);
  const challenge = await challengeFor(verifier);
  const s = session();
  if (!s) throw new Error('Session storage is unavailable.');
  s.setItem(VERIFIER_KEY, verifier);
  s.setItem(STATE_KEY, state);
  const params = new URLSearchParams({
    response_type: 'code', client_id: id, redirect_uri: getSpotifyRedirectUri(),
    code_challenge_method: 'S256', code_challenge: challenge, state,
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${params.toString()}`);
}

export async function completeSpotifyAuth(callbackUrl = window.location.href) {
  const url = new URL(callbackUrl);
  const error = url.searchParams.get('error');
  if (error) throw new Error(`Spotify authorisation was not completed: ${error.replace(/_/g, ' ')}.`);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const s = session();
  const expectedState = s?.getItem(STATE_KEY);
  const verifier = s?.getItem(VERIFIER_KEY);
  const clientId = getSpotifyClientId();
  if (!code || !returnedState || !expectedState || returnedState !== expectedState || !verifier || !clientId) {
    throw new Error('Spotify login could not be verified. Return to Settings and connect again.');
  }
  const body = new URLSearchParams({
    client_id: clientId, grant_type: 'authorization_code', code,
    redirect_uri: getSpotifyRedirectUri(), code_verifier: verifier,
  });
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(data.error_description || 'Spotify could not issue an access token. Check the Redirect URI in your Developer Dashboard.');
  s.setItem(ACCESS_KEY, data.access_token);
  if (data.refresh_token) s.setItem(REFRESH_KEY, data.refresh_token);
  s.setItem(EXPIRY_KEY, String(Date.now() + Number(data.expires_in || 3600) * 1000));
  s.removeItem(VERIFIER_KEY);
  s.removeItem(STATE_KEY);
  return true;
}

export async function getSpotifyAccessToken() {
  const s = session();
  const token = s?.getItem(ACCESS_KEY);
  const expiresAt = Number(s?.getItem(EXPIRY_KEY) || 0);
  if (token && expiresAt > Date.now() + 60000) return token;
  const refreshToken = s?.getItem(REFRESH_KEY);
  const clientId = getSpotifyClientId();
  if (!refreshToken || !clientId) return null;
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    disconnectSpotify();
    return null;
  }
  s.setItem(ACCESS_KEY, data.access_token);
  if (data.refresh_token) s.setItem(REFRESH_KEY, data.refresh_token);
  s.setItem(EXPIRY_KEY, String(Date.now() + Number(data.expires_in || 3600) * 1000));
  return data.access_token;
}

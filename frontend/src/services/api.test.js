import { afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { api, buildHeaders, readCookie, request, setUnauthorizedHandler, setNetworkHandler, ApiError } from './api';

const respond = (status, body) => Promise.resolve(new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

describe('cookies and CSRF headers', () => {
  it('reads one cookie by exact name and decodes it', () => {
    expect(readCookie('muse_csrf', 'a=1; muse_csrf=abc%20d; muse_csrf_x=no')).toBe('abc d');
    expect(readCookie('muse_session', 'muse_csrf=abc')).toBeNull();
    expect(readCookie('x', 'x=%E0%A4%A')).toBeNull();
  });
  it('sends the CSRF token only on state-changing requests', () => {
    const jar = 'muse_csrf=tok123';
    expect(buildHeaders('GET', false, jar)['X-CSRF-Token']).toBeUndefined();
    expect(buildHeaders('POST', true, jar)['X-CSRF-Token']).toBe('tok123');
    expect(buildHeaders('DELETE', false, jar)['X-CSRF-Token']).toBe('tok123');
    expect(buildHeaders('PATCH', true, '')['X-CSRF-Token']).toBeUndefined();
    expect(buildHeaders('POST', true, jar)['Content-Type']).toBe('application/json');
  });
  it('never stores a token in localStorage', async () => {
    localStorage.setItem('muse.token', 'old');
    vi.resetModules();
    await import('./api');
    expect(localStorage.getItem('muse.token')).toBeNull();
  });
});

describe('request()', () => {
  beforeEach(() => {
  // API transport tests must exercise fetch, not the intentional static-site demo adapter.
  vi.stubEnv('VITE_DEMO_MODE', 'false');
  setUnauthorizedHandler(() => {});
  setNetworkHandler(() => {});
});
afterAll(() => vi.unstubAllEnvs());

  it('uses same-origin credentials and returns parsed JSON', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond(200, { ok: 1 }));
    expect(await request('GET', '/songs')).toEqual({ ok: 1 });
    expect(f.mock.calls[0][0]).toBe('/api/songs');
    expect(f.mock.calls[0][1].credentials).toBe('same-origin');
  });

  it('turns API errors into ApiError with code, message and details', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond(400, { error: { code: 'VALIDATION_ERROR', message: 'Bad', details: { q: 'too short' } } }));
    await expect(request('GET', '/search?q=a')).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR', details: { q: 'too short' } });
  });

  it('reports an expired session, except for the quiet sign-in checks', async () => {
    const onUnauth = vi.fn();
    setUnauthorizedHandler(onUnauth);
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond(401, { error: { code: 'TOKEN_INVALID', message: 'expired' } }));
    await expect(request('GET', '/library')).rejects.toBeInstanceOf(ApiError);
    expect(onUnauth).toHaveBeenCalledTimes(1);
    await expect(request('POST', '/auth/login', {})).rejects.toBeInstanceOf(ApiError);
    await expect(request('GET', '/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(onUnauth).toHaveBeenCalledTimes(1);
  });

  it('a network failure is a NETWORK error and flips the offline signal', async () => {
    const net = vi.fn();
    setNetworkHandler(net);
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(request('GET', '/songs')).rejects.toMatchObject({ code: 'NETWORK', status: 0 });
    expect(net).toHaveBeenLastCalledWith(false);
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond(200, {}));
    await request('GET', '/songs');
    expect(net).toHaveBeenLastCalledWith(true);
  });

  it('a non-JSON error body still gives a readable error', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(new Response('<html>bad gateway</html>', { status: 502 })));
    await expect(request('GET', '/songs')).rejects.toMatchObject({ code: 'HTTP_502', message: 'LOOP is temporarily unavailable. Please try again shortly.' });
  });

  it('turns an aborted request into a bounded timeout error', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    await expect(request('POST', '/auth/login', { login: 'varsha', password: 'test' }))
      .rejects.toMatchObject({ code: 'TIMEOUT', status: 0 });
  });

  it('builds the new endpoints correctly', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond(200, {}));
    await api.dismiss(5, 9);
    await api.worldFeedback(3, null);
    await api.admin.enrichFilm(2, '123');
    expect(f.mock.calls.map((c) => [c[1].method, c[0], c[1].body])).toEqual([
      ['PUT', '/api/songs/5/dismiss', JSON.stringify({ batchId: 9 })],
      ['DELETE', '/api/worlds/3/feedback', undefined],
      ['POST', '/api/admin/films/2/enrich', JSON.stringify({ tmdbId: '123' })],
    ]);
  });
});

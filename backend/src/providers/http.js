// Shared HTTP client for external providers.
//  * timeout per attempt (AbortSignal.timeout)
//  * bounded retries with exponential back-off + jitter, only for retryable
//    failures (network errors, timeouts, 429, 5xx); honours Retry-After up to a cap
//  * a per-provider minimum interval between requests (simple client-side rate limit)
//  * every failure becomes a ProviderError with a stable code; secrets are never
//    included in error messages or logs (URLs are logged without query strings)
class ProviderError extends Error {
  constructor(provider, code, message, { status = null, retryable = false } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.code = code;          // DISABLED | MISCONFIGURED | TIMEOUT | NETWORK | RATE_LIMITED | HTTP_ERROR | BAD_RESPONSE | NOT_FOUND
    this.status = status;
    this.retryable = retryable;
  }
}

const lastCall = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function throttle(provider, minIntervalMs) {
  if (!minIntervalMs) return;
  const prev = lastCall.get(provider) || 0;
  const wait = prev + minIntervalMs - Date.now();
  lastCall.set(provider, Math.max(Date.now(), prev + minIntervalMs));
  if (wait > 0) await sleep(wait);
}

const safeUrl = (u) => {
  try {
    const x = new URL(u);
    const segments = x.pathname.split('/');
    const jsonIndex = segments.indexOf('json');
    if (jsonIndex > 0 && segments[jsonIndex - 1] === 'v1' && segments[jsonIndex + 1]) {
      segments[jsonIndex + 1] = '[redacted]';
    }
    return `${x.origin}${segments.join('/')}`;
  } catch { return '[invalid url]'; }
};

/**
 * request(provider, url, { method, headers, body, timeoutMs, retries, minIntervalMs, fetchImpl })
 * -> parsed JSON body. Throws ProviderError.
 */
async function requestJson(provider, url, opts = {}) {
  const { method = 'GET', headers = {}, body, timeoutMs = 8000, retries = 2, minIntervalMs = 0, fetchImpl = fetch, maxRetryAfterMs = 10000 } = opts;
  let attempt = 0;
  for (;;) {
    attempt += 1;
    await throttle(provider, minIntervalMs);
    let res;
    try {
      res = await fetchImpl(url, {
        method, headers: { Accept: 'application/json', ...headers },
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timeout = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
      const e = new ProviderError(provider, timeout ? 'TIMEOUT' : 'NETWORK',
        timeout ? `${provider} did not answer within ${timeoutMs} ms (${safeUrl(url)})` : `${provider} could not be reached (${safeUrl(url)})`, { retryable: true });
      if (attempt > retries) throw e;
      await sleep(backoff(attempt));
      continue;
    }
    if (res.ok) {
      const text = await res.text();
      try { return text ? JSON.parse(text) : {}; } catch {
        throw new ProviderError(provider, 'BAD_RESPONSE', `${provider} returned a response that is not JSON`, { status: res.status });
      }
    }
    const retryable = res.status === 429 || res.status >= 500;
    const code = res.status === 429 ? 'RATE_LIMITED' : res.status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR';
    const e = new ProviderError(provider, code, `${provider} responded HTTP ${res.status} (${safeUrl(url)})`, { status: res.status, retryable });
    if (!retryable || attempt > retries) throw e;
    const ra = Number(res.headers.get('retry-after'));
    await sleep(Number.isFinite(ra) && ra >= 0 ? Math.min(ra * 1000, maxRetryAfterMs) : backoff(attempt));
  }
}

const backoff = (attempt) => Math.min(4000, 250 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 100);

module.exports = { requestJson, ProviderError, safeUrl, _reset: () => lastCall.clear() };

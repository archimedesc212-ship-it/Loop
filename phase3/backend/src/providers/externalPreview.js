// Authorized external preview provider — a documented CONTRACT, not a specific
// vendor. Any licensed provider (or a small proxy in front of one) can be plugged
// in by implementing:
//
//   GET {EXTERNAL_PREVIEW_BASE_URL}/previews?isrc=<ISRC>
//   Authorization: Bearer {EXTERNAL_PREVIEW_API_KEY}
//   200 {"previewUrl":"https://…","expiresAt":"<ISO-8601>"?,"durationSec":30?,"attribution":"…"?}
//   404 when the provider has no preview for that recording
//
// MUSE never invents URLs: a song is "playable" from this provider only when the
// provider returns an https previewUrl for its ISRC at play time.
const cfg = require('./config');
const { requestJson, ProviderError } = require('./http');

const CODE = 'EXTERNAL_PREVIEW';

function check() {
  const c = cfg.externalPreview;
  if (!c.enabled) return { state: 'disabled' };
  const missing = [];
  if (!c.baseUrl) missing.push('EXTERNAL_PREVIEW_BASE_URL');
  if (!c.apiKey) missing.push('EXTERNAL_PREVIEW_API_KEY');
  if (missing.length) return { state: 'missing_credentials', missing };
  if (!/^https?:\/\//.test(c.baseUrl)) return { state: 'invalid_config', message: 'EXTERNAL_PREVIEW_BASE_URL must start with https://' };
  return { state: 'ready' };
}

/** Origin the browser must be allowed to load media from (for the CSP), or null. */
function mediaOrigin() {
  const o = process.env.EXTERNAL_PREVIEW_MEDIA_ORIGIN;
  return check().state === 'ready' && o && /^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(o) ? o : null;
}

/** -> { uri, expiresAt, durationSec, attribution } or null when no preview exists. */
async function resolvePreview({ isrc, fetchImpl } = {}) {
  const s = check();
  if (s.state !== 'ready') throw new ProviderError(CODE, s.state === 'disabled' ? 'DISABLED' : 'MISCONFIGURED', 'External preview provider is not configured.');
  if (!isrc || !/^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/.test(isrc)) return null;
  const c = cfg.externalPreview;
  let body;
  try {
    body = await requestJson(CODE, `${c.baseUrl.replace(/\/$/, '')}/previews?isrc=${encodeURIComponent(isrc)}`,
      { headers: { Authorization: `Bearer ${c.apiKey}` }, timeoutMs: Math.min(cfg.timeoutMs, 5000), retries: 1, fetchImpl });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return null;
    throw err;
  }
  if (!body || typeof body.previewUrl !== 'string' || !/^https:\/\//.test(body.previewUrl)) {
    throw new ProviderError(CODE, 'BAD_RESPONSE', 'Preview provider did not return an https previewUrl');
  }
  return {
    uri: body.previewUrl,
    expiresAt: body.expiresAt || null,
    durationSec: Number.isFinite(body.durationSec) ? body.durationSec : null,
    attribution: typeof body.attribution === 'string' ? body.attribution.slice(0, 200) : null,
  };
}

module.exports = { code: CODE, check, resolvePreview, mediaOrigin };

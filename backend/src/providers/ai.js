// Optional AI provider for natural-language mood input.
// MUSE's own parser (services/moodParser.js) always runs first and needs no AI.
// Only when it understands nothing, and AI_PROVIDER=anthropic is configured,
// the text is sent to the model, which may ONLY answer with mood names and a
// context code that already exist in the database. Anything else is discarded.
// Supported: Anthropic Messages API (https://docs.claude.com/en/api/messages).
const cfg = require('./config');
const { requestJson, ProviderError } = require('./http');

const CODE = 'AI';

function check() {
  const c = cfg.ai;
  if (c.provider === 'none' || !c.provider) return { state: 'disabled' };
  if (c.provider !== 'anthropic') return { state: 'invalid_config', message: `AI_PROVIDER "${c.provider}" is not supported (use "anthropic" or "none")` };
  const missing = [];
  if (!c.apiKey) missing.push('AI_API_KEY');
  if (!c.model) missing.push('AI_MODEL');
  return missing.length ? { state: 'missing_credentials', missing } : { state: 'ready' };
}

/** Pull the first JSON object out of a model reply and keep only known values. */
function parseReply(text, moodNames, contextCodes) {
  const m = /\{[\s\S]*\}/.exec(String(text || ''));
  if (!m) return { moods: [], context: null };
  let obj;
  try { obj = JSON.parse(m[0]); } catch { return { moods: [], context: null }; }
  const known = new Map(moodNames.map((n) => [n.toLowerCase(), n]));
  const moods = (Array.isArray(obj.moods) ? obj.moods : [])
    .map((x) => (typeof x === 'string' ? { name: x, weight: 1 } : x))
    .filter((x) => x && typeof x.name === 'string' && known.has(x.name.toLowerCase()))
    .slice(0, 3)
    .map((x) => ({ name: known.get(x.name.toLowerCase()), weight: Math.max(0.1, Math.min(1, Number(x.weight) || 1)) }));
  const context = typeof obj.context === 'string' && contextCodes.includes(obj.context.toUpperCase()) ? obj.context.toUpperCase() : null;
  return { moods, context };
}

async function interpretMood({ text, moodNames, contextCodes, fetchImpl }) {
  const s = check();
  if (s.state !== 'ready') throw new ProviderError(CODE, s.state === 'disabled' ? 'DISABLED' : 'MISCONFIGURED', 'AI provider is not configured.');
  const c = cfg.ai;
  const system = 'You map a listener\'s sentence to MUSICAL moods for a music recommender. You never diagnose people. '
    + `Reply with JSON only: {"moods":[{"name":"<one of: ${moodNames.join(', ')}>","weight":0.1-1}],"context":"<one of: ${contextCodes.join(', ')}> or null"}. `
    + 'Use at most 3 moods. If nothing fits, return {"moods":[],"context":null}.';
  const body = await requestJson(CODE, `${c.baseUrl.replace(/\/$/, '')}/messages`, {
    method: 'POST',
    headers: { 'x-api-key': c.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: { model: c.model, max_tokens: 200, system, messages: [{ role: 'user', content: String(text).slice(0, 280) }] },
    timeoutMs: c.timeoutMs, retries: 1, fetchImpl,
  });
  const reply = (body.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  return parseReply(reply, moodNames, contextCodes);
}

module.exports = { code: CODE, check, interpretMood, parseReply };

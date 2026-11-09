// Deterministic, explainable "describe how you feel" parser.
// The vocabulary lives in the database (mood_keywords, context_keywords), so
// curators can teach MUSE new phrases without changing code.
// This maps WORDS to MUSIC moods. It is not a psychological assessment.
const { query } = require('../config/db');
const { ai } = require('../providers');

const NEGATIONS = new Set(['not', 'no', 'never', "don't", 'dont', 'without', "isn't", 'isnt', "aren't", "wasn't", 'nothing', 'hardly', "can't", 'cant']);
const INTENSIFIERS = new Set(['very', 'really', 'so', 'super', 'extremely', 'totally', 'incredibly', 'too', 'bahut']);
const BRIGHT = new Set(['Happy', 'Euphoric', 'Energetic', 'Confident', 'Motivational', 'Adventurous']);

let cache = null;
let cacheAt = 0;
const TTL_MS = 60_000;

async function lexicon() {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;
  const [kw, ctx, moods, ctxNames] = await Promise.all([
    query('SELECT mk.phrase, mk.weight, m.mood_id, m.name FROM mood_keywords mk JOIN moods m ON m.mood_id = mk.mood_id'),
    query('SELECT ck.phrase, c.context_id, c.code, c.name FROM context_keywords ck JOIN contexts c ON c.context_id = ck.context_id'),
    query('SELECT mood_id, name FROM moods'),
    query('SELECT context_id, code, name FROM contexts'),
  ]);
  const entries = new Map();
  const get = (p) => entries.get(p) || entries.set(p, { phrase: p, moods: [], context: null }).get(p);
  kw.forEach((k) => get(k.phrase).moods.push({ moodId: k.mood_id, name: k.name, weight: Number(k.weight) }));
  ctx.forEach((c) => { get(c.phrase).context = { id: c.context_id, code: c.code, name: c.name }; });
  moods.forEach((m) => { const e = get(m.name.toLowerCase()); if (!e.moods.length) e.moods.push({ moodId: m.mood_id, name: m.name, weight: 1 }); });
  ctxNames.forEach((c) => { const e = get(c.name.toLowerCase()); if (!e.context) e.context = { id: c.context_id, code: c.code, name: c.name }; });
  cache = { list: [...entries.values()].sort((a, b) => b.phrase.length - a.phrase.length), moods, contexts: ctxNames };
  cacheAt = Date.now();
  return cache;
}

const invalidate = () => { cache = null; };
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalise = (t) => t.toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}'\s-]/gu, ' ').replace(/\s+/g, ' ').trim();

/**
 * parse("I've had a rough day and just want something peaceful")
 *  -> { moods: [{moodId,name,weight}], context: {...}|null, matches: [...], ignored: [...] }
 * Longest phrases win; a phrase preceded (within 3 words) by a negation is
 * either flipped ("not happy" -> low mood) or ignored, and every decision is
 * returned so the UI can show exactly how the text was read.
 */
async function parse(text) {
  const lex = await lexicon();
  const norm = normalise(text);
  const taken = new Array(norm.length).fill(false);
  const matches = [];
  for (const e of lex.list) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}'])(${escapeRe(e.phrase)})(?=$|[^\\p{L}\\p{N}'])`, 'gu');
    let m;
    while ((m = re.exec(norm))) {
      const start = m.index + m[1].length;
      const end = start + e.phrase.length;
      if (taken.slice(start, end).some(Boolean)) continue;
      for (let i = start; i < end; i++) taken[i] = true;
      const before = norm.slice(0, start).trim().split(' ').slice(-3);
      matches.push({ ...e, start, negated: before.some((w) => NEGATIONS.has(w)), boosted: INTENSIFIERS.has(before[before.length - 1]) });
    }
  }
  matches.sort((a, b) => a.start - b.start);

  const scores = new Map();
  const add = (id, name, w) => { const c = scores.get(id) || { moodId: id, name, weight: 0 }; c.weight += w; scores.set(id, c); };
  const byName = (n) => lex.moods.find((x) => x.name === n);
  let context = null;
  const ignored = [];
  for (const m of matches) {
    if (m.negated) {
      if (m.moods.some((x) => BRIGHT.has(x.name))) {
        const sad = byName('Sad'); const calm = byName('Calm');
        if (sad) add(sad.mood_id, 'Sad', 0.6);
        if (calm) add(calm.mood_id, 'Calm', 0.5);
        m.readAs = 'low mood';
      } else { ignored.push(m.phrase); m.readAs = 'ignored (negated)'; }
      continue;
    }
    m.moods.forEach((x) => add(x.moodId, x.name, x.weight * (m.boosted ? 1.25 : 1)));
    if (m.context && !context) context = m.context;
  }
  const ranked = [...scores.values()].sort((a, b) => b.weight - a.weight || a.moodId - b.moodId).slice(0, 3);
  const top = ranked[0]?.weight || 1;
  return {
    normalised: norm,
    moods: ranked.map((x) => ({ ...x, weight: Math.max(0.1, Math.round((x.weight / top) * 100) / 100) })),
    context,
    matches: matches.map((m) => ({ phrase: m.phrase, negated: m.negated, boosted: m.boosted, readAs: m.readAs || null,
      moods: m.moods.map((x) => x.name), context: m.context ? m.context.name : null })),
    ignored,
    source: 'LOCAL',
  };
}

/**
 * The local parser always runs first. Only when it understands nothing, and the
 * optional AI provider is configured, the sentence is sent to the model; its
 * answer is restricted to moods and contexts that exist in the database.
 * Never used in a private session (the text would leave MUSE).
 * An AI failure is reported in `ai` and the local result is returned.
 */
async function parseWithFallback(text, { allowAi = true, fetchImpl } = {}) {
  const local = await parse(text);
  if (local.moods.length || local.context || !allowAi || ai.check().state !== 'ready') return local;
  const lex = await lexicon();
  try {
    const r = await ai.interpretMood({ text, moodNames: lex.moods.map((m) => m.name), contextCodes: lex.contexts.map((c) => c.code), fetchImpl });
    const moods = r.moods.map((m) => {
      const row = lex.moods.find((x) => x.name === m.name);
      return { moodId: row.mood_id, name: row.name, weight: m.weight };
    });
    const c = r.context ? lex.contexts.find((x) => x.code === r.context) : null;
    return { ...local, moods, context: c ? { id: c.context_id, code: c.code, name: c.name } : null, source: moods.length || c ? 'AI' : 'LOCAL', ai: { used: true } };
  } catch (err) {
    console.warn(`[ai] ${err.code || 'ERROR'}: ${err.message}`);
    return { ...local, ai: { used: false, error: err.code || 'ERROR' } };
  }
}

module.exports = { parse, parseWithFallback, invalidate, normalise };

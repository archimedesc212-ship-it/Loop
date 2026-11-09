// MUSE World: a weekly, versioned, per-user musical world.
// Generation is deterministic: the same signals in the same week give the same
// world. Every input that shaped it is stored in weekly_worlds.signals.
const crypto = require('crypto');
const { query, one, withTransaction, call } = require('../config/db');
const ApiError = require('../utils/ApiError');
const rec = require('./recommendationService');

const hashInt = (s) => parseInt(crypto.createHash('sha256').update(s).digest('hex').slice(0, 8), 16);

/** Gather the evidence a world is built from (all from the permanent profile). */
async function signals(userId) {
  const [moods, lang, profile, prevWorld, regionMoods, month, wid] = await Promise.all([
    query(
      `SELECT ump.mood_id, m.name, ump.blended_score AS blended,
              GREATEST(ump.short_term_score, 0) / NULLIF(MAX(GREATEST(ump.short_term_score, 0)) OVER (), 0) AS short_norm
         FROM user_mood_preferences ump JOIN moods m ON m.mood_id = ump.mood_id
        WHERE ump.user_id = ? ORDER BY ump.blended_score DESC`, [userId]),
    one(
      `SELECT l.language_id, l.name, COUNT(*) AS plays FROM listening_history lh JOIN songs s ON s.song_id = lh.song_id
         JOIN languages l ON l.language_id = s.language_id
        WHERE lh.user_id = ? AND lh.skipped = 0 AND lh.started_at >= NOW() - INTERVAL 30 DAY
        GROUP BY l.language_id, l.name ORDER BY plays DESC LIMIT 1`, [userId]),
    one(`SELECT up.region_code, r.name AS region_name,
                (SELECT ul.language_id FROM user_languages ul WHERE ul.user_id = up.user_id ORDER BY ul.priority LIMIT 1) AS first_language
           FROM user_profiles up LEFT JOIN regions r ON r.region_code = up.region_code WHERE up.user_id = ?`, [userId]),
    one(`SELECT archetype_code, title FROM weekly_worlds WHERE user_id = ? AND status = 'ACTIVE'
          AND week_start < fn_week_start(CURDATE()) ORDER BY week_start DESC LIMIT 1`, [userId]),
    query(`SELECT entity_name AS mood, velocity_pct FROM v_latest_trends lt
            WHERE window_code = '7D' AND entity_type = 'MOOD'
              AND region_code = (SELECT region_code FROM user_profiles WHERE user_id = ?)
            ORDER BY momentum_rank LIMIT 3`, [userId]),
    one('SELECT MONTH(CURDATE()) AS m, fn_week_start(CURDATE()) AS week_start'),
    one(`SELECT model_id FROM intelligence_models WHERE kind = 'WORLD' AND is_active = 1`),
  ]);
  const moodScore = new Map(moods.map((m) => [m.mood_id, 0.5 * Number(m.blended) + 0.5 * Number(m.short_norm || 0)]));
  return { moods, moodScore, lang, profile, prevWorld, regionMoods, month: month.m, weekStart: month.week_start, worldModelId: wid.model_id };
}

/** Score every archetype against the user's mood taste, season and novelty — in SQL. */
async function scoreArchetypes(userId, sig) {
  return query(
    `SELECT wa.archetype_code, wa.name, wa.description, wa.motif, wa.palette, wa.title_words, wa.season_months,
            COALESCE(SUM(am.weight * COALESCE(0.5 * ump.blended_score
                + 0.5 * GREATEST(ump.short_term_score, 0) / NULLIF((SELECT MAX(short_term_score) FROM user_mood_preferences WHERE user_id = ?), 0), 0)), 0)
              / SUM(am.weight) AS taste_fit,
            FIND_IN_SET(?, COALESCE(wa.season_months, '')) > 0 AS in_season
       FROM world_archetypes wa
       JOIN archetype_moods am ON am.archetype_code = wa.archetype_code
       LEFT JOIN user_mood_preferences ump ON ump.user_id = ? AND ump.mood_id = am.mood_id
      GROUP BY wa.archetype_code, wa.name, wa.description, wa.motif, wa.palette, wa.title_words, wa.season_months`,
    [userId, String(sig.month), userId]);
}

async function feedbackByArchetype(userId, weekStart, weeks) {
  return query(
    `SELECT ww.archetype_code, SUM(wf.feedback = 'LOVE') AS love, SUM(wf.feedback = 'NOT_FOR_ME') AS nope
       FROM world_feedback wf JOIN weekly_worlds ww ON ww.world_id = wf.world_id
      WHERE wf.user_id = ? AND ww.week_start >= ? - INTERVAL ? WEEK
      GROUP BY ww.archetype_code`, [userId, weekStart, weeks]);
}

async function generate(userId, { jobId = null, force = false } = {}) {
  const user = await one('SELECT u.user_id AS id, up.region_code FROM users u JOIN user_profiles up USING (user_id) WHERE u.user_id = ?', [userId]);
  if (!user) throw ApiError.notFound('User');
  const sig = await signals(userId);
  const existing = await one(`SELECT world_id FROM weekly_worlds WHERE user_id = ? AND week_start = ? AND status = 'ACTIVE'`, [userId, sig.weekStart]);
  if (existing && !force) return { worldId: existing.world_id, created: false };

  const params = Object.fromEntries((await query('SELECT param_code, param_value FROM model_parameters WHERE model_id = ?', [sig.worldModelId]))
    .map((r) => [r.param_code, Number(r.param_value)]));
  const versionsSoFar = (await one('SELECT COUNT(*) AS n FROM weekly_worlds WHERE user_id = ? AND week_start = ?', [userId, sig.weekStart])).n;

  // explicit feedback on recent worlds ("Love this world" / "Not for me"), per archetype
  const fb = new Map((await feedbackByArchetype(userId, sig.weekStart, params.feedback_weeks || 6)).map((r) => [r.archetype_code, r]));

  // archetype choice: taste fit + season boost - novelty penalty + feedback + a tiny per-user jitter (deterministic)
  const arch = (await scoreArchetypes(userId, sig)).map((a) => {
    const jitter = (hashInt(`${userId}|${sig.weekStart}|${a.archetype_code}|${versionsSoFar}`) % 1000) / 20000;
    const f = fb.get(a.archetype_code);
    const feedback = f ? (params.feedback_love_boost || 0) * Math.min(2, Number(f.love)) - (params.feedback_dismiss_penalty || 0) * Math.min(2, Number(f.nope)) : 0;
    const score = Number(a.taste_fit) + (a.in_season ? params.season_boost : 0)
      - (sig.prevWorld && sig.prevWorld.archetype_code === a.archetype_code ? params.novelty_penalty : 0) + feedback + jitter;
    return { ...a, score, feedback };
  }).sort((x, y) => y.score - x.score);
  const chosen = arch[0];
  const words = typeof chosen.title_words === 'string' ? JSON.parse(chosen.title_words) : chosen.title_words;
  const palette = typeof chosen.palette === 'string' ? JSON.parse(chosen.palette) : chosen.palette;
  const h = hashInt(`${userId}|${sig.weekStart}|v${versionsSoFar}`);
  let title = `${words.lead[h % words.lead.length]} ${words.place[(h >>> 5) % words.place.length]}`;
  if (sig.prevWorld && sig.prevWorld.title === title) title = `${words.lead[(h + 1) % words.lead.length]} ${words.place[(h >>> 5) % words.place.length]}`;

  // moods for the world's playlist: archetype moods weighted by how much this user plays them
  const archMoods = await query(
    `SELECT am.mood_id AS moodId, m.name, am.weight FROM archetype_moods am JOIN moods m ON m.mood_id = am.mood_id
      WHERE am.archetype_code = ? ORDER BY am.weight DESC`, [chosen.archetype_code]);
  const moods = archMoods.map((m) => ({ ...m, weight: Math.min(1, m.weight * (0.6 + 0.4 * (sig.moodScore.get(m.moodId) || 0))) }));
  const primary = [...moods].sort((a, b) => b.weight - a.weight)[0];
  const base = rec.blend(await rec.moodRows(moods.map((m) => m.moodId)), (r) => moods.find((m) => m.moodId === r.mood_id).weight);
  const targets = rec.normalise(base);
  const topMoods = sig.moods.slice(0, 2).map((m) => m.name);
  const langId = sig.lang ? sig.lang.language_id : sig.profile.first_language;
  const langName = sig.lang ? sig.lang.name : (langId ? (await one('SELECT name FROM languages WHERE language_id = ?', [langId])).name : null);
  const description = `A ${chosen.name.toLowerCase()} world built from your ${topMoods.join(' and ').toLowerCase() || 'recent'} listening`
    + (langName ? `, with ${langName} at its heart` : '')
    + (chosen.in_season ? '. Tuned for the season.' : '.');

  const theme = { palette, motif: chosen.motif, seed: h % 100000, archetype: chosen.name };
  const evidence = {
    topMoods: sig.moods.slice(0, 4).map((m) => ({ mood: m.name, blended: Number(m.blended), recent: Math.round(Number(m.short_norm || 0) * 1000) / 1000 })),
    language: langName ? { name: langName, playsLast30d: sig.lang ? sig.lang.plays : 0, source: sig.lang ? 'listening' : 'settings' } : null,
    region: sig.profile.region_name || null,
    regionalTrendingMoods: sig.regionMoods,
    season: chosen.in_season ? { month: sig.month, months: chosen.season_months } : null,
    previousArchetype: sig.prevWorld ? sig.prevWorld.archetype_code : null,
    archetypeScores: arch.slice(0, 4).map((a) => ({ archetype: a.name, score: Math.round(a.score * 1000) / 1000 })),
    feedback: [...fb.values()].map((f) => ({ archetype: f.archetype_code, love: Number(f.love), notForMe: Number(f.nope) })),
  };

  const result = await withTransaction(async (tx) => {
    // lock this user's worlds for the week so two generators cannot create the same version
    await tx.query('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', [userId]);
    const { batchId } = await rec.runInTx(tx, { id: userId, incognitoId: null }, {
      strategy: 'WORLD', label: title, inputText: chosen.archetype_code, targets, moods, limit: params.songs_per_world,
    });
    const v = await tx.one('SELECT COALESCE(MAX(version), 0) + 1 AS v FROM weekly_worlds WHERE user_id = ? AND week_start = ?', [userId, sig.weekStart]);
    await tx.query("UPDATE weekly_worlds SET status = 'SUPERSEDED' WHERE user_id = ? AND week_start = ? AND status = 'ACTIVE'", [userId, sig.weekStart]);
    const ins = await tx.query(
      `INSERT INTO weekly_worlds (user_id, week_start, version, archetype_code, title, description, primary_mood_id, language_id,
                                  region_code, theme, signals, batch_id, job_id, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? + INTERVAL 7 DAY)`,
      [userId, sig.weekStart, v.v, chosen.archetype_code, title, description, primary.moodId, langId || null, user.region_code,
        JSON.stringify(theme), JSON.stringify(evidence), batchId, jobId, sig.weekStart]);
    return { worldId: ins.insertId, version: v.v };
  }, { isolation: 'READ COMMITTED', retries: 2 });
  return { ...result, created: true, title };
}

function mapWorld(w) {
  if (!w) return null;
  const parse = (x) => (typeof x === 'string' ? JSON.parse(x) : x);
  return {
    id: w.world_id, weekStart: w.week_start, version: w.version, status: w.status, title: w.title, description: w.description,
    archetype: { code: w.archetype_code, name: w.archetype_name, motif: w.motif },
    primaryMood: { id: w.primary_mood_id, name: w.primary_mood, emoji: w.primary_mood_emoji },
    language: w.language_name, region: w.region_name, theme: parse(w.theme), signals: parse(w.signals),
    batchId: w.batch_id, jobId: w.job_id, generatedAt: w.generated_at, expiresAt: w.expires_at,
    songCount: w.song_count, totalDurationSec: Number(w.total_duration_sec || 0),
  };
}

async function current(user) {
  let w = await one(`SELECT * FROM v_muse_world_summary WHERE user_id = ? AND status = 'ACTIVE' AND week_start = fn_week_start(CURDATE())`, [user.id]);
  if (!w) {
    // A private session never writes permanent data, so it never creates the week's world either.
    if (user.incognitoId) {
      throw new ApiError(409, 'INCOGNITO_ACTIVE', "This week's world has not been made yet. It is built from your permanent profile, so it will appear after your private session ends.");
    }
    // first visit this week and the weekly job has not reached this user yet
    await generate(user.id);
    w = await one(`SELECT * FROM v_muse_world_summary WHERE user_id = ? AND status = 'ACTIVE' AND week_start = fn_week_start(CURDATE())`, [user.id]);
  }
  const world = mapWorld(w);
  const list = await rec.getBatch({ ...user, permissions: new Set(['users.manage']) }, world.batchId);
  const versions = await query(
    `SELECT world_id AS id, version, status, title, archetype_code AS archetype, generated_at AS generatedAt
       FROM weekly_worlds WHERE user_id = ? AND week_start = ? ORDER BY version DESC`, [user.id, world.weekStart]);
  const history = await query(
    `SELECT world_id AS id, week_start AS weekStart, title, archetype_name AS archetype, primary_mood AS mood, theme
       FROM v_muse_world_summary WHERE user_id = ? AND status = 'ACTIVE' AND week_start < ? ORDER BY week_start DESC LIMIT 6`,
    [user.id, world.weekStart]);
  const fbRow = await one('SELECT feedback FROM world_feedback WHERE user_id = ? AND world_id = ?', [user.id, world.id]);
  world.feedback = fbRow ? fbRow.feedback : null;
  return { world, songs: list.songs, versions, history: history.map((h) => ({ ...h, theme: typeof h.theme === 'string' ? JSON.parse(h.theme) : h.theme })) };
}

function assertPermanent(user) {
  if (user.incognitoId) throw new ApiError(409, 'INCOGNITO_ACTIVE', 'Worlds cannot be changed during a private session.');
}

/**
 * Make a new version of this week's world. Generation runs in one transaction, so
 * if it fails the previous version stays active and the listener is told so.
 */
async function regenerate(user) {
  assertPermanent(user);
  try {
    await generate(user.id, { force: true });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.error('[world] refresh failed:', err.sqlMessage || err.message);
    throw new ApiError(503, 'WORLD_REFRESH_FAILED', 'MUSE could not build a new world just now. Your current world was kept — try again later.');
  }
  return current(user);
}

/** "Love this world" / "Not for me" — shapes which archetypes future worlds use. */
async function setFeedback(user, worldId, feedback) {
  assertPermanent(user);
  const w = await one('SELECT world_id, user_id FROM weekly_worlds WHERE world_id = ?', [worldId]);
  if (!w || w.user_id !== user.id) throw ApiError.notFound('World');
  if (feedback === null) {
    await query('DELETE FROM world_feedback WHERE user_id = ? AND world_id = ?', [user.id, worldId]);
  } else {
    await query(
      `INSERT INTO world_feedback (user_id, world_id, feedback) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE feedback = VALUES(feedback), updated_at = NOW()`, [user.id, worldId, feedback]);
  }
  return { worldId, feedback };
}

async function rollback(user) {
  assertPermanent(user);
  const w = await one(`SELECT week_start FROM weekly_worlds WHERE user_id = ? AND status = 'ACTIVE' AND week_start = fn_week_start(CURDATE())`, [user.id]);
  if (!w) throw ApiError.notFound('World for this week');
  await call('sp_rollback_world', [user.id, w.week_start]);
  return current(user);
}

module.exports = { generate, current, regenerate, rollback, setFeedback, mapWorld };

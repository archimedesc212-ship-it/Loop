const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let user;
before(async () => { await h.start(); user = await h.newUser(); });
after(h.stop);

const sorted = (songs) => songs.every((s, i) => i === 0 || songs[i - 1].score >= s.score);

test('picking moods returns a ranked, explained list stored in the database', async () => {
  const moods = await h.query("SELECT mood_id FROM moods WHERE name IN ('Calm', 'Dreamy')");
  const r = await h.api('POST', '/recommendations/mood', { token: user.token, body: { moodIds: moods.map((m) => m.mood_id), limit: 15 } });
  assert.equal(r.status, 200);
  assert.equal(r.body.songs.length, 15);
  assert.ok(sorted(r.body.songs), 'ordered by score DESC');
  assert.ok(r.body.songs.every((s) => s.reasons.length >= 1), 'every song has at least one stored reason');
  assert.ok(r.body.songs.every((s) => s.breakdown.signals.length === 8));
  const items = await h.one('SELECT COUNT(*) AS n FROM recommendation_items WHERE batch_id = ?', [r.body.batchId]);
  assert.equal(items.n, 15, 'list persisted in recommendation_items');
  const top = r.body.songs[0];
  assert.ok(top.moods.some((m) => ['Calm', 'Dreamy', 'Peaceful', 'Relaxed'].includes(m)));
});

test('an owned saved mix can be rebuilt from its original mood and audio targets', async () => {
  const moods = await h.query("SELECT mood_id FROM moods WHERE name IN ('Calm', 'Dreamy')");
  const original = await h.api('POST', '/recommendations/mood', { token: user.token, body: { moodIds: moods.map((m) => m.mood_id), limit: 8 } });
  assert.equal(original.status, 200);
  const refreshed = await h.api('POST', `/recommendations/batches/${original.body.batchId}/rebuild`, { token: user.token, body: {} });
  assert.equal(refreshed.status, 201);
  assert.notEqual(refreshed.body.batchId, original.body.batchId);
  assert.equal(refreshed.body.rebuiltFromBatchId, original.body.batchId);
  assert.deepEqual(refreshed.body.interpretation.targets, original.body.interpretation.targets);
  assert.deepEqual(refreshed.body.interpretation.moods.map((m) => m.id).sort(), original.body.interpretation.moods.map((m) => m.id).sort());
  const stranger = await h.newUser({ onboard: false });
  assert.equal((await h.api('POST', `/recommendations/batches/${original.body.batchId}/rebuild`, { token: stranger.token, body: {} })).status, 404);
});

test('text input is parsed deterministically, including negation and activity', async () => {
  const p = await h.api('POST', '/recommendations/parse', { token: user.token, body: { text: 'not happy, need something calm for studying' } });
  assert.equal(p.status, 200);
  const names = p.body.moods.map((m) => m.name);
  assert.ok(names.includes('Calm'));
  assert.ok(!names.includes('Happy'), 'negated mood is not used as asked');
  assert.equal(p.body.context.code, 'STUDY');
  assert.equal(p.body.matches.find((m) => m.phrase === 'happy').readAs, 'low mood');

  const r = await h.api('POST', '/recommendations/mood', { token: user.token, body: { text: 'I want something energetic', limit: 10 } });
  assert.equal(r.status, 200);
  const t = r.body.interpretation.targets;
  assert.ok(t.energy >= 0.7, 'energetic → high energy target');
  assert.ok(t.tempoMin >= 100, 'energetic → fast tempo');
  assert.ok(r.body.songs.slice(0, 5).every((s) => s.features.energy >= 0.6));
});

test('invalid and unintelligible mood input are rejected clearly', async () => {
  const bad = await h.api('POST', '/recommendations/mood', { token: user.token, body: { moodIds: [9999] } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'INVALID_MOOD');
  const gibberish = await h.api('POST', '/recommendations/mood', { token: user.token, body: { text: 'qwerty asdf zxcv' } });
  assert.equal(gibberish.status, 422);
  assert.ok(gibberish.body.error.details.suggestions.length > 0);
  const empty = await h.api('POST', '/recommendations/mood', { token: user.token, body: {} });
  assert.equal(empty.status, 400);
});

test('focus mode prefers instrumental, low-speech songs', async () => {
  const r = await h.api('GET', '/recommendations/context/STUDY?limit=10', { token: user.token });
  assert.equal(r.status, 200);
  const avgInstr = r.body.songs.reduce((s, x) => s + x.features.instrumentalness, 0) / r.body.songs.length;
  assert.ok(avgInstr > 0.6, `average instrumentalness ${avgInstr}`);
  assert.ok(r.body.songs.every((s) => s.features.speechiness < 0.25));
});

test('diversity: no artist appears more than the configured cap', async () => {
  const cap = await h.one(`SELECT param_value AS v FROM model_parameters mp JOIN intelligence_models im USING (model_id)
                            WHERE im.kind = 'RECOMMENDER' AND im.is_active = 1 AND mp.param_code = 'artist_cap'`);
  const r = await h.api('GET', '/recommendations/daily?limit=25', { token: user.token });
  const counts = {};
  r.body.songs.forEach((s) => { counts[s.artist.id] = (counts[s.artist.id] || 0) + 1; });
  assert.ok(Math.max(...Object.values(counts)) <= Number(cap.v));
});

test('discovery only returns songs the user has never played', async () => {
  const token = await h.login('varsha', 'Varsha@27');
  const me = await h.one("SELECT user_id FROM users WHERE username = 'varsha'");
  const r = await h.api('GET', '/recommendations/discovery?limit=15', { token });
  assert.equal(r.status, 200);
  const played = await h.query('SELECT DISTINCT song_id FROM listening_history WHERE user_id = ? AND song_id IN (?)', [me.user_id, r.body.songs.map((s) => s.id)]);
  assert.equal(played.length, 0);
});

test('content filter: a FAMILY listener never gets explicit songs', async () => {
  const token = await h.login('nila', 'Listener@123');
  const r = await h.api('POST', '/recommendations/mood', { token, body: { text: 'angry and energetic', limit: 40 } });
  assert.equal(r.status, 200);
  assert.ok(r.body.songs.every((s) => !s.explicit && s.contentRating === 'ALL'));
});

test('behaviour changes recommendations: a 1★ song disappears, a liked song seeds "Because you liked"', async () => {
  const u = await h.newUser();
  const first = await h.api('POST', '/recommendations/mood', { token: u.token, body: { text: 'energetic', limit: 10 } });
  const top = first.body.songs[0];
  const rated = await h.api('PUT', `/songs/${top.id}/rating`, { token: u.token, body: { rating: 1 } });
  assert.equal(rated.status, 200);
  const again = await h.api('POST', '/recommendations/mood', { token: u.token, body: { text: 'energetic', limit: 10 } });
  assert.ok(!again.body.songs.some((s) => s.id === top.id), '1★ means never again');

  await h.api('PUT', `/songs/${again.body.songs[2].id}/like`, { token: u.token, body: { liked: true } });
  const sim = await h.api('GET', '/recommendations/similar', { token: u.token });
  assert.equal(sim.status, 200);
  assert.equal(sim.body.seed.id, again.body.songs[2].id);
  assert.ok(!sim.body.songs.some((s) => s.id === again.body.songs[2].id), 'seed is not recommended to itself');
});

test('changing a model weight is reflected in recommendation scoring (configurable, not hard-coded)', async () => {
  const model = await h.one("SELECT model_id FROM intelligence_models WHERE kind = 'RECOMMENDER' AND is_active = 1");
  const old = await h.one("SELECT param_value AS v FROM model_parameters WHERE model_id = ? AND param_code = 'w_trend'", [model.model_id]);
  const body = { text: 'happy', limit: 10 };
  const a = await h.api('POST', '/recommendations/mood', { token: user.token, body });
  const originalWeight = Number(old.v);
  await h.query("UPDATE model_parameters SET param_value = 1 WHERE model_id = ? AND param_code = 'w_trend'", [model.model_id]);
  try {
    const b = await h.api('POST', '/recommendations/mood', { token: user.token, body });
    const trendSignal = (song) => song.breakdown.signals.find((signal) => signal.key === 'trend');
    assert.equal(trendSignal(a.body.songs[0]).weight, originalWeight);
    assert.equal(trendSignal(b.body.songs[0]).weight, 1);
    assert.ok(b.body.songs.some((song, i) => song.score !== a.body.songs.find((before) => before.id === song.id)?.score),
      'the changed trend weight changes calculated recommendation scores even when relative rank stays stable');
  } finally {
    await h.query("UPDATE model_parameters SET param_value = ? WHERE model_id = ? AND param_code = 'w_trend'", [old.v, model.model_id]);
  }
});

test('other strategies respond: daily, regional, recovery, worlds, recommendations/:userId', async () => {
  for (const p of ['/recommendations/daily', '/recommendations/regional', '/recommendations/recovery', '/worlds/current', `/recommendations/${user.id}`]) {
    const r = await h.api('GET', p, { token: user.token });
    assert.equal(r.status, 200, p);
  }
  const other = await h.api('GET', '/recommendations/3', { token: user.token });
  assert.equal(other.status, 403, "cannot read another listener's recommendations");
});

test('search finds songs, aliases and moods via SQL', async () => {
  const s = await h.api('GET', '/search?q=vennela', { token: user.token });
  assert.equal(s.status, 200);
  assert.ok(s.body.songs.some((x) => /vennela/i.test(x.title)));
  const calm = await h.api('GET', '/search?q=calm', { token: user.token });
  assert.ok(calm.body.moods.some((m) => m.name === 'Calm'));
  assert.ok(calm.body.songs.length > 0);
  const short = await h.api('GET', '/search?q=a', { token: user.token });
  assert.equal(short.status, 400);
  const nf = await h.api('GET', '/songs/999999', { token: user.token });
  assert.equal(nf.status, 404);
  const artistNf = await h.api('GET', '/artists/999999', { token: user.token });
  assert.equal(artistNf.status, 404);
});

test('concurrent recommendation requests do not deadlock (READ COMMITTED scoring + retry)', async () => {
  const token = await h.login('varsha', 'Varsha@27');
  const reqs = Array.from({ length: 12 }, (_, i) => (i % 2
    ? h.api('GET', '/recommendations/daily?limit=10', { token })
    : h.api('POST', '/recommendations/mood', { token, body: { text: 'energetic', limit: 10 } })));
  const res = await Promise.all(reqs);
  assert.deepEqual(res.map((r) => r.status), Array(12).fill(200));
});

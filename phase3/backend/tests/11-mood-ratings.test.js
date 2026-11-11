// Mood-wise percentage ratings (migration 0004): create, update, duplicates, limits, references,
// authorisation, averages, mood ranking (plain and Bayesian), unrated songs, private sessions,
// separation from the AI's song_moods, song merges and the database constraints themselves.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let A; let B; let C; let D;
let admin;
let songs;          // three ACTIVE, unexplicit songs that nobody has rated for the moods used here
let moodX;          // used for the per-song tests
let moodR;          // used for the ranking tests (no ratings at all when the suite starts)
let moodEmpty;      // a mood nobody rates in this suite
const created = [];

const rate = (u, songId, moodId, matchPercentage, extra = {}) =>
  h.api('PUT', `/songs/${songId}/mood-ratings/${moodId}`, { token: u.token, body: { matchPercentage, ...extra } });

before(async () => {
  await h.start();
  [A, B, C, D] = [await h.newUser(), await h.newUser(), await h.newUser(), await h.newUser()];
  created.push(A.id, B.id, C.id, D.id);
  admin = await h.login('admin', 'Admin@123');
  // moods with no user ratings at all, so averages and rankings are exactly predictable
  const free = await h.query(`SELECT m.mood_id FROM moods m
     WHERE NOT EXISTS (SELECT 1 FROM song_mood_ratings r WHERE r.mood_id = m.mood_id) ORDER BY m.mood_id`);
  assert.ok(free.length >= 3, 'need three moods without ratings');
  [moodX, moodR, moodEmpty] = free.slice(-3).map((m) => m.mood_id);
  songs = (await h.query(`SELECT song_id FROM songs WHERE status = 'ACTIVE' AND explicit = 0 AND content_rating = 'ALL'
                           ORDER BY song_id LIMIT 3`)).map((s) => s.song_id);
});

after(async () => {
  await h.query('DELETE FROM song_mood_ratings WHERE user_id IN (?)', [created]);
  await h.stop();
});

test('every mood comes from the database; an unrated song shows no rating, not 0 %', async () => {
  const r = await h.api('GET', `/songs/${songs[0]}/mood-ratings`, { token: A.token });
  assert.equal(r.status, 200);
  const moods = await h.query('SELECT mood_id FROM moods ORDER BY mood_id');
  assert.deepEqual(r.body.moods.map((m) => m.id).sort((a, b) => a - b), moods.map((m) => m.mood_id));
  const x = r.body.moods.find((m) => m.id === moodX);
  assert.equal(x.community, null);
  assert.equal(x.mine, null);
  assert.deepEqual(r.body.scale, { min: 0, max: 100, decimals: 2 });
  // AI confidence is reported exactly as the mood model stored it
  const ai = await h.query('SELECT mood_id, confidence FROM v_current_song_moods WHERE song_id = ?', [songs[0]]);
  for (const m of r.body.moods) {
    const hit = ai.find((a) => a.mood_id === m.id);
    assert.equal(m.aiConfidence, hit ? Number(hit.confidence) : null, `AI confidence for mood ${m.id}`);
  }
});

test('create, duplicate prevention and update', async () => {
  const c1 = await h.api('POST', `/songs/${songs[0]}/mood-ratings`, { token: A.token, body: { moodId: moodX, matchPercentage: 92.5, reviewText: 'Bright chorus' } });
  assert.equal(c1.status, 201);
  assert.equal(c1.body.saved[0].created, true);
  assert.deepEqual(c1.body.saved[0].community, { average: 92.5, count: 1, min: 92.5, max: 92.5, lastRatedAt: c1.body.saved[0].community.lastRatedAt });

  const dup = await h.api('POST', `/songs/${songs[0]}/mood-ratings`, { token: A.token, body: { moodId: moodX, matchPercentage: 10 } });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'DUPLICATE_MOOD_RATING');
  const row = await h.one('SELECT match_percentage, review_text FROM song_mood_ratings WHERE user_id = ? AND song_id = ? AND mood_id = ?', [A.id, songs[0], moodX]);
  assert.deepEqual({ pct: Number(row.match_percentage), review: row.review_text }, { pct: 92.5, review: 'Bright chorus' });

  const up = await rate(A, songs[0], moodX, 88.25);
  assert.equal(up.status, 200);
  assert.equal(up.body.saved[0].created, false);
  assert.equal(up.body.saved[0].previous, 92.5);
  const n = await h.one('SELECT COUNT(*) AS n, MAX(match_percentage) AS p FROM song_mood_ratings WHERE user_id = ? AND song_id = ? AND mood_id = ?', [A.id, songs[0], moodX]);
  assert.deepEqual({ n: n.n, p: Number(n.p) }, { n: 1, p: 88.25 });

  const mine = await h.api('GET', `/songs/${songs[0]}/mood-ratings`, { token: A.token });
  assert.equal(mine.body.moods.find((m) => m.id === moodX).mine.matchPercentage, 88.25);
});

test('0 and 100 are valid; anything outside 0–100 or with more than two decimals is rejected', async () => {
  assert.equal((await rate(B, songs[1], moodX, 0)).status, 201);
  assert.equal((await rate(B, songs[1], moodX, 100)).status, 200);
  assert.equal((await rate(B, songs[1], moodX, '55.55')).status, 200, 'numeric strings are accepted and converted');
  for (const bad of [-0.01, -5, 100.01, 101, 12.345, 'abc', null, true, [], {}]) {
    const r = await rate(B, songs[1], moodX, bad);
    assert.equal(r.status, 400, `value ${JSON.stringify(bad)}`);
    assert.equal(r.body.error.code, 'VALIDATION_ERROR');
  }
  const long = await rate(B, songs[1], moodX, 50, { reviewText: 'x'.repeat(281) });
  assert.equal(long.status, 400);
  const row = await h.one('SELECT match_percentage FROM song_mood_ratings WHERE user_id = ? AND song_id = ? AND mood_id = ?', [B.id, songs[1], moodX]);
  assert.equal(Number(row.match_percentage), 55.55, 'rejected requests changed nothing');
});

test('unknown song, unknown mood and malformed batches are rejected without saving anything', async () => {
  const s = await rate(A, 2 ** 31 - 1, moodX, 50);
  assert.equal(s.status, 404);
  const m = await rate(A, songs[2], 65000, 50);
  assert.equal(m.status, 404);
  assert.equal(m.body.error.code, 'NOT_FOUND');
  const before = await h.one('SELECT COUNT(*) AS n FROM song_mood_ratings WHERE user_id = ?', [A.id]);
  const mixed = await h.api('PUT', `/songs/${songs[2]}/mood-ratings`, { token: A.token, body: { ratings: [
    { moodId: moodX, matchPercentage: 40 }, { moodId: 65000, matchPercentage: 40 }] } });
  assert.equal(mixed.status, 404);
  const twice = await h.api('PUT', `/songs/${songs[2]}/mood-ratings`, { token: A.token, body: { ratings: [
    { moodId: moodX, matchPercentage: 40 }, { moodId: moodX, matchPercentage: 41 }] } });
  assert.equal(twice.status, 400);
  const badItem = await h.api('PUT', `/songs/${songs[2]}/mood-ratings`, { token: A.token, body: { ratings: [
    { moodId: moodX, matchPercentage: 40 }, { moodId: moodR, matchPercentage: 140 }] } });
  assert.equal(badItem.status, 400);
  const after = await h.one('SELECT COUNT(*) AS n FROM song_mood_ratings WHERE user_id = ?', [A.id]);
  assert.equal(after.n, before.n, 'all or nothing: no partial batch was stored');
});

test('authentication is required and a user can only change their own ratings', async () => {
  assert.equal((await h.api('GET', `/songs/${songs[0]}/mood-ratings`)).status, 401);
  assert.equal((await h.api('PUT', `/songs/${songs[0]}/mood-ratings/${moodX}`, { body: { matchPercentage: 5 } })).status, 401);
  // a client-supplied user id is ignored: the rating is stored for the signed-in user
  const r = await h.api('PUT', `/songs/${songs[0]}/mood-ratings/${moodX}`, { token: C.token, body: { matchPercentage: 64.25, userId: A.id } });
  assert.equal(r.status, 201);
  const a = await h.one('SELECT match_percentage FROM song_mood_ratings WHERE user_id = ? AND song_id = ? AND mood_id = ?', [A.id, songs[0], moodX]);
  assert.equal(Number(a.match_percentage), 88.25, "A's rating is untouched");
  // D has no rating here, so D's delete cannot reach anyone else's row
  const del = await h.api('DELETE', `/songs/${songs[0]}/mood-ratings/${moodX}`, { token: D.token });
  assert.equal(del.status, 404);
  assert.equal((await h.one('SELECT COUNT(*) AS n FROM song_mood_ratings WHERE song_id = ? AND mood_id = ?', [songs[0], moodX])).n, 2);
  const list = await h.api('GET', '/me/mood-ratings', { token: C.token });
  assert.ok(list.body.ratings.length >= 1 && list.body.ratings.every((x) => x.songId && x.mood), 'own list');
  assert.equal((await h.api('GET', '/me/mood-ratings', { token: D.token })).body.total, 0);
});

test('the average and count per song and mood match the stored ratings', async () => {
  await rate(B, songs[0], moodX, 90.5);
  const r = await h.api('GET', `/songs/${songs[0]}/mood-ratings`, { token: D.token });
  const x = r.body.moods.find((m) => m.id === moodX);
  // A 88.25, C 64.25, B 90.5
  assert.deepEqual({ average: x.community.average, count: x.community.count, min: x.community.min, max: x.community.max },
    { average: 81, count: 3, min: 64.25, max: 90.5 });
  assert.equal(x.mine, null, 'D sees the average but has no rating of their own');
  const sql = await h.one('SELECT ROUND(AVG(match_percentage), 2) AS a, COUNT(*) AS n FROM song_mood_ratings WHERE song_id = ? AND mood_id = ?', [songs[0], moodX]);
  assert.equal(Number(sql.a), x.community.average);
  // deleting your own rating updates the aggregate
  assert.equal((await h.api('DELETE', `/songs/${songs[0]}/mood-ratings/${moodX}`, { token: C.token })).status, 200);
  const r2 = await h.api('GET', `/songs/${songs[0]}/mood-ratings`, { token: D.token });
  assert.deepEqual(r2.body.moods.find((m) => m.id === moodX).community.average, 89.38);
});

test('ranking by mood: plain average, minimum count, Bayesian adjustment and deterministic ties', async () => {
  const [p, q, s] = songs;
  // p: one perfect rating; q: three consistently high ratings; s: two low ratings
  await rate(A, p, moodR, 100);
  await rate(A, q, moodR, 96); await rate(B, q, moodR, 95); await rate(C, q, moodR, 97);
  await rate(A, s, moodR, 40); await rate(B, s, moodR, 45);

  const avg = await h.api('GET', `/moods/${moodR}/top-rated?limit=20`, { token: D.token });
  assert.equal(avg.status, 200);
  assert.deepEqual(avg.body.songs.map((x) => x.id), [p, q, s]);
  assert.deepEqual(avg.body.songs.map((x) => x.moodRating.average), [100, 96, 42.5]);
  assert.deepEqual(avg.body.songs.map((x) => x.moodRating.count), [1, 3, 2]);
  assert.ok(avg.body.songs.every((x) => x.moodRating.adjustedScore === null), 'no adjusted score unless asked for');

  const min2 = await h.api('GET', `/moods/${moodR}/top-rated?minRatings=2`, { token: D.token });
  assert.deepEqual(min2.body.songs.map((x) => x.id), [q, s]);
  assert.equal(min2.body.belowMinimumCount, 1);

  // mean M = (100 + 96 + 95 + 97 + 40 + 45) / 6 = 78.83; prior weight 5
  const adj = await h.api('GET', `/moods/${moodR}/top-rated?rank=adjusted&prior=5`, { token: D.token });
  assert.deepEqual(adj.body.songs.map((x) => x.id), [q, p, s], 'three consistent 96s outrank a single 100');
  assert.equal(adj.body.prior.mean, 78.83);
  assert.deepEqual(adj.body.songs.map((x) => x.moodRating.adjustedScore), [85.27, 82.36, 68.45]);
  assert.deepEqual(adj.body.songs.map((x) => x.moodRating.average), [96, 100, 42.5], 'the real averages are still reported');

  // a tie on the average is broken by rating count, then song id
  await rate(D, s, moodR, 42.5);   // s: 40, 45, 42.5 -> still 42.5, now 3 ratings
  await h.api('DELETE', `/songs/${q}/mood-ratings/${moodR}`, { token: C.token });
  await rate(A, q, moodR, 42.5); await rate(B, q, moodR, 42.5);   // q: 42.5 with 2 ratings
  const tie = await h.api('GET', `/moods/${moodR}/top-rated`, { token: D.token });
  assert.deepEqual(tie.body.songs.map((x) => [x.id, x.moodRating.average, x.moodRating.count]), [[p, 100, 1], [s, 42.5, 3], [q, 42.5, 2]]);
});

test('songs without ratings are counted and can be listed separately, never as 0 %', async () => {
  const r = await h.api('GET', `/moods/${moodR}/top-rated?includeUnrated=true&limit=5`, { token: D.token });
  const active = await h.one(`SELECT COUNT(*) AS n FROM songs s WHERE s.status = 'ACTIVE'
    AND NOT EXISTS (SELECT 1 FROM song_mood_ratings x WHERE x.song_id = s.song_id AND x.mood_id = ?)`, [moodR]);
  assert.equal(r.body.unratedCount, active.n);
  assert.ok(r.body.unrated.length > 0 && r.body.unrated.length <= 5);
  assert.ok(r.body.unrated.every((x) => x.moodRating.average === null && x.moodRating.count === 0));
  assert.ok(r.body.unrated.every((x) => !songs.includes(x.id)), 'rated songs are not in the unrated list');
});

test('a mood with no ratings returns an empty, well-formed result', async () => {
  const r = await h.api('GET', `/moods/${moodEmpty}/top-rated?rank=adjusted`, { token: D.token });
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.songs, r.body.total, r.body.prior.mean], [[], 0, null]);
  assert.equal((await h.api('GET', '/moods/65000/top-rated', { token: D.token })).status, 404);
  assert.equal((await h.api('GET', `/moods/${moodR}/top-rated?rank=best`, { token: D.token })).status, 400);
  assert.equal((await h.api('GET', `/moods/${moodR}/top-rated?limit=0`, { token: D.token })).status, 400);
});

test('user ratings never change the AI mood prediction', async () => {
  const snap = () => h.query('SELECT song_id, mood_id, model_id, confidence FROM song_moods WHERE song_id IN (?) ORDER BY 1, 2, 3', [songs]);
  const beforeRows = await snap();
  await rate(D, songs[0], moodR, 3);
  await rate(D, songs[1], moodX, 99.99);
  assert.deepEqual(await snap(), beforeRows);
});

test('mood ratings are paused in a private session', async () => {
  const u = await h.newUser();
  created.push(u.id);
  assert.equal((await h.api('POST', '/incognito', { token: u.token, body: {} })).status, 201);
  const r = await rate(u, songs[0], moodX, 50);
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'INCOGNITO_ACTIVE');
  assert.equal((await h.api('GET', `/songs/${songs[0]}/mood-ratings`, { token: u.token })).body.privateSession, true);
  await h.api('DELETE', '/incognito', { token: u.token });
  assert.equal((await rate(u, songs[0], moodX, 50)).status, 201);
});

test('merging duplicate songs carries mood ratings to the canonical song', async () => {
  const artist = await h.one('SELECT artist_id FROM artists ORDER BY artist_id LIMIT 1');
  const genre = await h.one("SELECT genre_id FROM genres WHERE name = 'EDM'");
  const mk = (title) => h.api('POST', '/admin/songs', { token: admin, body: { title, artistId: artist.artist_id, genreId: genre.genre_id,
    durationSec: 180, releaseYear: 2026, features: { energy: 0.7, valence: 0.6, danceability: 0.7, acousticness: 0.2, instrumentalness: 0.1, speechiness: 0.05, tempo_bpm: 120 } } });
  const canonical = (await mk(`Mood Merge ${h.uid()}`)).body;
  const dup = (await mk(`Mood Merge (dup) ${h.uid()}`)).body;
  await rate(A, dup.id, moodX, 70);             // only on the duplicate
  await rate(B, canonical.id, moodX, 20);       // on both: the newer one wins
  await new Promise((r) => setTimeout(r, 1100));
  await rate(B, dup.id, moodX, 30);
  const m = await h.api('POST', '/admin/songs/merge', { token: admin, body: { duplicateSongId: dup.id, canonicalSongId: canonical.id } });
  assert.equal(m.status, 200);
  const rows = await h.query('SELECT user_id, match_percentage FROM song_mood_ratings WHERE song_id = ? AND mood_id = ? ORDER BY user_id', [canonical.id, moodX]);
  assert.deepEqual(rows.map((r) => [r.user_id, Number(r.match_percentage)]), [[A.id, 70], [B.id, 30]]);
  assert.equal((await h.one('SELECT COUNT(*) AS n FROM song_mood_ratings WHERE song_id = ?', [dup.id])).n, 0);
});

test('the database itself enforces the range, the references and one rating per user, song and mood', async () => {
  const ins = (u, s, m, p) => h.query('INSERT INTO song_mood_ratings (user_id, song_id, mood_id, match_percentage) VALUES (?, ?, ?, ?)', [u, s, m, p]);
  await assert.rejects(ins(D.id, songs[2], moodEmpty, 100.5), (e) => e.errno === 3819);   // CHECK
  await assert.rejects(ins(D.id, songs[2], moodEmpty, -1), (e) => e.errno === 3819);
  await assert.rejects(ins(D.id, 2 ** 31 - 1, moodEmpty, 50), (e) => e.errno === 1452);   // FK song
  await assert.rejects(ins(D.id, songs[2], 65000, 50), (e) => e.errno === 1452);          // FK mood
  await assert.rejects(ins(2 ** 31 - 1, songs[2], moodEmpty, 50), (e) => e.errno === 1452); // FK user
  await ins(D.id, songs[2], moodEmpty, 50);
  await assert.rejects(ins(D.id, songs[2], moodEmpty, 60), (e) => e.errno === 1062);      // PK
  const cols = await h.query(`SELECT COLUMN_NAME c, COLUMN_TYPE t FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('song_mood_ratings', 'users', 'songs', 'moods')
      AND COLUMN_NAME IN ('user_id', 'song_id', 'mood_id') ORDER BY TABLE_NAME, COLUMN_NAME`);
  const types = {};
  cols.forEach((x) => (types[x.c] = types[x.c] || new Set()).add(x.t));
  for (const [c, t] of Object.entries(types)) assert.equal(t.size, 1, `${c} has the same type everywhere (${[...t]})`);
});

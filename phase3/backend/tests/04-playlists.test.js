const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let user;
let songs;
before(async () => {
  await h.start();
  user = await h.newUser();
  songs = await h.query("SELECT song_id, duration_sec FROM songs WHERE status = 'ACTIVE' ORDER BY song_id LIMIT 4");
});
after(h.stop);

test('create with songs is atomic; counters and positions are trigger-maintained', async () => {
  const r = await h.api('POST', '/playlists', { token: user.token, body: { name: 'Road songs', songIds: songs.slice(0, 3).map((s) => s.song_id) } });
  assert.equal(r.status, 201);
  assert.equal(r.body.songCount, 3);
  assert.equal(r.body.totalDurationSec, songs.slice(0, 3).reduce((a, s) => a + s.duration_sec, 0));
  assert.deepEqual(r.body.songs.map((s) => s.position), [1, 2, 3]);

  const before = (await h.one('SELECT COUNT(*) AS n FROM playlists WHERE user_id = ?', [user.id])).n;
  const bad = await h.api('POST', '/playlists', { token: user.token, body: { name: 'Half made', songIds: [songs[0].song_id, 999999] } });
  assert.equal(bad.status, 404);
  const afterN = (await h.one('SELECT COUNT(*) AS n FROM playlists WHERE user_id = ?', [user.id])).n;
  assert.equal(afterN, before, 'failed insert rolled the whole playlist back');
});

test('duplicates are rejected: same song twice, same playlist name twice', async () => {
  const p = await h.api('POST', '/playlists', { token: user.token, body: { name: 'Dupes' } });
  assert.equal((await h.api('POST', `/playlists/${p.body.id}/songs`, { token: user.token, body: { songId: songs[0].song_id } })).status, 201);
  const dup = await h.api('POST', `/playlists/${p.body.id}/songs`, { token: user.token, body: { songId: songs[0].song_id } });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'DUPLICATE_PLAYLIST_SONG');
  const sameName = await h.api('POST', '/playlists', { token: user.token, body: { name: 'Dupes' } });
  assert.equal(sameName.body.error.code, 'DUPLICATE_PLAYLIST');
  const inBody = await h.api('POST', '/playlists', { token: user.token, body: { name: 'Twice', songIds: [songs[1].song_id, songs[1].song_id] } });
  assert.equal(inBody.status, 409);
});

test('concurrent adds keep positions unique and the counter exact', async () => {
  const p = await h.api('POST', '/playlists', { token: user.token, body: { name: 'Race' } });
  const results = await Promise.all(songs.map((s) => h.api('POST', `/playlists/${p.body.id}/songs`, { token: user.token, body: { songId: s.song_id } })));
  assert.ok(results.every((r) => r.status === 201));
  const rows = await h.query('SELECT position FROM playlist_songs WHERE playlist_id = ? ORDER BY position', [p.body.id]);
  assert.deepEqual(rows.map((r) => r.position), [1, 2, 3, 4]);
  const pl = await h.one('SELECT song_count FROM playlists WHERE playlist_id = ?', [p.body.id]);
  assert.equal(pl.song_count, 4);
});

test('rename, remove a song, delete; counters follow', async () => {
  const p = await h.api('POST', '/playlists', { token: user.token, body: { name: 'Edit me', songIds: songs.slice(0, 2).map((s) => s.song_id) } });
  const renamed = await h.api('PATCH', `/playlists/${p.body.id}`, { token: user.token, body: { name: 'Edited' } });
  assert.equal(renamed.body.name, 'Edited');
  assert.equal((await h.api('DELETE', `/playlists/${p.body.id}/songs/${songs[0].song_id}`, { token: user.token })).status, 200);
  const d = await h.api('GET', `/playlists/${p.body.id}`, { token: user.token });
  assert.equal(d.body.songCount, 1);
  assert.equal(d.body.totalDurationSec, songs[1].duration_sec);
  assert.equal((await h.api('DELETE', `/playlists/${p.body.id}`, { token: user.token })).status, 200);
  assert.equal((await h.one('SELECT COUNT(*) AS n FROM playlist_songs WHERE playlist_id = ?', [p.body.id])).n, 0, 'ON DELETE CASCADE');
});

test("playlists are private to their owner", async () => {
  const p = await h.api('POST', '/playlists', { token: user.token, body: { name: 'Mine' } });
  const other = await h.newUser({ onboard: false });
  assert.equal((await h.api('GET', `/playlists/${p.body.id}`, { token: other.token })).status, 404);
  assert.equal((await h.api('DELETE', `/playlists/${p.body.id}`, { token: other.token })).status, 404);
  assert.equal((await h.api('POST', `/playlists/${p.body.id}/songs`, { token: other.token, body: { songId: songs[0].song_id } })).status, 404);
});

test('a generated list saves as a playlist in rank order; someone else cannot save it', async () => {
  const rec = await h.api('POST', '/recommendations/mood', { token: user.token, body: { text: 'calm', limit: 8 } });
  const saved = await h.api('POST', '/playlists/from-batch', { token: user.token, body: { batchId: rec.body.batchId, name: 'Calm evening' } });
  assert.equal(saved.status, 201);
  assert.equal(saved.body.kind, 'SAVED_MIX');
  assert.deepEqual(saved.body.songs.map((s) => s.id), rec.body.songs.map((s) => s.id));
  const other = await h.newUser({ onboard: false });
  assert.equal((await h.api('POST', '/playlists/from-batch', { token: other.token, body: { batchId: rec.body.batchId, name: 'Stolen' } })).status, 404);
});

test('smart playlists are generated from real signals', async () => {
  const types = await h.api('GET', '/playlists/smart', { token: user.token });
  assert.ok(types.body.length >= 8);
  const study = await h.api('GET', '/playlists/smart/STUDY?limit=10', { token: user.token });
  assert.equal(study.status, 200);
  assert.ok(study.body.songs.length > 0);
  const saved = await h.api('POST', '/playlists/from-batch', { token: user.token, body: { batchId: study.body.batchId, name: 'Study smart' } });
  assert.equal(saved.body.kind, 'SMART');
  assert.equal(saved.body.smartType, 'STUDY');

  const fresh = await h.newUser();
  const empty = await h.api('POST', '/playlists/smart/MOST_REPLAYED', { token: fresh.token, body: {} });
  assert.equal(empty.status, 400, 'no replays yet: nothing is invented');
  await h.play(fresh.token, songs[0].song_id, songs[0].duration_sec);
  await h.play(fresh.token, songs[0].song_id, songs[0].duration_sec);
  const mr = await h.api('GET', '/playlists/smart/MOST_REPLAYED', { token: fresh.token });
  assert.equal(mr.body.songs[0].id, songs[0].song_id);
  assert.equal((await h.api('GET', '/playlists/smart/NOPE', { token: user.token })).status, 400);
});

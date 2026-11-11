// Roadmap features that already exist in MUSE and are checked here end to end through the API:
//   45 Song Mood Timeline  — GET /songs/:id returns the active model's mood segments, in order, inside the song
//   41 Music Data Provenance — GET /songs/:id returns where every piece of metadata came from, with rights status
//   55 Personal Listening Profile — the profile only ever describes the signed-in user's own plays
// Read-only against the demo data, except the plays created by the test's own new user.
// Developed by Vaishnav Sai.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

before(async () => { await h.start(); });
after(async () => { await h.stop(); });

test('45 mood timeline: segments come from the active model, ordered, non-overlapping, inside the song', async () => {
  const u = await h.newUser();
  const row = await h.one(`SELECT ms.song_id, COUNT(*) AS n FROM mood_segments ms
                             JOIN intelligence_models im ON im.model_id = ms.model_id AND im.is_active = 1
                             JOIN songs s ON s.song_id = ms.song_id AND s.status = 'ACTIVE'
                            GROUP BY ms.song_id ORDER BY n DESC, ms.song_id LIMIT 1`);
  assert.ok(row, 'demo data has segment analysis');
  const res = await h.api('GET', `/songs/${row.song_id}`, { token: u.token });
  assert.equal(res.status, 200);
  const segs = res.body.segments;
  assert.equal(segs.length, Number(row.n), 'every active-model segment is returned');
  const dur = (await h.one('SELECT duration_sec FROM songs WHERE song_id = ?', [row.song_id])).duration_sec;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    assert.ok(s.mood && s.color, 'each segment names its mood and colour');
    assert.ok(Number(s.start) >= 0 && Number(s.end) > Number(s.start) && Number(s.end) <= dur, 'inside the song');
    if (i > 0) assert.ok(Number(s.start) >= Number(segs[i - 1].end), 'ordered and not overlapping');
  }
});

test('45 mood timeline: a song without segment analysis returns an empty timeline, not invented segments', async () => {
  const u = await h.newUser();
  const row = await h.one(`SELECT s.song_id FROM songs s WHERE s.status = 'ACTIVE' AND NOT EXISTS (
                             SELECT 1 FROM mood_segments ms JOIN intelligence_models im ON im.model_id = ms.model_id AND im.is_active = 1
                              WHERE ms.song_id = s.song_id) ORDER BY s.song_id LIMIT 1`);
  if (!row) return;   // every demo song is analysed: nothing to check
  const res = await h.api('GET', `/songs/${row.song_id}`, { token: u.token });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.segments, []);
});

test('41 provenance: each source record of a song is returned with source, licence, match method and rights', async () => {
  const u = await h.newUser();
  const row = await h.one(`SELECT sr.song_id, COUNT(*) AS n FROM source_records sr
                             JOIN music_sources ms ON ms.source_id = sr.source_id AND ms.code <> 'YOUTUBE_DATA'
                             JOIN songs s ON s.song_id = sr.song_id AND s.status = 'ACTIVE'
                            WHERE sr.song_id IS NOT NULL GROUP BY sr.song_id ORDER BY n DESC, sr.song_id LIMIT 1`);
  assert.ok(row, 'demo data has source records linked to songs');
  const res = await h.api('GET', `/songs/${row.song_id}`, { token: u.token });
  assert.equal(res.status, 200);
  assert.equal(res.body.provenance.length, Number(row.n));
  for (const p of res.body.provenance) {
    assert.ok(p.source && p.source_name && p.license_name, 'source and licence named');
    assert.ok(['PERMITTED', 'ATTRIBUTION_REQUIRED', 'METADATA_ONLY', 'RESTRICTED', 'UNKNOWN'].includes(p.rights_status), 'rights status is one of the stored values');
    assert.ok(p.external_id, 'external id kept for traceability');
  }
});

test('55 personal listening profile: describes only the caller\'s own plays', async () => {
  const fresh = await h.newUser();
  const empty = await h.api('GET', '/insights/profile', { token: fresh.token });
  assert.equal(empty.status, 200);
  const song = await h.one("SELECT song_id, duration_sec FROM songs WHERE status = 'ACTIVE' ORDER BY song_id LIMIT 1");
  await h.play(fresh.token, song.song_id, song.duration_sec);
  const mine = await h.api('GET', '/insights/profile', { token: fresh.token });
  assert.equal(mine.status, 200);
  assert.notDeepEqual(mine.body, empty.body, 'one play changes the profile');
  const other = await h.newUser();
  const theirs = await h.api('GET', `/users/${fresh.id}/analytics`, { token: other.token });
  assert.equal(theirs.status, 403, 'another listener cannot read this profile');
});

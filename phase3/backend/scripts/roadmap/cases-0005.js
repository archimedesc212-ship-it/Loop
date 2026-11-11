// Test cases for database/migrations/proposed/0005_roadmap_33_57.sql (run by test-proposed-migration.js).
// Developed by Vaishnav Sai.
module.exports = {
  version: '0005',
  file: 'database/migrations/proposed/0005_roadmap_33_57.sql',
  newTables: 16,
  newRoutines: ['fn_harmonic_compat'],
  // baseline objects this migration is allowed to change in place (everything else must be untouched)
  changedBaselineObjects: ['columns:playlists.kind'],

  // Each state is applied to a fresh baseline, then the whole migration runs; the result must equal a fresh install.
  partialStates: [
    { name: 'only user_profiles.bio exists (the revision-1 flaw: one marker column)',
      sql: ['ALTER TABLE user_profiles ADD COLUMN bio VARCHAR(300) NULL AFTER display_name'] },
    { name: 'user_profiles columns exist but neither CHECK does',
      sql: ['ALTER TABLE user_profiles ADD COLUMN bio VARCHAR(300) NULL AFTER display_name',
        "ALTER TABLE user_profiles ADD COLUMN profile_visibility ENUM('PRIVATE','FOLLOWERS','PUBLIC') NOT NULL DEFAULT 'PRIVATE' AFTER bio",
        'ALTER TABLE user_profiles ADD COLUMN allow_compatibility TINYINT(1) NOT NULL DEFAULT 0 AFTER profile_visibility'] },
    { name: 'playlists.visibility exists, version / published_at / chk_pl_published do not',
      sql: ["ALTER TABLE playlists ADD COLUMN visibility ENUM('PRIVATE','COLLABORATORS','PUBLIC') NOT NULL DEFAULT 'PRIVATE'"] },
    { name: 'playlists.kind already contains EDITORIAL',
      sql: ["ALTER TABLE playlists MODIFY COLUMN kind ENUM('MANUAL','SMART','SAVED_MIX','WORLD','EDITORIAL') NOT NULL DEFAULT 'MANUAL'"] },
    { name: 'playlist_songs.added_by exists without its foreign key',
      sql: ['ALTER TABLE playlist_songs ADD COLUMN added_by INT UNSIGNED NULL'] },
    { name: 'recommendation_batches.target_duration_sec exists without its CHECK',
      sql: ['ALTER TABLE recommendation_batches ADD COLUMN target_duration_sec SMALLINT UNSIGNED NULL'] },
    { name: 'user_follows exists with no triggers',
      sql: [`CREATE TABLE user_follows (follower_id INT UNSIGNED NOT NULL, followee_id INT UNSIGNED NOT NULL,
               created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (follower_id, followee_id),
               KEY idx_uf_followee (followee_id, created_at),
               CONSTRAINT fk_uf_follower FOREIGN KEY (follower_id) REFERENCES users (user_id) ON DELETE CASCADE,
               CONSTRAINT fk_uf_followee FOREIGN KEY (followee_id) REFERENCES users (user_id) ON DELETE CASCADE) ENGINE=InnoDB`] },
    { name: 'a helper procedure left behind by a crashed run',
      sql: ['CREATE PROCEDURE mig_0005_add_column() BEGIN END'] },
  ],
  // Values another migration added to the ENUM must survive.
  enumPreserve: {
    name: 'playlists.kind has an extra value added elsewhere (ARCHIVE): it is kept, EDITORIAL appended, default kept',
    sql: ["ALTER TABLE playlists MODIFY COLUMN kind ENUM('MANUAL','SMART','SAVED_MIX','WORLD','ARCHIVE') NOT NULL DEFAULT 'MANUAL'"],
    expect: { table: 'playlists', column: 'kind', type: "enum('MANUAL','SMART','SAVED_MIX','WORLD','ARCHIVE','EDITORIAL')", nullable: 'NO', default: 'MANUAL' },
  },
  // A pre-existing table of the same name but a different shape must stop the migration, not be silently accepted.
  driftStates: [
    { name: 'listening_rooms already exists without cancelled_at',
      sql: [`CREATE TABLE listening_rooms (room_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, host_user_id INT UNSIGNED NOT NULL,
               name VARCHAR(80) NOT NULL, mood_id SMALLINT UNSIGNED NULL, visibility ENUM('INVITE_ONLY','FOLLOWERS') NOT NULL DEFAULT 'INVITE_ONLY',
               status ENUM('SCHEDULED','LIVE','ENDED','CANCELLED') NOT NULL DEFAULT 'SCHEDULED', scheduled_start_at DATETIME NULL,
               started_at DATETIME NULL, ended_at DATETIME NULL, current_song_id INT UNSIGNED NULL, current_position_ms INT UNSIGNED NULL,
               state_version INT UNSIGNED NOT NULL DEFAULT 1, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB`],
      error: /listening_rooms|cancelled_at|Unknown column/i },
  ],

  /** Behaviour tests on a fresh install. Runs inside a transaction that is rolled back. */
  async behaviour({ q, check, expectError }) {
    const [u1, u2, u3] = (await q('SELECT user_id FROM users ORDER BY user_id LIMIT 3 OFFSET 2')).map((r) => r.user_id);
    const entry = (await q('SELECT playlist_id, song_id FROM playlist_songs ORDER BY playlist_id, song_id LIMIT 1'))[0];
    const [song, song2] = (await q('SELECT song_id FROM songs ORDER BY song_id LIMIT 2')).map((r) => r.song_id);

    // --- defaults keep current behaviour
    const pl = await q("SELECT SUM(visibility = 'PRIVATE' AND version = 1 AND published_at IS NULL) ok, COUNT(*) n FROM playlists");
    check('existing playlists become PRIVATE, version 1, unpublished', Number(pl[0].ok) === Number(pl[0].n) && Number(pl[0].n) > 0, JSON.stringify(pl[0]));
    const prof = await q("SELECT SUM(profile_visibility = 'PRIVATE' AND allow_compatibility = 0 AND bio IS NULL) ok, COUNT(*) n FROM user_profiles");
    check('existing profiles become PRIVATE with compatibility consent OFF', Number(prof[0].ok) === Number(prof[0].n));
    const kind = await q("SELECT COLUMN_TYPE t, COLUMN_DEFAULT d, IS_NULLABLE nl FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'playlists' AND COLUMN_NAME = 'kind'");
    check('playlists.kind gains EDITORIAL and keeps NOT NULL DEFAULT MANUAL', kind[0].t.endsWith(",'EDITORIAL')") && kind[0].d === 'MANUAL' && kind[0].nl === 'NO', JSON.stringify(kind[0]));

    // --- follows: self-follow refused on INSERT and UPDATE
    await q('INSERT INTO user_follows (follower_id, followee_id) VALUES (?, ?)', [u1, u2]);
    check('follow another user', true);
    await expectError('self-follow refused on INSERT', 'INSERT INTO user_follows (follower_id, followee_id) VALUES (?, ?)', [u1, u1], 1644);
    await expectError('self-follow refused on UPDATE (followee changed to follower)', 'UPDATE user_follows SET followee_id = follower_id WHERE follower_id = ? AND followee_id = ?', [u1, u2], 1644);
    await expectError('self-follow refused on UPDATE (follower changed to followee)', 'UPDATE user_follows SET follower_id = followee_id WHERE follower_id = ? AND followee_id = ?', [u1, u2], 1644);
    await q('UPDATE user_follows SET followee_id = ? WHERE follower_id = ? AND followee_id = ?', [u3, u1, u2]);
    check('an UPDATE to another (different) user is allowed', (await q('SELECT COUNT(*) n FROM user_follows WHERE follower_id = ? AND followee_id = ?', [u1, u3]))[0].n === 1);
    await expectError('duplicate follow refused (PK)', 'INSERT INTO user_follows (follower_id, followee_id) VALUES (?, ?)', [u1, u3], 1062);

    // --- collaborators, notes, reactions
    await expectError('collaborator ACCEPTED without accepted_at refused', "INSERT INTO playlist_collaborators (playlist_id, user_id, status) VALUES (?, ?, 'ACCEPTED')", [entry.playlist_id, u2], 3819);
    await q('INSERT INTO playlist_collaborators (playlist_id, user_id, invited_by) VALUES (?, ?, ?)', [entry.playlist_id, u2, u1]);
    await expectError('accepting before the invitation time refused', "UPDATE playlist_collaborators SET status = 'ACCEPTED', accepted_at = invited_at - INTERVAL 1 DAY WHERE playlist_id = ? AND user_id = ?", [entry.playlist_id, u2], 3819);
    await q("INSERT INTO playlist_reactions (playlist_id, song_id, user_id, reaction) VALUES (?, ?, ?, 'LOVE')", [entry.playlist_id, entry.song_id, u2]);
    await expectError('second reaction by the same user on the same entry refused', "INSERT INTO playlist_reactions (playlist_id, song_id, user_id, reaction) VALUES (?, ?, ?, 'FIRE')", [entry.playlist_id, entry.song_id, u2], 1062);
    await expectError('reaction on a song that is not in the playlist refused', "INSERT INTO playlist_reactions (playlist_id, song_id, user_id, reaction) VALUES (?, 999999, ?, 'LIKE')", [entry.playlist_id, u2], 1452);
    await expectError('empty note refused', "INSERT INTO playlist_notes (playlist_id, song_id, user_id, body) VALUES (?, ?, ?, '   ')", [entry.playlist_id, entry.song_id, u2], 3819);
    await q("INSERT INTO playlist_notes (playlist_id, song_id, user_id, body) VALUES (?, ?, ?, 'Perfect after the bridge')", [entry.playlist_id, entry.song_id, u2]);
    await q("INSERT INTO playlist_notes (playlist_id, song_id, user_id, body) VALUES (?, NULL, ?, 'Whole-playlist note')", [entry.playlist_id, u2]);
    await q('DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?', [entry.playlist_id, entry.song_id]);
    const left = await q('SELECT (SELECT COUNT(*) FROM playlist_notes WHERE playlist_id = ? AND song_id = ?) n, (SELECT COUNT(*) FROM playlist_notes WHERE playlist_id = ? AND song_id IS NULL) pn, (SELECT COUNT(*) FROM playlist_reactions WHERE playlist_id = ? AND song_id = ?) r',
      [entry.playlist_id, entry.song_id, entry.playlist_id, entry.playlist_id, entry.song_id]);
    check('removing a song cascades its notes and reactions; the playlist-level note stays', Number(left[0].n) === 0 && Number(left[0].r) === 0 && Number(left[0].pn) === 1, JSON.stringify(left[0]));

    // --- rooms: HOST membership is created with the room
    const hostRow = async (roomId) => q("SELECT user_id, role, status FROM listening_room_members WHERE room_id = ? AND role = 'HOST'", [roomId]);
    const r1 = (await q("INSERT INTO listening_rooms (host_user_id, name, scheduled_start_at) VALUES (?, 'Friday night', NOW() + INTERVAL 1 DAY)", [u1])).insertId;
    const h1 = await hostRow(r1);
    check('creating a SCHEDULED room creates its HOST membership (ACCEPTED) in the same statement', h1.length === 1 && h1[0].user_id === u1 && h1[0].status === 'ACCEPTED', JSON.stringify(h1));
    const r2 = (await q("INSERT INTO listening_rooms (host_user_id, name, status, started_at, current_song_id, current_position_ms) VALUES (?, 'Live now', 'LIVE', NOW(), ?, 0)", [u2, song])).insertId;
    const h2 = await hostRow(r2);
    check('creating a LIVE room creates its HOST membership (JOINED)', h2.length === 1 && h2[0].user_id === u2 && h2[0].status === 'JOINED', JSON.stringify(h2));
    const orphan = await q("SELECT COUNT(*) n FROM listening_rooms r WHERE NOT EXISTS (SELECT 1 FROM listening_room_members m WHERE m.room_id = r.room_id AND m.role = 'HOST' AND m.user_id = r.host_user_id)");
    check('no room exists without its HOST membership', Number(orphan[0].n) === 0);
    const before = (await q('SELECT COUNT(*) n FROM listening_rooms'))[0].n;
    await expectError('a room cannot be created ENDED',
      "INSERT INTO listening_rooms (host_user_id, name, status, scheduled_start_at) VALUES (?, 'Bad', 'ENDED', NOW())", [u1], 1644);
    check('…room count unchanged after the refused creation', (await q('SELECT COUNT(*) n FROM listening_rooms'))[0].n === before);
    await expectError('a second HOST membership refused', "INSERT INTO listening_room_members (room_id, user_id, role, status) VALUES (?, ?, 'HOST', 'ACCEPTED')", [r1, u2], 1644);
    await expectError('the host cannot be added again as a LISTENER', "INSERT INTO listening_room_members (room_id, user_id, role) VALUES (?, ?, 'LISTENER')", [r1, u1], 1644);
    await q("INSERT INTO listening_room_members (room_id, user_id, role, status) VALUES (?, ?, 'LISTENER', 'INVITED')", [r1, u2]);
    await expectError('a listener cannot be promoted to HOST', "UPDATE listening_room_members SET role = 'HOST' WHERE room_id = ? AND user_id = ?", [r1, u2], 1644);
    await expectError('the host cannot be demoted', "UPDATE listening_room_members SET role = 'LISTENER' WHERE room_id = ? AND user_id = ?", [r1, u1], 1644);
    await expectError('the host membership cannot be deleted', 'DELETE FROM listening_room_members WHERE room_id = ? AND user_id = ?', [r1, u1], 1644);
    await expectError('a membership cannot be moved to another user', 'UPDATE listening_room_members SET user_id = ? WHERE room_id = ? AND user_id = ?', [u3, r1, u2], 1644);
    await q('DELETE FROM listening_room_members WHERE room_id = ? AND user_id = ?', [r1, u2]);
    check('a listener membership can be deleted', true);
    await expectError('the host of a room cannot be changed', 'UPDATE listening_rooms SET host_user_id = ? WHERE room_id = ?', [u2, r1], 1644);

    // --- rooms: lifecycle
    await expectError('SCHEDULED room without a start time refused', "INSERT INTO listening_rooms (host_user_id, name) VALUES (?, 'No time')", [u1], 3819);
    await expectError('LIVE room without started_at refused', "INSERT INTO listening_rooms (host_user_id, name, status) VALUES (?, 'x', 'LIVE')", [u1], 3819);
    await expectError('room created CANCELLED refused', "INSERT INTO listening_rooms (host_user_id, name, status, scheduled_start_at, cancelled_at) VALUES (?, 'x', 'CANCELLED', NOW(), NOW())", [u1], 1644);
    await expectError('SCHEDULED room with a current song refused', "INSERT INTO listening_rooms (host_user_id, name, scheduled_start_at, current_song_id) VALUES (?, 'x', NOW(), ?)", [u1, song], 1644);
    await expectError('SCHEDULED → ENDED refused', "UPDATE listening_rooms SET status = 'ENDED', started_at = NOW(), ended_at = NOW() WHERE room_id = ?", [r1], 1644);
    await expectError('SCHEDULED → LIVE without started_at refused', "UPDATE listening_rooms SET status = 'LIVE' WHERE room_id = ?", [r1], 3819);
    await q("UPDATE listening_rooms SET status = 'LIVE', started_at = NOW(), current_song_id = ?, current_position_ms = 0, state_version = state_version + 1 WHERE room_id = ? AND state_version = 1", [song, r1]);
    check('SCHEDULED → LIVE with started_at and a current song', (await q('SELECT status FROM listening_rooms WHERE room_id = ?', [r1]))[0].status === 'LIVE');
    const stale = await q("UPDATE listening_rooms SET current_song_id = ? WHERE room_id = ? AND state_version = 1", [song2, r1]);
    check('a stale playback update (old state_version) changes nothing', stale.affectedRows === 0);
    await expectError('LIVE → CANCELLED refused', "UPDATE listening_rooms SET status = 'CANCELLED', cancelled_at = NOW(), current_song_id = NULL, current_position_ms = NULL WHERE room_id = ?", [r1], 1644);
    await expectError('LIVE → SCHEDULED refused', "UPDATE listening_rooms SET status = 'SCHEDULED', started_at = NULL, current_song_id = NULL, current_position_ms = NULL WHERE room_id = ?", [r1], 1644);
    await expectError('ENDED while a song is still current refused', "UPDATE listening_rooms SET status = 'ENDED', ended_at = NOW() WHERE room_id = ?", [r1], 1644);
    await expectError('ENDED before it started refused', "UPDATE listening_rooms SET status = 'ENDED', ended_at = started_at - INTERVAL 1 HOUR, current_song_id = NULL, current_position_ms = NULL WHERE room_id = ?", [r1], 3819);
    await q("UPDATE listening_rooms SET status = 'ENDED', ended_at = NOW(), current_song_id = NULL, current_position_ms = NULL WHERE room_id = ?", [r1]);
    check('LIVE → ENDED (current song cleared)', (await q('SELECT status FROM listening_rooms WHERE room_id = ?', [r1]))[0].status === 'ENDED');
    await expectError('ENDED → LIVE refused (final state)', "UPDATE listening_rooms SET status = 'LIVE', ended_at = NULL WHERE room_id = ?", [r1], 1644);
    await expectError('an ENDED room cannot even be renamed', "UPDATE listening_rooms SET name = 'Renamed' WHERE room_id = ?", [r1], 1644);
    await expectError('members cannot join an ENDED room', "INSERT INTO listening_room_members (room_id, user_id) VALUES (?, ?)", [r1, u3], 1644);
    const r3 = (await q("INSERT INTO listening_rooms (host_user_id, name, scheduled_start_at) VALUES (?, 'Maybe', NOW() + INTERVAL 2 DAY)", [u3])).insertId;
    await expectError('CANCELLED without cancelled_at refused', "UPDATE listening_rooms SET status = 'CANCELLED' WHERE room_id = ?", [r3], 3819);
    await expectError('a CANCELLED room that also records a start time refused', "UPDATE listening_rooms SET status = 'CANCELLED', cancelled_at = NOW(), started_at = NOW() WHERE room_id = ?", [r3], 3819);
    await expectError('cancelled_at on a room that is not CANCELLED refused', 'UPDATE listening_rooms SET cancelled_at = NOW() WHERE room_id = ?', [r3], 3819);
    await q("UPDATE listening_rooms SET status = 'CANCELLED', cancelled_at = NOW() WHERE room_id = ?", [r3]);
    check('SCHEDULED → CANCELLED', (await q('SELECT status FROM listening_rooms WHERE room_id = ?', [r3]))[0].status === 'CANCELLED');
    await expectError('CANCELLED → LIVE refused (final state)', "UPDATE listening_rooms SET status = 'LIVE', started_at = NOW(), cancelled_at = NULL WHERE room_id = ?", [r3], 1644);
    // queue
    await q('INSERT INTO listening_room_queue (room_id, position, song_id, added_by) VALUES (?, 1, ?, ?)', [r2, song, u2]);
    await expectError('two queue items at the same position refused', 'INSERT INTO listening_room_queue (room_id, position, song_id, added_by) VALUES (?, 1, ?, ?)', [r2, song2, u2], 1062);
    await expectError('queue position 0 refused', 'INSERT INTO listening_room_queue (room_id, position, song_id) VALUES (?, 0, ?)', [r2, song], 3819);
    // deleting a room removes its memberships (cascade does not fire the host-delete guard)
    await q('DELETE FROM listening_rooms WHERE room_id = ?', [r3]);
    check('deleting a room removes its memberships, including HOST', (await q('SELECT COUNT(*) n FROM listening_room_members WHERE room_id = ?', [r3]))[0].n === 0);

    // --- metadata suggestions
    await q("INSERT INTO metadata_suggestions (user_id, song_id, field_name, proposed_value) VALUES (?, ?, 'RELEASE_YEAR', '2021')", [u2, song]);
    await expectError('second open suggestion for the same user, song and field refused', "INSERT INTO metadata_suggestions (user_id, song_id, field_name, proposed_value) VALUES (?, ?, 'RELEASE_YEAR', '2020')", [u2, song], 1062);
    await expectError('ACCEPTED suggestion without decided_at refused', "UPDATE metadata_suggestions SET status = 'ACCEPTED' WHERE user_id = ? AND song_id = ?", [u2, song], 3819);
    await q("UPDATE metadata_suggestions SET status = 'ACCEPTED', decided_by = ?, decided_at = NOW() WHERE user_id = ? AND song_id = ?", [u1, u2, song]);
    await q("INSERT INTO metadata_suggestions (user_id, song_id, field_name, proposed_value) VALUES (?, ?, 'RELEASE_YEAR', '2020')", [u2, song]);
    check('after a decision the same user may suggest again', true);

    // --- missions and passport
    await expectError('LANGUAGE mission without a language refused', "INSERT INTO discovery_missions (code, title, description, criteria_type, target_count, active_from) VALUES ('x', 'x', 'x', 'LANGUAGE', 5, CURDATE())", [], 3819);
    await expectError('mission with two criteria refused', "INSERT INTO discovery_missions (code, title, description, criteria_type, language_id, genre_id, target_count, active_from) VALUES ('y', 'y', 'y', 'LANGUAGE', 1, 1, 5, CURDATE())", [], 3819);
    const lang = (await q('SELECT language_id FROM songs WHERE language_id IS NOT NULL GROUP BY language_id ORDER BY COUNT(*) DESC LIMIT 1'))[0].language_id;
    const mis = await q("INSERT INTO discovery_missions (code, title, description, criteria_type, language_id, target_count, active_from) VALUES ('lang-5', 'Five songs', 'Finish five songs in one language', 'LANGUAGE', ?, 5, CURDATE() - INTERVAL 400 DAY)", [lang]);
    const heavy = (await q('SELECT user_id FROM listening_history GROUP BY user_id ORDER BY COUNT(*) DESC LIMIT 1'))[0].user_id;
    await q("INSERT INTO user_missions (user_id, mission_id, joined_at) VALUES (?, ?, '2020-01-01 00:00:00')", [heavy, mis.insertId]);
    const prog = await q('SELECT progress_count FROM v_user_mission_progress WHERE user_id = ? AND mission_id = ?', [heavy, mis.insertId]);
    const direct = await q("SELECT COUNT(DISTINCT lh.song_id) n FROM listening_history lh JOIN songs s ON s.song_id = lh.song_id WHERE lh.user_id = ? AND lh.completed = 1 AND s.language_id = ? AND lh.started_at >= '2020-01-01'", [heavy, lang]);
    check('mission progress view equals a direct count of completed plays', Number(prog[0].progress_count) === Number(direct[0].n) && Number(direct[0].n) > 0, `${prog[0].progress_count} = ${direct[0].n}`);
    const pass = await q('SELECT stamp_type, COUNT(*) n FROM v_discovery_passport WHERE user_id = ? GROUP BY stamp_type', [heavy]);
    check('discovery passport returns language, genre and region stamps from real plays', pass.length === 3, JSON.stringify(pass));

    // --- capsules, occasions, settings, columns on existing tables
    await expectError('time capsule that unlocks in the past refused', "INSERT INTO time_capsules (user_id, title, unlock_at) VALUES (?, 'Old', NOW() - INTERVAL 1 DAY)", [u1], 3819);
    const cap = await q("INSERT INTO time_capsules (user_id, title, unlock_at) VALUES (?, 'Graduation', NOW() + INTERVAL 365 DAY)", [u1]);
    await q('INSERT INTO time_capsule_songs (capsule_id, song_id, position) VALUES (?, ?, 1)', [cap.insertId, song]);
    await expectError('opening a capsule before its unlock time refused', 'UPDATE time_capsules SET opened_at = NOW() WHERE capsule_id = ?', [cap.insertId], 3819);
    const occ = await q("INSERT INTO occasions (code, name, description) VALUES ('DIWALI', 'Diwali', 'Festival of lights')");
    await expectError('occasion window ending before it starts refused', "INSERT INTO occasion_windows (occasion_id, starts_on, ends_on) VALUES (?, '2026-11-10', '2026-11-01')", [occ.insertId], 3819);
    await expectError('occasion mood weight above 1 refused', 'INSERT INTO occasion_moods (occasion_id, mood_id, weight) VALUES (?, 1, 1.5)', [occ.insertId], 3819);
    await expectError('crossfade above 12 s refused', 'INSERT INTO user_settings (user_id, crossfade_sec) VALUES (?, 20)', [u1], 3819);
    await expectError('text scale 3.0 refused', 'INSERT INTO user_settings (user_id, text_scale) VALUES (?, 3.0)', [u1], 3819);
    await expectError('blank bio refused', "UPDATE user_profiles SET bio = '  ' WHERE user_id = ?", [u1], 3819);
    await expectError('public timestamp on a PRIVATE playlist refused', 'UPDATE playlists SET published_at = NOW() WHERE playlist_id = ?', [entry.playlist_id], 3819);
    await expectError('playlist version 0 refused', 'UPDATE playlists SET version = 0 WHERE playlist_id = ?', [entry.playlist_id], 3819);
    await expectError('target duration of 60 s refused', 'UPDATE recommendation_batches SET target_duration_sec = 60 WHERE batch_id = (SELECT b.batch_id FROM (SELECT MIN(batch_id) batch_id FROM recommendation_batches) b)', [], 3819);

    // --- fn_harmonic_compat
    const hc = (await q('SELECT fn_harmonic_compat(0,1,0,1) same, fn_harmonic_compat(0,1,7,1) fifth, fn_harmonic_compat(0,1,9,0) relative, fn_harmonic_compat(0,1,6,1) tritone, fn_harmonic_compat(0,1,2,1) two_steps, fn_harmonic_compat(9,0,4,0) am_em'))[0];
    check('harmonic: C=C 1.00, C–G 0.80, C–Am 0.80, C–D 0.40, C–F# 0.00, Am–Em 0.80',
      Number(hc.same) === 1 && Number(hc.fifth) === 0.8 && Number(hc.relative) === 0.8 && Number(hc.two_steps) === 0.4 && Number(hc.tritone) === 0 && Number(hc.am_em) === 0.8, JSON.stringify(hc));
    const nul = (await q('SELECT fn_harmonic_compat(NULL,1,0,1) a, fn_harmonic_compat(0,NULL,0,1) b, fn_harmonic_compat(0,1,NULL,1) c, fn_harmonic_compat(0,1,0,NULL) d'))[0];
    check('harmonic: any NULL input returns NULL (unknown), not 0', Object.values(nul).every((v) => v === null), JSON.stringify(nul));
    const bad = (await q('SELECT fn_harmonic_compat(12,1,0,1) a, fn_harmonic_compat(-1,1,0,1) b, fn_harmonic_compat(0,2,0,1) c, fn_harmonic_compat(0,1,300,1) d, fn_harmonic_compat(0,1,0,-1) e'))[0];
    check('harmonic: key outside 0–11 or mode outside 0/1 returns NULL', Object.values(bad).every((v) => v === null), JSON.stringify(bad));
    const sym = (await q(`SELECT COUNT(*) n, SUM(fn_harmonic_compat(a.k, a.m, b.k, b.m) <=> fn_harmonic_compat(b.k, b.m, a.k, a.m)) symmetric,
                                 SUM(fn_harmonic_compat(a.k, a.m, b.k, b.m) BETWEEN 0 AND 1) in_range,
                                 SUM(a.k = b.k AND a.m = b.m AND fn_harmonic_compat(a.k, a.m, b.k, b.m) = 1) identical
                            FROM (SELECT k, m FROM (SELECT 0 k UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11) ks
                                  CROSS JOIN (SELECT 0 m UNION SELECT 1) ms) a
                           CROSS JOIN (SELECT k, m FROM (SELECT 0 k UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11) ks
                                  CROSS JOIN (SELECT 0 m UNION SELECT 1) ms) b`))[0];
    check('harmonic: all 576 valid key pairs are symmetric, within 0–1, and identical keys score 1.00',
      Number(sym.n) === 576 && Number(sym.symmetric) === 576 && Number(sym.in_range) === 576 && Number(sym.identical) === 24, JSON.stringify(sym));

    // --- deleting a user cascades everything they own in the new tables (a throwaway user, so baseline RESTRICT FKs are not involved)
    const role = (await q('SELECT MIN(role_id) r FROM roles'))[0].r;
    const ux = (await q("INSERT INTO users (username, email, password_hash, role_id) VALUES ('rc_cascade_user', 'rc@example.invalid', REPEAT('x', 60), ?)", [role])).insertId;
    await q('INSERT INTO user_follows (follower_id, followee_id) VALUES (?, ?), (?, ?)', [ux, u1, u1, ux]);
    const rx = (await q("INSERT INTO listening_rooms (host_user_id, name, scheduled_start_at) VALUES (?, 'Mine', NOW() + INTERVAL 1 DAY)", [ux])).insertId;
    await q("INSERT INTO listening_room_members (room_id, user_id) VALUES (?, ?)", [r2, ux]);
    await q('INSERT INTO playlist_collaborators (playlist_id, user_id) VALUES (?, ?)', [entry.playlist_id, ux]);
    await q('INSERT INTO user_settings (user_id) VALUES (?)', [ux]);
    await q('DELETE FROM users WHERE user_id = ?', [ux]);
    const gone = (await q(`SELECT (SELECT COUNT(*) FROM user_follows WHERE ? IN (follower_id, followee_id)) f,
                                  (SELECT COUNT(*) FROM listening_rooms WHERE room_id = ?) r,
                                  (SELECT COUNT(*) FROM listening_room_members WHERE user_id = ? OR room_id = ?) m,
                                  (SELECT COUNT(*) FROM playlist_collaborators WHERE user_id = ?) pc,
                                  (SELECT COUNT(*) FROM user_settings WHERE user_id = ?) us`, [ux, rx, ux, rx, ux, ux]))[0];
    check('deleting a user removes their follows, hosted rooms (with HOST membership), memberships, collaborations and settings', Object.values(gone).every((v) => Number(v) === 0), JSON.stringify(gone));
  },

  /**
   * Runs with autocommit ON, outside any transaction. Makes the HOST-membership insert fail on purpose
   * (temporary extra trigger) and checks that the room insert is rolled back with it.
   */
  async atomicity({ q, check, expectError }) {
    const u = (await q('SELECT user_id FROM users ORDER BY user_id LIMIT 1 OFFSET 4'))[0].user_id;
    const before = (await q('SELECT COUNT(*) n FROM listening_rooms'))[0].n;
    await q(`CREATE TRIGGER zz_test_fail_member BEFORE INSERT ON listening_room_members FOR EACH ROW FOLLOWS trg_lrm_bi
             SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'simulated failure while creating the HOST membership'`);
    try {
      await expectError('room insert fails when its HOST membership cannot be created',
        "INSERT INTO listening_rooms (host_user_id, name, scheduled_start_at) VALUES (?, 'Atomic', NOW() + INTERVAL 1 DAY)", [u], 1644);
      const after = (await q('SELECT COUNT(*) n FROM listening_rooms'))[0].n;
      const members = (await q("SELECT COUNT(*) n FROM listening_room_members m LEFT JOIN listening_rooms r ON r.room_id = m.room_id WHERE r.room_id IS NULL"))[0].n;
      check('…and no room row (autocommit) or stray membership is left behind', after === before && Number(members) === 0, `rooms ${before} -> ${after}`);
    } finally {
      await q('DROP TRIGGER IF EXISTS zz_test_fail_member');
    }
    const id = (await q("INSERT INTO listening_rooms (host_user_id, name, scheduled_start_at) VALUES (?, 'Atomic ok', NOW() + INTERVAL 1 DAY)", [u])).insertId;
    check('without the simulated failure the same insert commits room + HOST together',
      (await q("SELECT COUNT(*) n FROM listening_room_members WHERE room_id = ? AND role = 'HOST'", [id]))[0].n === 1);
    await q('DELETE FROM listening_rooms WHERE room_id = ?', [id]);
  },

  /** Grants for the application account, checked as that account. */
  async grants({ asApp, check }) {
    const ok = async (name, sql) => { try { await asApp(sql); check(name, true); } catch (e) { check(name, false, e.sqlMessage || e.message); } };
    const denied = async (name, sql) => { try { await asApp(sql); check(name, false, 'statement was accepted'); } catch (e) { check(name, e.errno === 1142 || e.errno === 1143 || e.errno === 1370, `${e.errno}: ${e.sqlMessage}`); } };
    await ok('app account can read user_follows', 'SELECT COUNT(*) FROM user_follows');
    await ok('app account can read v_discovery_passport', 'SELECT COUNT(*) FROM v_discovery_passport');
    await ok('app account can execute fn_harmonic_compat', 'SELECT fn_harmonic_compat(0,1,7,1)');
    await denied('app account cannot UPDATE user_follows (granted SELECT, INSERT, DELETE only)', 'UPDATE user_follows SET created_at = created_at');
    await denied('app account cannot write discovery_missions (read-only catalogue)', "DELETE FROM discovery_missions WHERE code = 'none'");
    await denied('app account cannot DELETE metadata_suggestions (history is kept)', 'DELETE FROM metadata_suggestions WHERE suggestion_id = 0');
  },
};

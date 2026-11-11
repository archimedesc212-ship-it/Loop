// Test cases for database/migrations/proposed/0006_roadmap_58_87.sql (run by test-proposed-migration.js).
// Starting point: Phase 2 baseline + proposed 0005 (80 tables).
// Developed by Vaishnav Sai.
module.exports = {
  version: '0006',
  file: 'database/migrations/proposed/0006_roadmap_58_87.sql',
  requires: ['0005'],
  baseTables: 80,
  newTables: 14,
  newRoutines: [],
  changedBaselineObjects: ['columns:recommendation_batches.strategy', 'columns:pipeline_jobs.job_type'],

  partialStates: [
    { name: 'strategy already has AUTOPILOT but not RADIO',
      sql: ["ALTER TABLE recommendation_batches MODIFY COLUMN strategy ENUM('MOOD','TEXT','CONTEXT','DAILY','SIMILAR','TRENDING','DISCOVERY','REGIONAL','WORLD','SMART_PLAYLIST','RECOVERY','AUTOPILOT') NOT NULL"] },
    { name: 'seed_artist_id exists without its foreign key',
      sql: ['ALTER TABLE recommendation_batches ADD COLUMN seed_artist_id INT UNSIGNED NULL AFTER seed_song_id'] },
    { name: 'user_settings.history_retention_days exists without its CHECK',
      sql: ['ALTER TABLE user_settings ADD COLUMN history_retention_days SMALLINT UNSIGNED NULL'] },
    { name: 'retention_policies exists and an admin already changed a rule (the change is kept)',
      sql: [`CREATE TABLE retention_policies (
               data_class ENUM('ENDED_AUTH_SESSIONS','LOGIN_EVENTS','READ_NOTIFICATIONS','SEARCH_HISTORY','PIPELINE_JOB_LOGS','EXPIRED_SHARE_LINKS') NOT NULL,
               keep_days SMALLINT UNSIGNED NOT NULL, is_enabled TINYINT(1) NOT NULL DEFAULT 0, updated_by INT UNSIGNED NULL,
               updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (data_class),
               KEY idx_rp_updater (updated_by),
               CONSTRAINT fk_rp_updater FOREIGN KEY (updated_by) REFERENCES users (user_id) ON DELETE SET NULL,
               CONSTRAINT chk_rp_days CHECK (keep_days BETWEEN 1 AND 3650), CONSTRAINT chk_rp_flag CHECK (is_enabled IN (0, 1))) ENGINE=InnoDB`,
        "INSERT INTO retention_policies (data_class, keep_days, is_enabled) VALUES ('LOGIN_EVENTS', 400, 1)"],
      // data rows differ by design (fingerprint covers structure only); the kept value is checked in behaviour-style below
      after: async ({ q, check }) => {
        const r = (await q("SELECT keep_days, is_enabled FROM retention_policies WHERE data_class = 'LOGIN_EVENTS'"))[0];
        check('…the existing LOGIN_EVENTS rule (400 days, enabled) was not overwritten', r.keep_days === 400 && r.is_enabled === 1, JSON.stringify(r));
      } },
    { name: 'a helper procedure left behind by a crashed run',
      sql: ['CREATE PROCEDURE mig_0006_append_enum() BEGIN END'] },
  ],
  driftStates: [
    { name: '0005 has not been applied (playlists.version missing)',
      sql: ['ALTER TABLE playlists DROP CHECK chk_pl_version', 'ALTER TABLE playlists DROP COLUMN version'],
      error: /0006: table playlists does not have the expected columns/ },
    { name: 'notifications already exists without dedupe_key',
      sql: [`CREATE TABLE notifications (notification_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, user_id INT UNSIGNED NOT NULL,
               kind VARCHAR(30) NOT NULL, title VARCHAR(120) NOT NULL, body VARCHAR(300) NULL, link_path VARCHAR(200) NULL,
               created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, read_at DATETIME NULL) ENGINE=InnoDB`],
      error: /notifications|dedupe_key/ },
  ],

  async behaviour({ q, check, expectError }) {
    const [u1, u2] = (await q('SELECT user_id FROM users ORDER BY user_id LIMIT 2 OFFSET 2')).map((r) => r.user_id);
    const s = (await q('SELECT song_id, title, duration_sec FROM songs ORDER BY song_id LIMIT 2'));
    const pl = (await q('SELECT playlist_id, user_id FROM playlists ORDER BY playlist_id LIMIT 1'))[0];
    const artist = (await q('SELECT artist_id FROM artists ORDER BY artist_id LIMIT 1'))[0].artist_id;
    const model = (await q("SELECT model_id FROM intelligence_models WHERE kind = 'RECOMMENDER' ORDER BY model_id LIMIT 1"))[0].model_id;

    // defaults keep today's behaviour
    const rp = await q('SELECT data_class, keep_days, is_enabled FROM retention_policies ORDER BY data_class');
    const on = rp.filter((r) => r.is_enabled === 1).map((r) => `${r.data_class}:${r.keep_days}`);
    check('retention: only ENDED_AUTH_SESSIONS (30 days, as purged today) is enabled', rp.length === 6 && on.join() === 'ENDED_AUTH_SESSIONS:30', JSON.stringify(on));
    check('existing users keep history forever (history_retention_days NULL)', (await q('SELECT COUNT(*) n FROM user_settings WHERE history_retention_days IS NOT NULL'))[0].n === 0);
    const st = (await q("SELECT COLUMN_TYPE t, IS_NULLABLE nl FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'recommendation_batches' AND COLUMN_NAME = 'strategy'"))[0];
    check('strategy ENUM keeps every value and gains AUTOPILOT, RADIO (still NOT NULL)', st.t.startsWith("enum('MOOD','TEXT','CONTEXT','DAILY','SIMILAR','TRENDING','DISCOVERY','REGIONAL','WORLD','SMART_PLAYLIST','RECOVERY'") && st.t.endsWith(",'AUTOPILOT','RADIO')") && st.nl === 'NO', st.t);

    // 59 radio seeded by an artist
    const b = await q("INSERT INTO recommendation_batches (user_id, model_id, strategy, label, seed_artist_id, target_energy, target_valence, target_danceability, target_acousticness, target_instrumentalness, tempo_min, tempo_max) VALUES (?, ?, 'RADIO', 'Artist radio', ?, 0.5, 0.5, 0.5, 0.5, 0.1, 80, 140)", [u1, model, artist]);
    check('a RADIO batch can be seeded by an artist', b.affectedRows === 1);
    await expectError('a RADIO batch with an unknown seed artist is refused', "INSERT INTO recommendation_batches (user_id, model_id, strategy, label, seed_artist_id, target_energy, target_valence, target_danceability, target_acousticness, target_instrumentalness, tempo_min, tempo_max) VALUES (?, ?, 'RADIO', 'x', 99999999, 0.5, 0.5, 0.5, 0.5, 0.1, 80, 140)", [u1, model], 1452);

    // 63 bookmarks
    await q('INSERT INTO listening_bookmarks (user_id, song_id, position_sec, note) VALUES (?, ?, 30, ?)', [u1, s[0].song_id, 'the drop']);
    await expectError('bookmark beyond the end of the song refused', 'INSERT INTO listening_bookmarks (user_id, song_id, position_sec) VALUES (?, ?, ?)', [u1, s[0].song_id, s[0].duration_sec + 1], 1644);
    await expectError('same moment bookmarked twice refused', 'INSERT INTO listening_bookmarks (user_id, song_id, position_sec) VALUES (?, ?, 30)', [u1, s[0].song_id], 1062);
    await expectError('moving a bookmark beyond the end refused', 'UPDATE listening_bookmarks SET position_sec = ? WHERE user_id = ? AND song_id = ?', [s[0].duration_sec + 10, u1, s[0].song_id], 1644);
    await expectError('a bookmark cannot be moved to another user', 'UPDATE listening_bookmarks SET user_id = ? WHERE user_id = ? AND song_id = ?', [u2, u1, s[0].song_id], 1644);
    await q("INSERT INTO incognito_sessions (user_id, expires_at) VALUES (?, NOW() + INTERVAL 1 HOUR)", [u2]);
    await expectError('no bookmark is saved during a private session', 'INSERT INTO listening_bookmarks (user_id, song_id, position_sec) VALUES (?, ?, 10)', [u2, s[0].song_id], 1644);

    // 66 revisions
    const rev = await q("INSERT INTO playlist_revisions (playlist_id, version, name, created_by) VALUES (?, 1, 'v1', ?)", [pl.playlist_id, pl.user_id]);
    await q('INSERT INTO playlist_revision_songs (revision_id, position, song_id, song_title) VALUES (?, 1, ?, ?), (?, 2, ?, ?)',
      [rev.insertId, s[0].song_id, s[0].title, rev.insertId, s[1].song_id, s[1].title]);
    await expectError('two snapshots of the same version refused', "INSERT INTO playlist_revisions (playlist_id, version, name) VALUES (?, 1, 'again')", [pl.playlist_id], 1062);
    await expectError('a song twice in one snapshot refused', 'INSERT INTO playlist_revision_songs (revision_id, position, song_id, song_title) VALUES (?, 3, ?, ?)', [rev.insertId, s[0].song_id, s[0].title], 1062);

    // 69 share links
    const hash = 'a'.repeat(64);
    await q('INSERT INTO playlist_share_links (playlist_id, token_hash, created_by, expires_at) VALUES (?, ?, ?, NOW() + INTERVAL 7 DAY)', [pl.playlist_id, hash, pl.user_id]);
    await expectError('a raw (non-hash) token refused', "INSERT INTO playlist_share_links (playlist_id, token_hash, created_by, expires_at) VALUES (?, 'my-secret-token', ?, NOW() + INTERVAL 1 DAY)", [pl.playlist_id, pl.user_id], 3819);
    await expectError('a link that never expires (> 90 days) refused', 'INSERT INTO playlist_share_links (playlist_id, token_hash, created_by, expires_at) VALUES (?, ?, ?, NOW() + INTERVAL 1 YEAR)', [pl.playlist_id, 'b'.repeat(64), pl.user_id], 3819);
    await expectError('the same token hash twice refused', 'INSERT INTO playlist_share_links (playlist_id, token_hash, created_by, expires_at) VALUES (?, ?, ?, NOW() + INTERVAL 1 DAY)', [pl.playlist_id, hash, pl.user_id], 1062);

    // 71 follows and notifications
    await q('INSERT INTO artist_follows (user_id, artist_id) VALUES (?, ?)', [u1, artist]);
    await expectError('following an artist twice refused', 'INSERT INTO artist_follows (user_id, artist_id) VALUES (?, ?)', [u1, artist], 1062);
    await q("INSERT INTO notifications (user_id, kind, title, link_path, dedupe_key) VALUES (?, 'ARTIST_NEW_SONG', 'New song', ?, ?)", [u1, `/songs/${s[0].song_id}`, `song:${s[0].song_id}`]);
    const again = await q("INSERT IGNORE INTO notifications (user_id, kind, title, dedupe_key) VALUES (?, 'ARTIST_NEW_SONG', 'New song', ?)", [u1, `song:${s[0].song_id}`]);
    check('re-running a notification fan-out adds nothing (dedupe key)', again.affectedRows === 0);
    await expectError('an external link in a notification refused', "INSERT INTO notifications (user_id, kind, title, link_path, dedupe_key) VALUES (?, 'SECURITY', 'x', 'https://evil.example/x', 'k2')", [u1], 3819);
    await expectError('a javascript: link in a notification refused', "INSERT INTO notifications (user_id, kind, title, link_path, dedupe_key) VALUES (?, 'SECURITY', 'x', 'javascript:alert(1)', 'k3')", [u1], 3819);

    // 74 saves
    await q('INSERT INTO playlist_saves (user_id, playlist_id) VALUES (?, ?)', [u2, pl.playlist_id]);
    await expectError('saving the same playlist twice refused', 'INSERT INTO playlist_saves (user_id, playlist_id) VALUES (?, ?)', [u2, pl.playlist_id], 1062);

    // 75 collections
    await expectError('submission to a PRIVATE manual playlist refused', 'INSERT INTO collection_submissions (playlist_id, song_id, user_id) VALUES (?, ?, ?)', [pl.playlist_id, s[0].song_id, u2], 1644);
    const col = await q("INSERT INTO playlists (user_id, name, kind, visibility, published_at) VALUES (?, 'Monsoon songs (community)', 'EDITORIAL', 'PUBLIC', NOW())", [u1]);
    await q('INSERT INTO collection_submissions (playlist_id, song_id, user_id) VALUES (?, ?, ?)', [col.insertId, s[0].song_id, u2]);
    await expectError('a second open submission of the same song refused', 'INSERT INTO collection_submissions (playlist_id, song_id, user_id) VALUES (?, ?, ?)', [col.insertId, s[0].song_id, u1], 1062);
    await expectError('ACCEPTED without decided_at refused', "UPDATE collection_submissions SET status = 'ACCEPTED' WHERE playlist_id = ?", [col.insertId], 3819);

    // 77 login events
    await q("INSERT INTO login_events (user_id, outcome, session_id, ip_hash) VALUES (?, 'SUCCESS', 'abcdef0123456789', ?)", [u1, 'c'.repeat(64)]);
    await q("INSERT INTO login_events (user_id, outcome) VALUES (?, 'WRONG_PASSWORD')", [u1]);
    await expectError('SUCCESS without its session refused', "INSERT INTO login_events (user_id, outcome) VALUES (?, 'SUCCESS')", [u1], 3819);
    await expectError('a raw IP address refused (hash only)', "INSERT INTO login_events (user_id, outcome, ip_hash) VALUES (?, 'WRONG_PASSWORD', '203.0.113.9')", [u1], 3819);

    // 79 retention
    await expectError('user retention below 30 days refused', 'INSERT INTO user_settings (user_id, history_retention_days) VALUES (?, 7)', [u1], 3819);
    await q('INSERT INTO user_settings (user_id, history_retention_days) VALUES (?, 365)', [u1]);
    check('user retention of 365 days accepted', true);
    await expectError('policy keep_days 0 refused', "UPDATE retention_policies SET keep_days = 0 WHERE data_class = 'LOGIN_EVENTS'", [], 3819);

    // 85 experiments
    await expectError('RUNNING experiment without started_at refused', "INSERT INTO experiments (code, hypothesis, status) VALUES ('exp-a', 'h', 'RUNNING')", [], 3819);
    const exp = await q("INSERT INTO experiments (code, hypothesis) VALUES ('rec-v2-vs-v1', 'v2 weights raise completion rate')");
    await q("INSERT INTO experiment_arms (experiment_id, code, model_id, traffic_percent) VALUES (?, 'control', ?, 50), (?, 'treatment', ?, 50)", [exp.insertId, model, exp.insertId, model]);
    await expectError('arms above 100 % of traffic refused (INSERT)', "INSERT INTO experiment_arms (experiment_id, code, model_id, traffic_percent) VALUES (?, 'third', ?, 1)", [exp.insertId, model], 1644);
    await expectError('arms above 100 % of traffic refused (UPDATE)', "UPDATE experiment_arms SET traffic_percent = 60 WHERE experiment_id = ? AND code = 'control'", [exp.insertId], 1644);
    await q("UPDATE experiment_arms SET traffic_percent = 40 WHERE experiment_id = ? AND code = 'control'", [exp.insertId]);
    check('lowering an arm\'s share is allowed', true);
    const arm = (await q("SELECT arm_id FROM experiment_arms WHERE experiment_id = ? AND code = 'treatment'", [exp.insertId]))[0].arm_id;
    await q('UPDATE recommendation_batches SET experiment_arm_id = ? WHERE batch_id = ?', [arm, b.insertId]);
    await q('DELETE FROM experiments WHERE experiment_id = ?', [exp.insertId]);
    check('deleting an experiment keeps its recommendation batches (arm reference set to NULL)',
      (await q('SELECT experiment_arm_id a FROM recommendation_batches WHERE batch_id = ?', [b.insertId]))[0].a === null);

    // 86 flags
    await q("INSERT INTO feature_flags (flag_code, description, is_enabled, rollout_percent) VALUES ('rooms.beta', 'Listening rooms beta', 1, 10)");
    await q("INSERT INTO feature_flag_overrides (flag_code, user_id, is_enabled) VALUES ('rooms.beta', ?, 1)", [u2]);
    await expectError('rollout above 100 % refused', "UPDATE feature_flags SET rollout_percent = 150 WHERE flag_code = 'rooms.beta'", [], 3819);
    await expectError('flag code with spaces refused', "INSERT INTO feature_flags (flag_code, description) VALUES ('Rooms Beta', 'x')", [], 3819);

    // deleting a user removes everything personal from the new tables
    await q('DELETE FROM incognito_sessions WHERE user_id = ?', [u2]);
    const role = (await q('SELECT MIN(role_id) r FROM roles'))[0].r;
    const ux = (await q("INSERT INTO users (username, email, password_hash, role_id) VALUES ('rc_cascade_six', 'rc6@example.invalid', REPEAT('x', 60), ?)", [role])).insertId;
    await q('INSERT INTO listening_bookmarks (user_id, song_id, position_sec) VALUES (?, ?, 5)', [ux, s[1].song_id]);
    await q('INSERT INTO artist_follows (user_id, artist_id) VALUES (?, ?)', [ux, artist]);
    await q("INSERT INTO notifications (user_id, kind, title, dedupe_key) VALUES (?, 'SECURITY', 'Hi', 'k')", [ux]);
    await q("INSERT INTO login_events (user_id, outcome) VALUES (?, 'WRONG_PASSWORD')", [ux]);
    await q('INSERT INTO playlist_saves (user_id, playlist_id) VALUES (?, ?)', [ux, col.insertId]);
    await q("INSERT INTO feature_flag_overrides (flag_code, user_id, is_enabled) VALUES ('rooms.beta', ?, 0)", [ux]);
    await q('DELETE FROM users WHERE user_id = ?', [ux]);
    const left = (await q(`SELECT (SELECT COUNT(*) FROM listening_bookmarks WHERE user_id = ?) + (SELECT COUNT(*) FROM artist_follows WHERE user_id = ?)
                                + (SELECT COUNT(*) FROM notifications WHERE user_id = ?) + (SELECT COUNT(*) FROM login_events WHERE user_id = ?)
                                + (SELECT COUNT(*) FROM playlist_saves WHERE user_id = ?) + (SELECT COUNT(*) FROM feature_flag_overrides WHERE user_id = ?) n`, [ux, ux, ux, ux, ux, ux]))[0].n;
    check('deleting a user removes their bookmarks, follows, notifications, login events, saves and flag overrides', Number(left) === 0, `${left} rows left`);
  },

  async grants({ asApp, check }) {
    const ok = async (name, sql) => { try { await asApp(sql); check(name, true); } catch (e) { check(name, false, e.sqlMessage || e.message); } };
    const denied = async (name, sql) => { try { await asApp(sql); check(name, false, 'statement was accepted'); } catch (e) { check(name, e.errno === 1142 || e.errno === 1143, `${e.errno}: ${e.sqlMessage}`); } };
    await ok('app account can read notifications', 'SELECT COUNT(*) FROM notifications');
    await ok('app account can read feature flags', 'SELECT COUNT(*) FROM feature_flags');
    await denied('app account cannot delete login_events (append-only)', 'DELETE FROM login_events WHERE event_id = 0');
    await denied('app account cannot update login_events', 'UPDATE login_events SET outcome = outcome');
    await denied('app account cannot rewrite playlist history (revisions are insert-only)', "UPDATE playlist_revisions SET name = 'x' WHERE revision_id = 0");
    await denied('app account cannot delete retention policies', "DELETE FROM retention_policies WHERE data_class = 'LOGIN_EVENTS'");
  },
};

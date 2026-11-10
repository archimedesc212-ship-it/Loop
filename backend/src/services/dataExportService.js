'use strict';

const { withTransaction } = require('../config/db');
const auth = require('./authService');
const ApiError = require('../utils/ApiError');

/** Build a privacy-safe, user-scoped export. Secrets and session credentials are never selected. */
async function create(userId, password) {
  await auth.checkPassword(userId, password);
  return withTransaction(async (tx) => {
    const owner = await tx.one('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', [userId]);
    if (!owner) throw ApiError.notFound('Account');
    const recent = await tx.one(
      `SELECT audit_id FROM audit_logs
        WHERE actor_user_id = ? AND action = 'PERSONAL_DATA_EXPORT' AND created_at >= NOW() - INTERVAL 1 HOUR
        ORDER BY audit_id DESC LIMIT 1 FOR UPDATE`, [userId]);
    if (recent) throw new ApiError(429, 'EXPORT_RATE_LIMITED', 'A data export was already generated in the last hour. Please try again later.');

    const sections = await Promise.all([
      tx.one(`SELECT u.username, u.email, u.created_at AS accountCreatedAt, u.last_login_at AS lastLoginAt,
                     u.password_changed_at AS passwordLastChangedAt, r.code AS role,
                     up.display_name AS displayName, up.region_code AS regionCode, up.content_filter AS contentFilter,
                     up.listening_habit AS listeningHabit, up.onboarding_completed_at AS onboardingCompletedAt
                FROM users u JOIN roles r USING (role_id) LEFT JOIN user_profiles up USING (user_id)
               WHERE u.user_id = ?`, [userId]),
      tx.query(`SELECT l.code, l.name, l.native_name AS nativeName, ul.priority
                  FROM user_languages ul JOIN languages l USING (language_id)
                 WHERE ul.user_id = ? ORDER BY ul.priority`, [userId]),
      tx.query(`SELECT g.name, ugp.onboarding_weight AS onboardingWeight, ugp.plays, ugp.completes, ugp.skips,
                       ugp.replays, ugp.listen_sec AS listenedSeconds, ugp.short_term_score AS shortTermScore,
                       ugp.long_term_score AS longTermScore, ugp.blended_score AS blendedScore, ugp.last_played_at AS lastPlayedAt
                  FROM user_genre_preferences ugp JOIN genres g USING (genre_id)
                 WHERE ugp.user_id = ? ORDER BY ugp.blended_score DESC`, [userId]),
      tx.query(`SELECT a.name, uap.onboarding_weight AS onboardingWeight, uap.plays, uap.completes, uap.skips,
                       uap.replays, uap.listen_sec AS listenedSeconds, uap.short_term_score AS shortTermScore,
                       uap.long_term_score AS longTermScore, uap.blended_score AS blendedScore, uap.last_played_at AS lastPlayedAt
                  FROM user_artist_preferences uap JOIN artists a USING (artist_id)
                 WHERE uap.user_id = ? ORDER BY uap.blended_score DESC`, [userId]),
      tx.query(`SELECT m.name, ump.onboarding_weight AS onboardingWeight, ump.plays,
                       ump.short_term_score AS shortTermScore, ump.long_term_score AS longTermScore,
                       ump.blended_score AS blendedScore, ump.last_played_at AS lastPlayedAt
                  FROM user_mood_preferences ump JOIN moods m USING (mood_id)
                 WHERE ump.user_id = ? ORDER BY ump.blended_score DESC`, [userId]),
      tx.query(`SELECT lh.play_id AS playId, sc.song_id AS songId, sc.title, sc.artist_name AS artist,
                       lh.origin, lh.started_at AS startedAt, lh.ended_at AS endedAt, lh.listened_sec AS listenedSeconds,
                       lh.completion_pct AS completionPercent, lh.completed, lh.skipped, lh.is_replay AS replay
                  FROM listening_history lh JOIN v_song_catalog sc USING (song_id)
                 WHERE lh.user_id = ? ORDER BY lh.started_at`, [userId]),
      tx.query(`SELECT sc.song_id AS songId, sc.title, sc.artist_name AS artist, r.rating, r.rated_at AS ratedAt, r.updated_at AS updatedAt
                  FROM ratings r JOIN v_song_catalog sc USING (song_id)
                 WHERE r.user_id = ? ORDER BY r.updated_at`, [userId]),
      tx.query(`SELECT sc.song_id AS songId, sc.title, sc.artist_name AS artist, ul.liked_at AS likedAt
                  FROM user_likes ul JOIN v_song_catalog sc USING (song_id)
                 WHERE ul.user_id = ? ORDER BY ul.liked_at`, [userId]),
      tx.query(`SELECT p.playlist_id AS playlistId, p.name, p.description, p.kind, p.smart_type AS smartType,
                       p.song_count AS songCount, p.total_duration_sec AS totalDurationSeconds,
                       p.created_at AS createdAt, p.updated_at AS updatedAt
                  FROM playlists p WHERE p.user_id = ? ORDER BY p.created_at`, [userId]),
      tx.query(`SELECT p.playlist_id AS playlistId, ps.position, ps.added_at AS addedAt,
                       sc.song_id AS songId, sc.title, sc.artist_name AS artist
                  FROM playlists p JOIN playlist_songs ps USING (playlist_id) JOIN v_song_catalog sc USING (song_id)
                 WHERE p.user_id = ? ORDER BY p.playlist_id, ps.position`, [userId]),
      tx.query(`SELECT sc.song_id AS songId, sc.title, m.name AS mood, smr.match_percentage AS matchPercentage,
                       smr.review_text AS reviewText, smr.created_at AS createdAt, smr.updated_at AS updatedAt
                  FROM song_mood_ratings smr JOIN v_song_catalog sc USING (song_id) JOIN moods m USING (mood_id)
                 WHERE smr.user_id = ? ORDER BY smr.updated_at`, [userId]),
      tx.query(`SELECT query_text AS query, result_count AS resultCount, searched_at AS searchedAt
                  FROM search_history WHERE user_id = ? ORDER BY searched_at`, [userId]),
      tx.query(`SELECT created_at AS createdAt, last_seen_at AS lastSeenAt, expires_at AS expiresAt,
                       revoked_at AS revokedAt, revoke_reason AS revokeReason, user_agent AS userAgent
                  FROM auth_sessions WHERE user_id = ? ORDER BY created_at`, [userId]),
      tx.query(`SELECT strategy, label, input_text AS inputText, created_at AS generatedAt
                  FROM recommendation_batches WHERE user_id = ? ORDER BY created_at`, [userId]),
      tx.query(`SELECT a.stage_name AS stageName, a.artist_type AS artistType, a.country_code AS countryCode,
                       a.bio, a.website_url AS websiteUrl, a.status, a.submitted_at AS submittedAt,
                       a.review_note AS reviewNote, a.reviewed_at AS reviewedAt
                  FROM artist_applications a WHERE a.user_id = ? ORDER BY a.submitted_at`, [userId]),
      tx.query(`SELECT ar.name AS artistName, aa.account_status AS status, aa.created_at AS linkedAt
                  FROM artist_accounts aa JOIN artists ar USING (artist_id)
                 WHERE aa.user_id = ? ORDER BY aa.created_at`, [userId]),
      tx.query(`SELECT title, version_label AS versionLabel, status, scan_status AS scanStatus,
                       composition_rights AS compositionRights, recording_rights AS recordingRights,
                       rights_evidence_ref AS rightsEvidenceReference, territory_codes AS territories,
                       allowed_uses AS allowedUses, licence_start AS licenceStart, licence_end AS licenceEnd,
                       royalty_share_pct AS royaltySharePercent, royalty_currency AS royaltyCurrency,
                       created_at AS createdAt, updated_at AS updatedAt
                  FROM artist_uploads WHERE user_id = ? ORDER BY created_at`, [userId]),
      tx.query(`SELECT e.checkin_date AS checkinDate, m.name AS mood, e.note,
                       e.created_at AS createdAt, e.updated_at AS updatedAt
                  FROM mood_diary_entries e LEFT JOIN moods m ON m.mood_id = e.mood_id
                 WHERE e.user_id = ? ORDER BY e.checkin_date`, [userId]),
    ]);

    await tx.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, new_values)
                    VALUES (?, 'PERSONAL_DATA_EXPORT', 'user', ?, JSON_OBJECT('format', 'json', 'version', 1))`, [userId, String(userId)]);

    const keys = ['account', 'languages', 'genrePreferences', 'artistPreferences', 'moodPreferences', 'listeningHistory',
      'ratings', 'likes', 'playlists', 'playlistSongs', 'moodRatings', 'searchHistory', 'sessionHistory',
      'recommendationHistory', 'artistApplications', 'artistProfiles', 'artistUploads', 'moodDiaryEntries'];
    const data = Object.fromEntries(keys.map((key, index) => [key, sections[index]]));
    return {
      product: 'LOOP', schemaVersion: 1, exportedAt: new Date().toISOString(),
      privacyNote: 'This file contains personal data associated with your account. Password hashes, session tokens, token hashes, IP hashes and other users’ data are excluded. Store and share this file carefully.',
      data,
    };
  }, { actorId: userId });
}

module.exports = { create };

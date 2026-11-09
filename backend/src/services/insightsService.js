// Listening Profile, Music Mood Journey and preference transparency.
// Every number comes from a query over real rows. "Mood" here always means
// the mood of the MUSIC played; it is not an assessment of the listener.
const { query, one, call } = require('../config/db');

async function profile(userId, days = 30) {
  const sets = await call('sp_user_listening_summary', [userId, days]);
  const [head] = sets[0] || [];
  const extremes = sets[1] || [];
  const [trend] = sets[2] || [];
  const [streak] = await query(
    `WITH days AS (SELECT DISTINCT DATE(started_at) AS d FROM listening_history WHERE user_id = ?),
          islands AS (SELECT d, DATE_SUB(d, INTERVAL ROW_NUMBER() OVER (ORDER BY d) DAY) AS grp FROM days),
          runs AS (SELECT MIN(d) AS start_day, MAX(d) AS end_day, COUNT(*) AS len FROM islands GROUP BY grp)
     SELECT (SELECT len FROM runs WHERE end_day >= CURDATE() - INTERVAL 1 DAY ORDER BY end_day DESC LIMIT 1) AS current_streak,
            (SELECT MAX(len) FROM runs) AS longest_streak`, [userId]);
  const longTerm = await query(
    `SELECT DATE_FORMAT(started_at, '%Y-%m') AS month, COUNT(*) AS plays, ROUND(SUM(listened_sec) / 60) AS minutes,
            ROUND(AVG(af.energy), 3) AS avg_energy, ROUND(AVG(af.valence), 3) AS avg_valence
       FROM listening_history lh JOIN audio_features af ON af.song_id = lh.song_id AND af.is_current = 1
      WHERE lh.user_id = ? AND lh.skipped = 0 GROUP BY month ORDER BY month`, [userId]);
  const pct = (a, b) => (b ? Math.round((100 * (a - b)) / b) : null);
  return {
    headline: head ? {
      totalPlays: head.total_plays, minutes: Number(head.minutes_listened), uniqueSongs: head.unique_songs, activeDays: head.active_days,
      completionRate: head.completion_rate, skipRate: head.skip_rate, replayRate: head.replay_rate,
      avgEnergy: head.avg_energy, avgTempo: head.avg_tempo, avgSongDurationSec: head.avg_song_duration_sec,
      peakHour: head.peak_hour, dominantMood: head.dominant_mood, favoriteGenre: head.favorite_genre, favoriteArtist: head.favorite_artist,
      lastPlayedAt: head.last_played_at,
    } : null,
    mostReplayed: extremes.find((e) => e.kind === 'MOST_REPLAYED') || null,
    mostSkipped: extremes.find((e) => e.kind === 'MOST_SKIPPED') || null,
    recentTrend: trend ? { playsLast7: Number(trend.plays_last_7d || 0), playsPrev7: Number(trend.plays_prev_7d || 0),
      minutesLast7: Number(trend.minutes_last_7d || 0), minutesPrev7: Number(trend.minutes_prev_7d || 0),
      changePct: pct(Number(trend.minutes_last_7d || 0), Number(trend.minutes_prev_7d || 0)) } : null,
    streak: { current: streak?.current_streak || 0, longest: streak?.longest_streak || 0 },
    longTerm,
  };
}

async function activity(userId) {
  const daily = await query(
    `WITH RECURSIVE cal AS (SELECT CURDATE() - INTERVAL 29 DAY AS d UNION ALL SELECT d + INTERVAL 1 DAY FROM cal WHERE d < CURDATE())
     SELECT cal.d AS day, COALESCE(v.plays, 0) AS plays, COALESCE(v.minutes, 0) AS minutes,
            COALESCE(v.moving_avg_7d, (SELECT ROUND(SUM(minutes) / 7, 1) FROM v_daily_listening_summary x
                                        WHERE x.user_id = ? AND x.day BETWEEN cal.d - INTERVAL 6 DAY AND cal.d)) AS moving_avg_7d,
            v.running_minutes
       FROM cal LEFT JOIN v_daily_listening_summary v ON v.user_id = ? AND v.day = cal.d
      ORDER BY cal.d`, [userId, userId]);
  const heatmap = await query(
    `SELECT WEEKDAY(started_at) AS weekday, HOUR(started_at) AS hour, COUNT(*) AS plays
       FROM listening_history WHERE user_id = ? AND started_at >= NOW() - INTERVAL 60 DAY
      GROUP BY WEEKDAY(started_at), HOUR(started_at)`, [userId]);
  const weekdays = await query(
    `SELECT DAYNAME(started_at) AS day, WEEKDAY(started_at) AS idx, COUNT(*) AS plays, ROUND(SUM(listened_sec) / 60) AS minutes
       FROM listening_history WHERE user_id = ? GROUP BY WEEKDAY(started_at), DAYNAME(started_at) ORDER BY idx`, [userId]);
  const genres = await query(
    `SELECT g.name, g.color_hex AS color, COUNT(*) AS plays, ROUND(100 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS share
       FROM listening_history lh JOIN song_genres sg ON sg.song_id = lh.song_id AND sg.is_primary = 1
       JOIN genres g ON g.genre_id = sg.genre_id
      WHERE lh.user_id = ? AND lh.skipped = 0 GROUP BY g.genre_id, g.name, g.color_hex ORDER BY plays DESC LIMIT 8`, [userId]);
  const languages = await query(
    `SELECT COALESCE(l.name, 'Instrumental') AS name, COUNT(*) AS plays
       FROM listening_history lh JOIN songs s ON s.song_id = lh.song_id LEFT JOIN languages l ON l.language_id = s.language_id
      WHERE lh.user_id = ? AND lh.skipped = 0 GROUP BY l.name ORDER BY plays DESC`, [userId]);
  const contexts = await query(
    `SELECT c.name, c.emoji, COUNT(DISTINCT ls.session_id) AS sessions, ROUND(SUM(lh.listened_sec) / 60) AS minutes
       FROM listening_sessions ls JOIN contexts c ON c.context_id = ls.context_id
       LEFT JOIN listening_history lh ON lh.session_id = ls.session_id
      WHERE ls.user_id = ? GROUP BY c.context_id, c.name, c.emoji ORDER BY minutes DESC`, [userId]);
  return { daily, heatmap, weekdays, genres, languages, contexts };
}

/** Music Mood Journey: distributions over time, transitions and trends. */
async function moodJourney(userId, period = 'weekly') {
  const bucket = { daily: "DATE(lh.started_at)", weekly: 'fn_week_start(DATE(lh.started_at))', monthly: "DATE_FORMAT(lh.started_at, '%Y-%m-01')" }[period];
  const span = { daily: 14, weekly: 56, monthly: 180 }[period];
  const distribution = await query(
    `SELECT ${bucket} AS bucket, pm.mood_name AS mood, pm.color_hex AS color, COUNT(*) AS plays,
            ROUND(100 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY ${bucket}), 1) AS share
       FROM listening_history lh JOIN v_song_primary_mood pm ON pm.song_id = lh.song_id
      WHERE lh.user_id = ? AND lh.skipped = 0 AND lh.started_at >= CURDATE() - INTERVAL ? DAY
      GROUP BY bucket, pm.mood_name, pm.color_hex ORDER BY bucket, plays DESC`, [userId, span]);
  // consecutive plays inside one session: LAG gives the previous song's mood
  const transitions = await query(
    `WITH seq AS (
       SELECT lh.session_id, lh.started_at, pm.mood_name AS mood,
              LAG(pm.mood_name) OVER (PARTITION BY lh.session_id ORDER BY lh.started_at, lh.play_id) AS prev_mood
         FROM listening_history lh JOIN v_song_primary_mood pm ON pm.song_id = lh.song_id
        WHERE lh.user_id = ? AND lh.skipped = 0 AND lh.started_at >= CURDATE() - INTERVAL ? DAY
     )
     SELECT prev_mood AS from_mood, mood AS to_mood, COUNT(*) AS n
       FROM seq WHERE prev_mood IS NOT NULL AND prev_mood <> mood
      GROUP BY prev_mood, mood ORDER BY n DESC LIMIT 12`, [userId, span]);
  const sessionArcs = await query(
    `WITH seq AS (
       SELECT lh.session_id, pm.mood_name AS mood,
              FIRST_VALUE(pm.mood_name) OVER w AS first_mood,
              LAST_VALUE(pm.mood_name) OVER (w ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS last_mood,
              LEAD(lh.started_at) OVER w AS next_start
         FROM listening_history lh JOIN v_song_primary_mood pm ON pm.song_id = lh.song_id
        WHERE lh.user_id = ? AND lh.skipped = 0 AND lh.started_at >= CURDATE() - INTERVAL ? DAY
       WINDOW w AS (PARTITION BY lh.session_id ORDER BY lh.started_at, lh.play_id)
     )
     SELECT first_mood, last_mood, COUNT(DISTINCT session_id) AS sessions
       FROM seq WHERE first_mood <> last_mood GROUP BY first_mood, last_mood ORDER BY sessions DESC LIMIT 6`, [userId, span]);
  const trends = await query(
    `SELECT mood_name AS mood, week_start, share_pct, prev_share_pct, share_change
       FROM v_weekly_mood_summary WHERE user_id = ? AND week_start = fn_week_start(CURDATE())
      ORDER BY share_change DESC`, [userId]);
  const segments = await query(
    `SELECT m.name AS mood, m.color_hex AS color, ROUND(SUM(LEAST(ms.end_sec, lh.listened_sec) - LEAST(ms.start_sec, lh.listened_sec)) / 60) AS minutes
       FROM listening_history lh
       JOIN mood_segments ms ON ms.song_id = lh.song_id
       JOIN intelligence_models im ON im.model_id = ms.model_id AND im.is_active = 1
       JOIN moods m ON m.mood_id = ms.mood_id
      WHERE lh.user_id = ? AND lh.started_at >= CURDATE() - INTERVAL ? DAY AND ms.start_sec < lh.listened_sec
      GROUP BY m.mood_id, m.name, m.color_hex ORDER BY minutes DESC`, [userId, span]);
  return { period, spanDays: span, distribution, transitions, sessionArcs, trends, segmentMinutes: segments,
    note: 'Moods describe the music you played, not how you felt.' };
}

async function preferences(userId) {
  const [genres, artists, moods, contexts, evidence, languages, model] = await Promise.all([
    query(`SELECT g.name, ugp.plays, ugp.completes, ugp.skips, ugp.replays, ROUND(ugp.listen_sec / 60) AS minutes,
                  ugp.short_term_score AS shortTerm, ugp.long_term_score AS longTerm, ugp.blended_score AS score,
                  ugp.onboarding_weight AS onboarding, ugp.last_played_at AS lastPlayed, ugp.computed_at AS computedAt
             FROM user_genre_preferences ugp JOIN genres g ON g.genre_id = ugp.genre_id
            WHERE ugp.user_id = ? ORDER BY ugp.blended_score DESC LIMIT 10`, [userId]),
    query(`SELECT a.name, uap.plays, uap.completes, uap.skips, uap.replays, uap.short_term_score AS shortTerm,
                  uap.long_term_score AS longTerm, uap.blended_score AS score, uap.onboarding_weight AS onboarding
             FROM user_artist_preferences uap JOIN artists a ON a.artist_id = uap.artist_id
            WHERE uap.user_id = ? ORDER BY uap.blended_score DESC LIMIT 10`, [userId]),
    query(`SELECT m.name, m.emoji, m.color_hex AS color, ump.plays, ump.short_term_score AS shortTerm, ump.long_term_score AS longTerm,
                  ump.blended_score AS score, ump.onboarding_weight AS onboarding
             FROM user_mood_preferences ump JOIN moods m ON m.mood_id = ump.mood_id
            WHERE ump.user_id = ? ORDER BY ump.blended_score DESC`, [userId]),
    query(`SELECT c.name, c.emoji, ucp.sessions, ROUND(ucp.listen_sec / 60) AS minutes, ucp.blended_score AS score, ucp.onboarding_weight AS onboarding
             FROM user_context_preferences ucp JOIN contexts c ON c.context_id = ucp.context_id
            WHERE ucp.user_id = ? ORDER BY ucp.blended_score DESC`, [userId]),
    one(`SELECT COALESCE(SUM(completed), 0) AS completed,
                fn_model_param(fn_active_model('PREFERENCE'), 'cold_start_plays') AS needed
           FROM listening_history WHERE user_id = ?`, [userId]),
    query(`SELECT l.name, l.native_name AS nativeName, ul.priority FROM user_languages ul JOIN languages l ON l.language_id = ul.language_id
            WHERE ul.user_id = ? ORDER BY ul.priority`, [userId]),
    one(`SELECT im.name, im.version, im.description FROM intelligence_models im WHERE im.kind = 'PREFERENCE' AND im.is_active = 1`),
  ]);
  const evidenceShare = Math.min(1, Number(evidence.completed) / Number(evidence.needed));
  return { genres, artists, moods, contexts, languages, model,
    evidence: { completedPlays: Number(evidence.completed), neededForFullConfidence: Number(evidence.needed),
      behaviourShare: Math.round(evidenceShare * 100), onboardingShare: Math.round((1 - evidenceShare) * 100) } };
}

module.exports = { profile, activity, moodJourney, preferences };

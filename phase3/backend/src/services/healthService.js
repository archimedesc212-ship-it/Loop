// Database health and query-performance panels for admins.
// Read-only. Never exposes credentials, hostnames or connection strings.
const { query, one } = require('../config/db');
const { db } = require('../config/env');

const IDENT = /^[a-z_][a-z0-9_]*$/;

/** Exact row counts for every base table (names come from information_schema, then re-validated). */
async function tableCounts() {
  const tables = await query(
    `SELECT TABLE_NAME AS name, ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024) AS kb, ROUND(INDEX_LENGTH / 1024) AS index_kb
       FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`, [db.database]);
  const safe = tables.filter((t) => IDENT.test(t.name));
  const counts = await query(safe.map((t) => `SELECT '${t.name}' AS name, COUNT(*) AS n FROM \`${t.name}\``).join(' UNION ALL '));
  const m = new Map(counts.map((c) => [c.name, c.n]));
  return safe.map((t) => ({ name: t.name, rows: m.get(t.name), sizeKb: Number(t.kb), indexKb: Number(t.index_kb) }));
}

/** Rules a foreign key or CHECK cannot express. Each should return 0 rows. */
const CHECKS = [
  ['Active songs without a current audio analysis',
    `SELECT COUNT(*) AS n FROM songs s WHERE s.status = 'ACTIVE'
       AND NOT EXISTS (SELECT 1 FROM audio_features af WHERE af.song_id = s.song_id AND af.is_current = 1)`],
  ['Active songs without exactly one primary genre',
    `SELECT COUNT(*) AS n FROM songs s WHERE s.status = 'ACTIVE'
       AND (SELECT COUNT(*) FROM song_genres sg WHERE sg.song_id = s.song_id AND sg.is_primary = 1) <> 1`],
  ['Active songs without a mood from the active mood model',
    `SELECT COUNT(*) AS n FROM songs s WHERE s.status = 'ACTIVE'
       AND NOT EXISTS (SELECT 1 FROM v_current_song_moods cm WHERE cm.song_id = s.song_id)`],
  ['Playlists whose stored song count or length drifted from playlist_songs',
    `SELECT COUNT(*) AS n FROM playlists p
      WHERE p.song_count <> (SELECT COUNT(*) FROM playlist_songs ps WHERE ps.playlist_id = p.playlist_id)
         OR p.total_duration_sec <> (SELECT COALESCE(SUM(s.duration_sec), 0) FROM playlist_songs ps JOIN songs s ON s.song_id = ps.song_id
                                      WHERE ps.playlist_id = p.playlist_id)`],
  ['Finished plays whose completion % disagrees with listened time',
    `SELECT COUNT(*) AS n FROM listening_history lh JOIN songs s ON s.song_id = lh.song_id
      WHERE lh.ended_at IS NOT NULL AND ABS(lh.completion_pct - fn_completion_pct(lh.listened_sec, s.duration_sec)) > 0.01`],
  ['Closed sessions whose summary disagrees with their plays',
    `SELECT COUNT(*) AS n FROM listening_sessions ls
      WHERE ls.status = 'CLOSED' AND ls.plays <> (SELECT COUNT(*) FROM listening_history lh WHERE lh.session_id = ls.session_id)`],
  ['Merged songs that still have listening history',
    `SELECT COUNT(*) AS n FROM songs s JOIN listening_history lh ON lh.song_id = s.song_id WHERE s.status = 'MERGED'`],
  ['Completed provenance records not linked to any entity',
    `SELECT COUNT(*) AS n FROM source_records WHERE status = 'COMPLETED'
       AND song_id IS NULL AND artist_id IS NULL AND album_id IS NULL AND film_id IS NULL`],
  ['Private sessions past expiry still marked ACTIVE (cleanup pending)',
    `SELECT COUNT(*) AS n FROM incognito_sessions WHERE status = 'ACTIVE' AND expires_at <= NOW()`],
  ['Preference rows computed by an inactive preference model',
    `SELECT COUNT(*) AS n FROM user_genre_preferences ugp JOIN intelligence_models im ON im.model_id = ugp.model_id WHERE im.is_active = 0`],
];

async function integrity() {
  const out = [];
  for (const [label, sql] of CHECKS) {
    const r = await one(sql);
    // expired-but-not-yet-cleaned private sessions are normal between scheduler runs
    const severity = /cleanup pending/.test(label) ? 'warn' : 'error';
    out.push({ label, violations: Number(r.n), ok: Number(r.n) === 0, severity });
  }
  return out;
}

async function health() {
  const [tables, checks, jobs, failed, pending, audit, indexes, slow, sessions, version] = await Promise.all([
    tableCounts(),
    integrity(),
    query(`SELECT job_type AS type, status, COUNT(*) AS n, MAX(created_at) AS lastAt FROM pipeline_jobs GROUP BY job_type, status ORDER BY job_type`),
    query(`SELECT job_id AS id, job_type AS type, retry_count AS retries, last_error AS error, completed_at AS at
             FROM pipeline_jobs WHERE status = 'FAILED' ORDER BY job_id DESC LIMIT 10`),
    one(`SELECT SUM(review_type = 'POSSIBLE_DUPLICATE') AS duplicates, SUM(review_type = 'SUSPICIOUS_METADATA') AS suspicious,
                SUM(review_type = 'FAILED_INGESTION') AS failed, COUNT(*) AS total FROM review_queue WHERE status = 'PENDING'`),
    query(`SELECT a.audit_id AS id, a.action, a.entity_type AS entityType, a.entity_id AS entityId, a.created_at AS createdAt,
                  up.display_name AS actor FROM audit_logs a LEFT JOIN user_profiles up ON up.user_id = a.actor_user_id
            ORDER BY a.audit_id DESC LIMIT 12`),
    query(`SELECT TABLE_NAME AS tableName, INDEX_NAME AS indexName, NON_UNIQUE = 0 AS isUnique, INDEX_TYPE AS type,
                  GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ', ') AS columns, MAX(CARDINALITY) AS cardinality
             FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ?
            GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE, INDEX_TYPE ORDER BY TABLE_NAME, INDEX_NAME = 'PRIMARY' DESC, INDEX_NAME`, [db.database]),
    slowQueries(),
    one(`SELECT (SELECT COUNT(*) FROM listening_sessions WHERE status = 'OPEN') AS open_listening_sessions,
                (SELECT COUNT(*) FROM incognito_sessions WHERE status = 'ACTIVE' AND expires_at > NOW()) AS active_private_sessions,
                (SELECT COUNT(*) FROM incognito_sessions WHERE status = 'ACTIVE' AND expires_at <= NOW()) AS expired_private_sessions,
                (SELECT COUNT(*) FROM incognito_sessions WHERE status IN ('ENDED','EXPIRED')) AS closed_private_headers`),
    one('SELECT VERSION() AS version'),
  ]);
  const sizeKb = tables.reduce((s, t) => s + t.sizeKb, 0);
  return {
    server: { version: version.version, database: db.database, sizeKb, tables: tables.length, checkedAt: new Date().toISOString() },
    tables, integrity: checks, jobs, failedJobs: failed,
    reviewQueue: { duplicates: Number(pending.duplicates || 0), suspicious: Number(pending.suspicious || 0), failed: Number(pending.failed || 0), total: Number(pending.total || 0) },
    recentAudit: audit, indexes, slowQueries: slow, sessions,
  };
}

/** Slowest statement shapes on this schema (performance_schema digests; may be unavailable). */
async function slowQueries() {
  try {
    const rows = await query(
      `SELECT LEFT(DIGEST_TEXT, 220) AS statement, COUNT_STAR AS calls, ROUND(AVG_TIMER_WAIT / 1e9, 2) AS avgMs,
              ROUND(MAX_TIMER_WAIT / 1e9, 2) AS maxMs, SUM_ROWS_EXAMINED AS rowsExamined, SUM_NO_INDEX_USED AS noIndexUsed
         FROM performance_schema.events_statements_summary_by_digest
        WHERE SCHEMA_NAME = ? AND DIGEST_TEXT IS NOT NULL AND DIGEST_TEXT NOT LIKE 'EXPLAIN%'
        ORDER BY AVG_TIMER_WAIT DESC LIMIT 10`, [db.database]);
    return { available: true, rows };
  } catch {
    return { available: false, rows: [], note: 'performance_schema is not readable on this server.' };
  }
}

// ---------------------------------------------------------------------------
// QUERY PERFORMANCE LAB: each important query is explained with its index and
// again with that index ignored, so the effect of the index is visible.
// ---------------------------------------------------------------------------
const LAB = [
  {
    id: 'user-timeline', title: "A listener's last 7 days of plays",
    why: 'Profile, streaks and "recently played" read one user\'s recent history.',
    index: 'idx_lh_user_time (user_id, started_at)', table: 'listening_history', ignore: 'idx_lh_user_time, idx_lh_user_song',
    sql: (hint) => `SELECT play_id, song_id, started_at FROM listening_history ${hint}
                     WHERE user_id = 3 AND started_at >= NOW() - INTERVAL 7 DAY ORDER BY started_at DESC`,
  },
  {
    id: 'mood-songs', title: 'Songs carrying one mood, strongest first',
    why: 'The mood page and the engine look songs up by mood, the reverse of the (song, mood, model) primary key.',
    index: 'idx_sm_model_mood (model_id, mood_id, confidence)', table: 'song_moods', ignore: 'idx_sm_model_mood',
    sql: (hint) => `SELECT song_id, confidence FROM song_moods ${hint}
                     WHERE model_id = 4 AND mood_id = 3 ORDER BY confidence DESC`,
  },
  {
    id: 'song-trend', title: 'Plays of one song in the last 30 days',
    why: 'Trend snapshots and song statistics count plays per song inside a time window.',
    index: 'idx_lh_song_time (song_id, started_at)', table: 'listening_history', ignore: 'idx_lh_song_time',
    sql: (hint) => `SELECT COUNT(*) FROM listening_history ${hint}
                     WHERE song_id = 12 AND started_at >= NOW() - INTERVAL 30 DAY`,
  },
  {
    id: 'title-search', title: 'Full-text song search ("vennela")',
    why: 'Search uses an ngram FULLTEXT index so partial words and transliterations match.',
    index: 'ft_songs_title FULLTEXT (title) WITH PARSER ngram', table: 'songs', ignore: null,
    sql: () => `SELECT song_id, title FROM songs WHERE MATCH(title) AGAINST ('vennela' IN NATURAL LANGUAGE MODE)`,
    alt: () => `SELECT song_id, title FROM songs WHERE LOWER(title) LIKE '%vennela%'`,
  },
  {
    id: 'user-ratings', title: 'Average rating of one song',
    why: 'Song cards show the average rating; ratings are keyed by (user, song), so song-first lookups need their own index.',
    index: 'idx_ratings_song (song_id, rating)', table: 'ratings', ignore: 'idx_ratings_song',
    sql: (hint) => `SELECT AVG(rating), COUNT(*) FROM ratings ${hint} WHERE song_id = 12`,
  },
];

function planSummary(rows) {
  return rows.map((r) => ({ table: r.table, type: r.type, key: r.key, possibleKeys: r.possible_keys, rows: r.rows,
    filtered: r.filtered, extra: r.Extra }));
}

async function explainOne(sql) {
  const [plan, tree, analyze] = await Promise.all([
    query(`EXPLAIN ${sql}`),
    query(`EXPLAIN FORMAT=TREE ${sql}`),
    query(`EXPLAIN ANALYZE ${sql}`).catch(() => null),
  ]);
  const a = analyze && analyze[0] ? Object.values(analyze[0])[0] : null;
  const ms = a ? Number((a.match(/actual time=[\d.]+\.\.([\d.]+)/) || [])[1]) : null;
  return { plan: planSummary(plan), tree: Object.values(tree[0])[0], analyze: a, actualMs: Number.isFinite(ms) ? ms : null,
    rowsExamined: plan.reduce((s, r) => s + Number(r.rows || 0), 0) };
}

async function performanceLab() {
  const out = [];
  for (const q of LAB) {
    const withIdx = await explainOne(q.sql(''));
    let without = null;
    if (q.ignore) without = await explainOne(q.sql(`IGNORE INDEX (${q.ignore})`));
    else if (q.alt) without = await explainOne(q.alt());
    out.push({ id: q.id, title: q.title, why: q.why, index: q.index, sql: q.sql('').replace(/\s+/g, ' ').trim(),
      withoutLabel: q.ignore ? `Same query with IGNORE INDEX (${q.ignore})` : 'Equivalent LIKE \'%…%\' query (cannot use an index)',
      withIndex: withIdx, withoutIndex: without });
  }
  return out;
}

module.exports = { health, integrity, tableCounts, performanceLab };

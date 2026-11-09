// Read-side catalogue and search. Everything is a SQL query; nothing is
// filtered from an in-memory array.
const { query, one } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { toSong, withUserFlags } = require('./songMapper');
const { normalise } = require('./moodParser');

/** SQL fragment + params that applies the user's content filter to alias `sc`. */
function contentFilter(user) {
  if (!user || user.contentFilter === 'OFF') return ['', []];
  if (user.contentFilter === 'NO_EXPLICIT') return [' AND sc.explicit = 0', []];
  return [" AND sc.explicit = 0 AND sc.content_rating = 'ALL'", []];
}

async function listSongs(user, { genreId, moodId, languageId, page = 1, pageSize = 24, sort = 'popular' }) {
  const where = ["sc.status = 'ACTIVE'"];
  const params = [];
  if (genreId) { where.push('EXISTS (SELECT 1 FROM song_genres g WHERE g.song_id = sc.song_id AND g.genre_id = ?)'); params.push(genreId); }
  if (moodId) { where.push('EXISTS (SELECT 1 FROM v_current_song_moods m WHERE m.song_id = sc.song_id AND m.mood_id = ? AND m.confidence >= 0.5)'); params.push(moodId); }
  if (languageId === 0) where.push('sc.language_id IS NULL');
  else if (languageId) { where.push('sc.language_id = ?'); params.push(languageId); }
  const [cf] = contentFilter(user);
  const order = { popular: 'sc.popularity DESC, sc.song_id', newest: 'sc.release_year DESC, sc.song_id DESC', title: 'sc.title, sc.song_id' }[sort] || 'sc.popularity DESC';
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM v_song_catalog sc WHERE ${where.join(' AND ')}${cf}`, params);
  const rows = await query(`SELECT sc.* FROM v_song_catalog sc WHERE ${where.join(' AND ')}${cf} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize]);
  return { total, page, pageSize, songs: await withUserFlags(user.id, rows.map(toSong)) };
}

async function songDetail(user, songId) {
  const row = await one('SELECT * FROM v_song_catalog WHERE song_id = ?', [songId]);
  if (!row || (row.status !== 'ACTIVE' && !user.permissions.has('catalog.write'))) throw ApiError.notFound('Song');
  const [song] = await withUserFlags(user.id, [toSong(row)]);
  const [moods, segments, analyses, provenance, stats, credits, genres, merged] = await Promise.all([
    query('SELECT mood_id AS id, mood_name AS name, emoji, color_hex AS color, confidence FROM v_current_song_moods WHERE song_id = ? ORDER BY mood_rank', [songId]),
    query(`SELECT ms.segment_index AS idx, ms.start_sec AS start, ms.end_sec AS end, ms.energy, ms.valence, ms.confidence,
                  m.name AS mood, m.emoji, m.color_hex AS color
             FROM mood_segments ms JOIN moods m ON m.mood_id = ms.mood_id
             JOIN intelligence_models im ON im.model_id = ms.model_id AND im.is_active = 1
            WHERE ms.song_id = ? ORDER BY ms.segment_index`, [songId]),
    query(`SELECT af.feature_id, im.name AS model, im.version, af.analyzed_at, af.is_current, af.energy, af.valence, af.danceability,
                  af.acousticness, af.instrumentalness, af.speechiness, af.tempo_bpm, af.loudness_db
             FROM audio_features af JOIN intelligence_models im ON im.model_id = af.model_id
            WHERE af.song_id = ? ORDER BY af.analyzed_at DESC`, [songId]),
    query(`SELECT sr.external_id, sr.status, sr.match_method, sr.match_confidence, sr.quality_score, sr.rights_status,
                  sr.first_seen_at, sr.last_verified_at, sr.processing_version, ms.code AS source, ms.name AS source_name,
                  ms.license_name, ms.attribution_text, sr.source_url, JSON_UNQUOTE(JSON_EXTRACT(sr.payload, '$.title')) AS payload_title
             FROM source_records sr JOIN music_sources ms ON ms.source_id = sr.source_id
            WHERE sr.song_id = ? ORDER BY sr.first_seen_at`, [songId]),
    one('SELECT * FROM v_song_stats WHERE song_id = ?', [songId]),
    query(`SELECT a.artist_id AS id, a.name, sa.role FROM song_artists sa JOIN artists a ON a.artist_id = sa.artist_id
            WHERE sa.song_id = ? ORDER BY sa.role, sa.credit_order`, [songId]),
    query(`SELECT g.genre_id AS id, g.name, sg.is_primary AS isPrimary FROM song_genres sg JOIN genres g ON g.genre_id = sg.genre_id
            WHERE sg.song_id = ? ORDER BY sg.is_primary DESC`, [songId]),
    query('SELECT song_id, title FROM songs WHERE merged_into_song_id = ?', [songId]),
  ]);
  const videoLinks = provenance.filter((r) => r.source === 'YOUTUBE_DATA').map((r) => ({ videoId: r.external_id, url: r.source_url,
    title: r.payload_title || null, attribution: r.attribution_text }));
  return {
    ...song, moodsDetailed: moods, segments, analyses, provenance: provenance.filter((r) => r.source !== 'YOUTUBE_DATA'), credits, genres, videoLinks,
    mergedDuplicates: merged,
    stats: stats ? { plays: stats.plays, listeners: stats.listeners, completes: stats.completes, skips: stats.skips,
      replays: stats.replays, likes: stats.likes, avgRating: stats.avg_rating, ratingCount: stats.rating_count } : null,
  };
}

async function artistDetail(user, artistId) {
  const a = await one(
    `SELECT a.*, l.name AS language_name, r.name AS region_name, ap.plays_30d, ap.listeners_30d, ap.popularity_rank
       FROM artists a LEFT JOIN languages l ON l.language_id = a.primary_language_id
       LEFT JOIN regions r ON r.region_code = a.region_code
       LEFT JOIN v_artist_popularity ap ON ap.artist_id = a.artist_id
      WHERE a.artist_id = ?`, [artistId]);
  if (!a) throw ApiError.notFound('Artist');
  const [cf] = contentFilter(user);
  const songs = await query(
    `SELECT sc.* FROM v_song_catalog sc WHERE sc.status = 'ACTIVE' AND (sc.artist_id = ?
        OR sc.song_id IN (SELECT song_id FROM song_artists WHERE artist_id = ?))${cf}
      ORDER BY sc.popularity DESC`, [artistId, artistId]);
  const aliases = await query('SELECT alias, alias_type AS type FROM artist_aliases WHERE artist_id = ? ORDER BY alias_type, alias', [artistId]);
  return {
    id: a.artist_id, name: a.name, type: a.artist_type, country: a.country_code, region: a.region_name, language: a.language_name,
    formedYear: a.formed_year, bio: a.bio, aliases, popularity: { plays30d: a.plays_30d, listeners30d: a.listeners_30d, rank: a.popularity_rank },
    songs: await withUserFlags(user.id, songs.map(toSong)),
  };
}

/** Genre tree via a recursive CTE (path + depth), with per-genre statistics. */
async function genreTree() {
  return query(
    `WITH RECURSIVE tree AS (
       SELECT genre_id, name, parent_genre_id, color_hex, 0 AS depth, CAST(name AS CHAR(300)) AS path
         FROM genres WHERE parent_genre_id IS NULL
       UNION ALL
       SELECT g.genre_id, g.name, g.parent_genre_id, g.color_hex, t.depth + 1, CONCAT(t.path, ' › ', g.name)
         FROM genres g JOIN tree t ON g.parent_genre_id = t.genre_id
     )
     SELECT t.genre_id AS id, t.name, t.parent_genre_id AS parentId, t.color_hex AS color, t.depth, t.path,
            gs.songs, gs.plays, gs.avg_rating AS avgRating, gs.avg_energy AS avgEnergy
       FROM tree t JOIN v_genre_statistics gs ON gs.genre_id = t.genre_id
      ORDER BY t.path`);
}

async function moods() {
  return query(
    `SELECT m.mood_id AS id, m.name, m.emoji, m.color_hex AS color, m.description, mc.name AS category, mc.quadrant,
            m.target_energy AS energy, m.target_valence AS valence, m.tempo_min AS tempoMin, m.tempo_max AS tempoMax,
            (SELECT COUNT(*) FROM v_current_song_moods cm WHERE cm.mood_id = m.mood_id AND cm.confidence >= 0.5) AS songs
       FROM moods m JOIN mood_categories mc ON mc.category_id = m.category_id ORDER BY mc.category_id, m.mood_id`);
}

async function contexts() {
  return query(`SELECT context_id AS id, code, name, emoji, description FROM contexts ORDER BY sort_order`);
}

async function languages() {
  return query(`SELECT l.language_id AS id, l.iso_code AS iso, l.name, l.native_name AS nativeName, l.script,
                       (SELECT COUNT(*) FROM songs s WHERE s.language_id = l.language_id AND s.status = 'ACTIVE') AS songs
                  FROM languages l ORDER BY l.name`);
}

async function regions() {
  return query(`SELECT r.region_code AS code, r.name, r.country_code AS country, l.name AS primaryLanguage
                  FROM regions r LEFT JOIN languages l ON l.language_id = r.primary_language_id ORDER BY r.country_code = 'XX', r.name`);
}

/** Share of the query's letter pairs found in `text` (0–1). Filters ngram noise. */
function coverage(q, text) {
  const pairs = (t) => { const x = normalise(String(t || '')).replace(/\s+/g, ''); const out = new Set(); for (let i = 0; i < x.length - 1; i++) out.add(x.slice(i, i + 2)); return out; };
  const qp = pairs(q);
  if (!qp.size) return 0;
  const tp = pairs(text);
  let hit = 0;
  qp.forEach((p) => { if (tp.has(p)) hit += 1; });
  return hit / qp.size;
}
const FUZZY_MIN = 0.6;

/**
 * Search across songs, artists (incl. aliases and sound-alike names), albums,
 * moods, genres and languages. Uses ngram FULLTEXT indexes so partial and
 * slightly misspelled words still match ("venela" finds "Vennela").
 */
async function search(user, q) {
  const norm = normalise(q);
  if (norm.length < 2) throw ApiError.badRequest('Type at least 2 characters.');
  const like = `%${norm.replace(/[%_\\]/g, '\\$&')}%`;
  const prefix = `${norm.replace(/[%_\\]/g, '\\$&')}%`;
  const [cf] = contentFilter(user);

  const [artistsAll, moodsHit, genresHit, langs, albumsAll] = await Promise.all([
    query(
      `SELECT a.artist_id AS id, a.name, a.artist_type AS type, l.name AS language,
              MAX(GREATEST(MATCH(a.name) AGAINST (? IN NATURAL LANGUAGE MODE),
                           COALESCE(MATCH(al.alias) AGAINST (? IN NATURAL LANGUAGE MODE), 0))) AS relevance,
              MAX(a.normalized_name LIKE ? OR al.normalized_alias LIKE ?) AS prefix_hit,
              MAX(SOUNDEX(a.name) = SOUNDEX(?)) AS sounds_like,
              GROUP_CONCAT(DISTINCT CASE WHEN al.normalized_alias LIKE ? THEN al.alias END) AS matched_alias,
              GROUP_CONCAT(DISTINCT al.alias SEPARATOR '|') AS aliases
         FROM artists a
         LEFT JOIN artist_aliases al ON al.artist_id = a.artist_id
         LEFT JOIN languages l ON l.language_id = a.primary_language_id
        WHERE MATCH(a.name) AGAINST (? IN NATURAL LANGUAGE MODE)
           OR MATCH(al.alias) AGAINST (? IN NATURAL LANGUAGE MODE)
           OR a.normalized_name LIKE ? OR al.normalized_alias LIKE ?
           OR SOUNDEX(a.name) = SOUNDEX(?)
        GROUP BY a.artist_id, a.name, a.artist_type, l.name
        ORDER BY prefix_hit DESC, relevance DESC LIMIT 20`,
      [norm, norm, prefix, prefix, norm, like, norm, norm, like, like, norm]),
    query(`SELECT mood_id AS id, name, emoji, color_hex AS color, description FROM moods WHERE name LIKE ? OR description LIKE ? LIMIT 5`, [like, like]),
    query(`SELECT genre_id AS id, name, color_hex AS color FROM genres WHERE name LIKE ? LIMIT 5`, [like]),
    query(`SELECT language_id AS id, name, native_name AS nativeName FROM languages WHERE name LIKE ? OR native_name LIKE ? OR iso_code = ? LIMIT 3`, [like, like, norm]),
    query(`SELECT al.album_id AS id, al.title, al.album_type AS type, al.cover_color_1 AS c1, al.cover_color_2 AS c2, a.name AS artist
             FROM albums al JOIN album_artists aa ON aa.album_id = al.album_id AND aa.credit_order = 1
             JOIN artists a ON a.artist_id = aa.artist_id
            WHERE MATCH(al.title) AGAINST (? IN NATURAL LANGUAGE MODE) OR al.normalized_title LIKE ? LIMIT 20`, [norm, like]),
  ]);
  // ngram FULLTEXT matches any shared letter pair; keep only real hits:
  // substring, alias, sound-alike, or most of the query's letter pairs present.
  const artists = artistsAll.filter((a) => a.prefix_hit || a.matched_alias || a.sounds_like
    || normalise(a.name).includes(norm) || Math.max(coverage(norm, a.name), ...String(a.aliases || '').split('|').map((x) => coverage(norm, x))) >= FUZZY_MIN).slice(0, 8);
  const albums = albumsAll.filter((x) => normalise(x.title).includes(norm) || coverage(norm, x.title) >= FUZZY_MIN).slice(0, 6);

  const artistIds = artists.map((a) => a.id);
  const moodIds = moodsHit.map((m) => m.id);
  const genreIds = genresHit.map((g) => g.id);
  const langIds = langs.map((l) => l.id);
  const songRows = await query(
    `SELECT sc.*,
            MATCH(s.title) AGAINST (? IN NATURAL LANGUAGE MODE) * 2
          + (s.normalized_title LIKE ?) * 3
          + (sc.artist_id IN (?)) * 1.5
          + COALESCE((SELECT MAX(cm.confidence) FROM v_current_song_moods cm WHERE cm.song_id = sc.song_id AND cm.mood_id IN (?)), 0)
          + (sc.genre_id IN (?)) * 0.8 + (sc.language_id IN (?)) * 0.6 AS relevance,
            (s.normalized_title LIKE ?) AS by_like,
            (sc.artist_id IN (?) OR sc.genre_id IN (?) OR sc.language_id IN (?)
              OR EXISTS (SELECT 1 FROM v_current_song_moods cm WHERE cm.song_id = sc.song_id AND cm.mood_id IN (?) AND cm.confidence >= 0.6)
              OR sc.album_id IN (SELECT album_id FROM albums WHERE normalized_title LIKE ?)) AS by_other
       FROM v_song_catalog sc JOIN songs s ON s.song_id = sc.song_id
      WHERE sc.status = 'ACTIVE'${cf}
        AND ( MATCH(s.title) AGAINST (? IN NATURAL LANGUAGE MODE) OR s.normalized_title LIKE ?
              OR sc.artist_id IN (?) OR sc.genre_id IN (?) OR sc.language_id IN (?)
              OR EXISTS (SELECT 1 FROM v_current_song_moods cm WHERE cm.song_id = sc.song_id AND cm.mood_id IN (?) AND cm.confidence >= 0.6)
              OR sc.album_id IN (SELECT album_id FROM albums WHERE normalized_title LIKE ?) )
      ORDER BY relevance DESC, sc.popularity DESC LIMIT 60`,
    [norm, prefix, artistIds.length ? artistIds : [0], moodIds.length ? moodIds : [0], genreIds.length ? genreIds : [0],
      langIds.length ? langIds : [0],
      like, artistIds.length ? artistIds : [0], genreIds.length ? genreIds : [0], langIds.length ? langIds : [0], moodIds.length ? moodIds : [0], like,
      norm, like, artistIds.length ? artistIds : [0], genreIds.length ? genreIds : [0],
      langIds.length ? langIds : [0], moodIds.length ? moodIds : [0], like]);

  const songs = songRows.filter((r) => r.by_like || r.by_other || coverage(norm, r.title) >= FUZZY_MIN).slice(0, 24);
  const total = songs.length + artists.length + albums.length + moodsHit.length + genresHit.length + langs.length;
  if (!user.incognitoId) {
    await query('INSERT INTO search_history (user_id, query_text, normalized_query, result_count) VALUES (?, ?, ?, ?)',
      [user.id, q.slice(0, 120), norm.slice(0, 120), Math.min(total, 65535)]);
  }
  return {
    query: q, normalised: norm, total,
    songs: await withUserFlags(user.id, songs.map((r) => ({ ...toSong(r), relevance: Math.round(r.relevance * 100) / 100 }))),
    artists: artists.map((a) => ({ id: a.id, name: a.name, type: a.type, language: a.language, matchedAlias: a.matched_alias,
      soundsLike: !!a.sounds_like && !a.prefix_hit && a.relevance === 0 })),
    albums, moods: moodsHit, genres: genresHit, languages: langs,
  };
}

async function trending(user, { window = '7D', entity = 'SONG', region = null, limit = 12 }) {
  const rows = await query(
    `SELECT * FROM v_latest_trends WHERE window_code = ? AND entity_type = ? AND region_code <=> ?
      ORDER BY momentum_rank LIMIT ?`, [window, entity, region, limit]);
  if (entity !== 'SONG') return rows;
  const cat = rows.length ? await query('SELECT * FROM v_song_catalog WHERE song_id IN (?)', [rows.map((r) => r.entity_id)]) : [];
  const m = new Map(cat.map((c) => [c.song_id, c]));
  const [cfSql] = contentFilter(user);
  const filtered = rows.filter((r) => {
    const c = m.get(r.entity_id);
    if (!c || c.status !== 'ACTIVE') return false;
    if (cfSql && c.explicit) return false;
    if (user.contentFilter === 'FAMILY' && c.content_rating !== 'ALL') return false;
    return true;
  });
  const songs = await withUserFlags(user.id, filtered.map((r) => ({ ...toSong(m.get(r.entity_id)),
    trend: { plays: r.curr_plays, previous: r.prev_plays, listeners: r.curr_listeners, velocityPct: r.velocity_pct, rank: r.momentum_rank } })));
  return { computedAt: rows[0]?.computed_at || null, window, region, songs };
}

async function albumDetail(user, albumId) {
  const a = await one(
    `SELECT al.*, f.title AS film_title, l.name AS language_name FROM albums al
       LEFT JOIN films f ON f.film_id = al.film_id LEFT JOIN languages l ON l.language_id = al.language_id
      WHERE al.album_id = ?`, [albumId]);
  if (!a) throw ApiError.notFound('Album');
  const [cf] = contentFilter(user);
  const [artists, songs] = await Promise.all([
    query(`SELECT ar.artist_id AS id, ar.name FROM album_artists aa JOIN artists ar ON ar.artist_id = aa.artist_id
            WHERE aa.album_id = ? ORDER BY aa.credit_order`, [albumId]),
    query(`SELECT sc.*, s.track_number FROM v_song_catalog sc JOIN songs s ON s.song_id = sc.song_id
            WHERE sc.album_id = ? AND sc.status = 'ACTIVE'${cf} ORDER BY s.track_number, sc.song_id`, [albumId]),
  ]);
  return { id: a.album_id, title: a.title, type: a.album_type, releaseYear: a.release_year, film: a.film_title, filmId: a.film_id, language: a.language_name,
    cover: [a.cover_color_1, a.cover_color_2], artists,
    songs: await withUserFlags(user.id, songs.map((r) => ({ ...toSong(r), trackNumber: r.track_number }))) };
}

/**
 * Film page: the film, its soundtrack albums and songs, the composers credited on
 * them, and any film metadata imported from TMDB (with its required attribution).
 */
async function filmDetail(user, filmId) {
  const f = await one(
    `SELECT f.film_id, f.title, f.release_year, l.language_id, l.name AS language_name
       FROM films f JOIN languages l ON l.language_id = f.language_id WHERE f.film_id = ?`, [filmId]);
  if (!f) throw ApiError.notFound('Film');
  const [cf] = contentFilter(user);
  const [albums, songs, composers, tmdb] = await Promise.all([
    query(`SELECT album_id AS id, title, album_type AS type, release_year AS releaseYear, cover_color_1 AS c1, cover_color_2 AS c2
             FROM albums WHERE film_id = ? ORDER BY release_year, album_id`, [filmId]),
    query(`SELECT sc.*, s.track_number FROM v_song_catalog sc JOIN songs s ON s.song_id = sc.song_id
            WHERE sc.film_id = ? AND sc.status = 'ACTIVE'${cf} ORDER BY sc.album_id, s.track_number, sc.song_id`, [filmId]),
    query(`SELECT DISTINCT a.artist_id AS id, a.name FROM albums al JOIN songs s ON s.album_id = al.album_id
             JOIN song_artists sa ON sa.song_id = s.song_id AND sa.role = 'COMPOSER' JOIN artists a ON a.artist_id = sa.artist_id
            WHERE al.film_id = ?
            UNION
           SELECT DISTINCT a.artist_id, a.name FROM albums al JOIN album_artists aa ON aa.album_id = al.album_id
             JOIN artists a ON a.artist_id = aa.artist_id AND a.artist_type = 'COMPOSER' WHERE al.film_id = ?`, [filmId, filmId]),
    one(`SELECT sr.external_id, sr.source_url, sr.payload, sr.last_verified_at, ms.attribution_text
           FROM source_records sr JOIN music_sources ms ON ms.source_id = sr.source_id
          WHERE sr.film_id = ? AND ms.code = 'TMDB' AND sr.entity_type = 'FILM' ORDER BY sr.last_verified_at DESC LIMIT 1`, [filmId]),
  ]);
  const payload = tmdb ? (typeof tmdb.payload === 'string' ? JSON.parse(tmdb.payload) : tmdb.payload) : null;
  return {
    id: f.film_id, title: f.title, releaseYear: f.release_year, language: { id: f.language_id, name: f.language_name },
    albums, composers,
    songs: await withUserFlags(user.id, songs.map((r) => ({ ...toSong(r), trackNumber: r.track_number }))),
    external: tmdb ? { source: 'TMDB', id: tmdb.external_id, url: tmdb.source_url, overview: payload.overview || null,
      originalTitle: payload.originalTitle || null, releaseDate: payload.releaseDate || null,
      attribution: tmdb.attribution_text, importedAt: tmdb.last_verified_at } : null,
  };
}

/** Regional / language page: what MUSE has in one language. */
async function languageDetail(user, languageId) {
  const l = await one('SELECT language_id, iso_code, name, native_name, script FROM languages WHERE language_id = ?', [languageId]);
  if (!l) throw ApiError.notFound('Language');
  const [cf] = contentFilter(user);
  const [regions, artists, films, songs, total] = await Promise.all([
    query('SELECT region_code AS code, name FROM regions WHERE primary_language_id = ? ORDER BY name', [languageId]),
    query(`SELECT a.artist_id AS id, a.name, a.artist_type AS type, COUNT(s.song_id) AS songs
             FROM artists a LEFT JOIN songs s ON s.primary_artist_id = a.artist_id AND s.status = 'ACTIVE'
            WHERE a.primary_language_id = ? GROUP BY a.artist_id, a.name, a.artist_type ORDER BY songs DESC, a.name LIMIT 12`, [languageId]),
    query('SELECT film_id AS id, title, release_year AS releaseYear FROM films WHERE language_id = ? ORDER BY release_year DESC', [languageId]),
    query(`SELECT sc.* FROM v_song_catalog sc WHERE sc.language_id = ? AND sc.status = 'ACTIVE'${cf}
            ORDER BY sc.popularity DESC, sc.song_id LIMIT 24`, [languageId]),
    one(`SELECT COUNT(*) AS n FROM songs WHERE language_id = ? AND status = 'ACTIVE'`, [languageId]),
  ]);
  return {
    id: l.language_id, iso: l.iso_code, name: l.name, nativeName: l.native_name, script: l.script, totalSongs: total.n,
    regions, artists, films, songs: await withUserFlags(user.id, songs.map(toSong)),
  };
}

module.exports = { filmDetail, languageDetail, albumDetail, listSongs, songDetail, artistDetail, genreTree, moods, contexts, languages, regions, search, trending, contentFilter };

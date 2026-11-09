// Turns v_song_catalog rows into the JSON shape the frontend uses.
const { query } = require('../config/db');

const KEYS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

function toSong(r) {
  if (!r) return null;
  return {
    id: r.song_id,
    title: r.title,
    version: r.version_label || null,
    status: r.status,
    durationSec: r.duration_sec,
    releaseYear: r.release_year,
    explicit: !!r.explicit,
    contentRating: r.content_rating,
    popularity: r.popularity,
    isrc: r.isrc,
    artist: { id: r.artist_id, name: r.artist_name },
    album: r.album_id ? { id: r.album_id, title: r.album_title, type: r.album_type, film: r.film_title || null, filmId: r.film_id || null } : null,
    language: { id: r.language_id, name: r.language_name },
    genre: r.genre_id ? { id: r.genre_id, name: r.genre_name, color: r.genre_color } : null,
    cover: [r.cover_color_1, r.cover_color_2],
    moods: r.mood_tags ? r.mood_tags.split(',') : [],
    features: r.energy === null || r.energy === undefined ? null : {
      energy: r.energy, valence: r.valence, danceability: r.danceability, acousticness: r.acousticness,
      instrumentalness: r.instrumentalness, speechiness: r.speechiness, loudness: r.loudness_db, tempo: r.tempo_bpm,
      key: r.musical_key, mode: r.mode, keyName: r.musical_key === null ? null : `${KEYS[r.musical_key]} ${r.mode ? 'major' : 'minor'}`,
      analysisVersion: r.analysis_version,
    },
    // what can play it right now (see mediaService); metadata-only songs are shown but cannot be played
    playback: r.playable === undefined ? undefined : {
      playable: !!r.playable,
      type: r.playback_type || null,
      source: r.playback_source || null,
      demo: r.playback_type === 'GENERATED_SKETCH',
    },
    liked: r.liked === undefined ? undefined : !!r.liked,
    myRating: r.my_rating === undefined ? undefined : r.my_rating,
  };
}

/** Adds liked / myRating for one user to a list of mapped songs (one query). */
async function withUserFlags(userId, songs) {
  if (!songs.length) return songs;
  const ids = songs.map((s) => s.id);
  const rows = await query(
    `SELECT s.song_id,
            EXISTS (SELECT 1 FROM user_likes ul WHERE ul.user_id = ? AND ul.song_id = s.song_id) AS liked,
            (SELECT rating FROM ratings r WHERE r.user_id = ? AND r.song_id = s.song_id) AS my_rating
       FROM songs s WHERE s.song_id IN (?)`, [userId, userId, ids]);
  const m = new Map(rows.map((r) => [r.song_id, r]));
  return songs.map((s) => ({ ...s, liked: !!m.get(s.id)?.liked, myRating: m.get(s.id)?.my_rating ?? null }));
}

async function catalogRows(ids) {
  if (!ids.length) return [];
  const rows = await query('SELECT * FROM v_song_catalog WHERE song_id IN (?)', [ids]);
  const m = new Map(rows.map((r) => [r.song_id, r]));
  return ids.map((id) => m.get(id)).filter(Boolean);
}

module.exports = { toSong, withUserFlags, catalogRows };

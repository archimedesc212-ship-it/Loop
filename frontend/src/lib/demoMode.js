import { diaryDateKey, upsertDiaryEntry, removeDiaryEntry } from './moodDiary';
import { recommendByFeatureCentroid } from './spotifySimilarity';
import { regionalSeeds } from './regionalSeeds';
// Static, dataset-backed catalogue adapter. No invented songs, play counts or audio.
const DATA_PATH = String(import.meta.env.BASE_URL || '/').replace(/\/?$/, '/') + 'data/music-catalog.json';
const STORAGE_PREFIX = 'loop.catalog.v1.';
const GENRE_COLORS = {
  pop: ['#9B7199', '#D9A7C7'],
  country: ['#806B50', '#D1A66D'],
  blues: ['#334B75', '#8199C4'],
  jazz: ['#4B466B', '#B39ABF'],
  reggae: ['#315F50', '#90B49A'],
  rock: ['#4B3E46', '#B7777A'],
  'hip hop': ['#424B5A', '#9DA9BB'],
};
const MOODS = [
  { id: 1, name: 'Sad', emoji: '🌧️', color: '#7D91B8', topics: ['sadness'] },
  { id: 2, name: 'Romantic', emoji: '♡', color: '#D98BA7', topics: ['romantic'] },
  { id: 3, name: 'Dreamy', emoji: '☾', color: '#9D8BC7', topics: ['night/time'] },
  { id: 4, name: 'Reflective', emoji: '✦', color: '#B49ACB', topics: ['world/life'] },
  { id: 5, name: 'Intense', emoji: '⚡', color: '#E58B58', topics: ['violence', 'obscene'] },
  { id: 6, name: 'Focused', emoji: '◉', color: '#8C9DB8', topics: ['music'] },
  { id: 7, name: 'Emotional', emoji: '♡', color: '#C58CA5', topics: ['feelings'] },
  { id: 8, name: 'Energetic', emoji: '↗', color: '#E9A35D', topics: [] },
  { id: 9, name: 'Calm', emoji: '🌿', color: '#78A99A', topics: [] },
  { id: 10, name: 'Uplifting', emoji: '☀️', color: '#E9B95D', topics: [] },
];
const MOOD_BY_TOPIC = new Map(MOODS.flatMap((mood) => mood.topics.map((topic) => [topic, mood])));
const CONTEXTS = [
  { code: 'STUDY', name: 'Study', emoji: '📚', description: 'Lower energy, steady and acoustic', energy: 0.32, valence: 0.5 },
  { code: 'WORKOUT', name: 'Workout', emoji: '⚡', description: 'Higher energy and danceability', energy: 0.82, valence: 0.72 },
  { code: 'RELAX', name: 'Relax', emoji: '🌿', description: 'Gentler, more acoustic sounds', energy: 0.25, valence: 0.5 },
  { code: 'NIGHT', name: 'Late night', emoji: '☾', description: 'Lower energy and softer moods', energy: 0.3, valence: 0.42 },
  { code: 'TRAVEL', name: 'Road trip', emoji: '↗', description: 'Steady energy and bright sounds', energy: 0.68, valence: 0.68 },
];
const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(STORAGE_PREFIX + key)) ?? fallback; } catch { return fallback; }
};
const write = (key, value) => {
  try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value)); } catch { /* local persistence is optional */ }
};
const safeLimit = (value, fallback = 24, max = 100) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.floor(n)) : fallback;
};
const norm = (value) => String(value || '').normalize('NFKD').toLowerCase()
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
let cataloguePromise = null;
let playId = 1;

function inferredMoods(record) {
  const topicMood = MOOD_BY_TOPIC.get(record.topic);
  const list = topicMood ? [topicMood] : [];
  if (record.energy >= 0.72 && record.valence >= 0.58) list.push(MOODS[7]);
  if (record.energy <= 0.34) list.push(MOODS[8]);
  if (record.valence >= 0.76 && record.energy > 0.42) list.push(MOODS[9]);
  if (record.valence <= 0.3 && record.energy < 0.58) list.push(MOODS[0]);
  return [...new Map(list.map((mood) => [mood.id, mood])).values()].slice(0, 3);
}

function makeCatalogue(payload) {
  if (!payload || payload.schemaVersion !== 1 || !Array.isArray(payload.records)
      || payload.records.length < 1 || payload.source?.recordCount !== payload.records.length
      || !Array.isArray(payload.artists) || !Array.isArray(payload.genres)) {
    throw new Error('The music catalogue is missing or incomplete. Reload LOOP to retry the verified dataset.');
  }
  const artists = new Map(payload.artists.map((row) => [Number(row[0]), row[1]]));
  const genres = new Map(payload.genres.map((row) => [Number(row[0]), row[1]]));
  const songs = payload.records.map((row) => {
    const id = Number(row[0]);
    const artistId = Number(row[1]);
    const title = String(row[2] || '');
    const releaseYear = Number(row[3]);
    const genreId = Number(row[4]);
    const topic = String(row[5] || '');
    const genreName = genres.get(genreId) || 'Unknown';
    const artistName = artists.get(artistId) || 'Unknown artist';
    const features = {
      energy: Number(row[6]),
      valence: Number(row[7]),
      danceability: Number(row[8]),
      acousticness: Number(row[9]),
      instrumentalness: Number(row[10]),
      loudnessIndex: Number(row[11]),
    };
    const topicScores = Array.isArray(row[12]) ? row[12].map((item) => ({ topic: item[0], score: Number(item[1]) })) : [];
    const moods = inferredMoods({ topic, ...features });
    const palette = GENRE_COLORS[genreName] || ['#344052', '#91A1B6'];
    const genre = { id: genreId, name: genreName, color: palette[1] };
    const record = {
      id, title, releaseYear, explicit: null, durationSec: null,
      artist: { id: artistId, name: artistName },
      album: null, language: null, genre, genres: [genre],
      cover: palette, coverColor1: palette[0], coverColor2: palette[1],
      playback: { playable: true, type: 'YOUTUBE_LOOKUP', source: 'YOUTUBE_DATA' },
      features, topic, topicScores,
      moods: moods.map((mood) => mood.name),
      moodsDetailed: moods.map((mood) => ({
        id: mood.id, name: mood.name, emoji: mood.emoji, color: mood.color,
        confidence: topicMoodConfidence(topicScores, mood.topics),
      })),
      reasons: [{ code: 'SOURCE_TOPIC', text: 'Dataset topic: ' + topic }],
      credits: [], segments: [], analyses: [], provenance: [], mergedDuplicates: [], videoLinks: [],
      liked: false, myRating: null,
      recordingSearchUrl: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(artistName + ' ' + title + ' official audio'),
    };
    return record;
  });
  // Curated multilingual starter catalogue; metadata only, playback via official-provider search.
  const regionalSongs = regionalSeeds.map((item) => {
    const artistId = 900000 + item.id;
    const genreId = 990000 + item.id;
    const palette = ['#26384A', '#83A8C9'];
    const genre = { id: genreId, name: item.genre, color: palette[1] };
    const features = { energy: 0.62, valence: 0.62, danceability: 0.62, acousticness: 0.35, instrumentalness: 0.05, loudnessIndex: 0.65 };
    const moods = inferredMoods({ ...features, topic: 'music' });
    return {
      id: item.id, title: item.title, releaseYear: item.year, explicit: null, durationSec: null,
      artist: { id: artistId, name: item.artist }, album: null, language: item.language,
      genre, genres: [genre], cover: palette, coverColor1: palette[0], coverColor2: palette[1],
      playback: { playable: true, type: 'YOUTUBE_LOOKUP', source: 'OFFICIAL_PROVIDER_SEARCH' },
      features, topic: 'music', topicScores: [], moods: moods.map((mood) => mood.name),
      moodsDetailed: moods.map((mood) => ({ id: mood.id, name: mood.name, emoji: mood.emoji, color: mood.color, confidence: 0.5 })),
      reasons: [{ code: 'REGIONAL_STARTER', text: `${item.language} music starter collection` }],
      credits: [], segments: [], analyses: [], provenance: [], mergedDuplicates: [], videoLinks: [],
      liked: false, myRating: null,
      recordingSearchUrl: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(item.artist + ' ' + item.title + ' official audio'),
    };
  });
  for (const song of regionalSongs) if (!songById.has(song.id)) { songs.push(song); songById.set(song.id, song); }
  const artistSongs = new Map();
  const songById = new Map();
  const genreCounts = new Map();
  const artistCounts = new Map();
  for (const song of songs) {
    if (!artistSongs.has(song.artist.id)) artistSongs.set(song.artist.id, []);
    artistSongs.get(song.artist.id).push(song);
    songById.set(song.id, song);
    genreCounts.set(song.genre.id, (genreCounts.get(song.genre.id) || 0) + 1);
    artistCounts.set(song.artist.id, (artistCounts.get(song.artist.id) || 0) + 1);
  }
  const genreList = payload.genres.map(([id, name]) => ({
    id: Number(id), name, color: (GENRE_COLORS[name] || ['#344052', '#91A1B6'])[1], songs: genreCounts.get(Number(id)) || 0,
  })).sort((a, b) => b.songs - a.songs);
  const artistList = payload.artists.map(([id, name]) => ({ id: Number(id), name, type: 'ARTIST', songCount: artistCounts.get(Number(id)) || 0 }));
  return {
    songs, songById, artistSongs, artists: artistList, genres: genreList,
    artistById: new Map(artistList.map((artist) => [artist.id, artist])),
    source: payload.source,
  };
}

function topicMoodConfidence(scores, topics) {
  if (!topics || !topics.length || !scores.length) return 0.5;
  const match = scores.find((item) => topics.includes(item.topic));
  return match ? Math.max(0, Math.min(1, match.score)) : 0.5;
}

async function loadCatalogue() {
  if (!cataloguePromise) {
    cataloguePromise = fetch(DATA_PATH, { cache: 'force-cache' })
      .then((response) => {
        if (!response.ok) throw new Error('Music catalogue request failed (' + response.status + ').');
        return response.json();
      })
      .then(makeCatalogue)
      .catch((error) => {
        cataloguePromise = null;
        throw error;
      });
  }
  return cataloguePromise;
}
export const resetCatalogueCacheForTests = () => { cataloguePromise = null; };

function withPersonalState(song) {
  const liked = read('likes', []);
  const ratings = read('ratings', {});
  return { ...song, liked: liked.includes(song.id), myRating: ratings[song.id] ?? null };
}
function diversify(rows, limit) {
  const out = [];
  const artistCounts = new Map();
  const genreCounts = new Map();
  for (const song of rows) {
    const artistCount = artistCounts.get(song.artist.id) || 0;
    const genreCount = genreCounts.get(song.genre.id) || 0;
    if (artistCount >= 2 || genreCount >= Math.ceil(limit * 0.45)) continue;
    out.push(song);
    artistCounts.set(song.artist.id, artistCount + 1);
    genreCounts.set(song.genre.id, genreCount + 1);
    if (out.length >= limit) break;
  }
  if (out.length < limit) {
    const seen = new Set(out.map((song) => song.id));
    for (const song of rows) {
      if (seen.has(song.id)) continue;
      out.push(song);
      if (out.length >= limit) break;
    }
  }
  return out;
}
function scoreFor(song, target) {
  let score = 0;
  if (target.energy !== undefined) score += 1 - Math.abs(song.features.energy - target.energy);
  if (target.valence !== undefined) score += 1 - Math.abs(song.features.valence - target.valence);
  if (target.danceability !== undefined) score += 1 - Math.abs(song.features.danceability - target.danceability);
  if (target.acousticness !== undefined) score += 1 - Math.abs(song.features.acousticness - target.acousticness);
  if (target.topic && song.topic === target.topic) score += 1.5;
  if (target.genre && song.genre.name === target.genre) score += 1.5;
  if (target.moods && target.moods.length) {
    const overlap = target.moods.filter((mood) => song.moods.includes(mood)).length;
    score += overlap * 1.2;
  }
  return score;
}
function reasonFor(song) {
  return [{ code: 'DATASET_FEATURES', text: 'Dataset topic: ' + song.topic + ' · energy ' + Math.round(song.features.energy * 100) + '/100' }];
}
function listResult(songs, title, subtitle) {
  return {
    songs: songs.map((song) => ({ ...withPersonalState(song), reasons: reasonFor(song) })),
    batchId: null, title, subtitle, total: songs.length, empty: songs.length === 0,
  };
}
function getSong(catalogue, id) {
  const song = catalogue.songById.get(Number(id));
  return song ? withPersonalState(song) : null;
}
function choose(catalogue, target, limit, candidates = catalogue.songs) {
  const rows = candidates.map((song) => ({ song, score: scoreFor(song, target) }))
    .sort((a, b) => b.score - a.score || a.song.id - b.song.id)
    .map((item) => item.song);
  return diversify(rows, limit);
}
const TEXT_MOOD_KEYWORDS = [
  { id: 1, words: ['sad', 'sadness', 'heartbroken', 'down', 'blue', 'rough'] },
  { id: 2, words: ['romantic', 'romance', 'love', 'date', 'intimate'] },
  { id: 3, words: ['dreamy', 'dream', 'night', 'sleep', 'late'] },
  { id: 4, words: ['reflective', 'nostalgic', 'memories', 'thoughtful'] },
  { id: 5, words: ['intense', 'angry', 'aggressive', 'powerful'] },
  { id: 6, words: ['focus', 'focused', 'study', 'studying', 'work', 'concentrate'] },
  { id: 7, words: ['emotional', 'feelings', 'sensitive'] },
  { id: 8, words: ['energetic', 'energy', 'workout', 'gym', 'hype', 'dance', 'running'] },
  { id: 9, words: ['calm', 'peaceful', 'relaxed', 'relax', 'gentle', 'soft', 'quiet'] },
  { id: 10, words: ['happy', 'happier', 'positive', 'uplifting', 'cheerful', 'bright', 'motivation', 'motivational'] },
];
function getMoodSelection(body) {
  const ids = Array.isArray(body && body.moodIds) ? body.moodIds.map(Number) : [];
  const text = norm(body && body.text);
  const words = text.split(' ').filter(Boolean);
  const detected = TEXT_MOOD_KEYWORDS.filter((entry) => entry.words.some((word) => words.includes(word))).map((entry) => entry.id);
  const selected = MOODS.filter((mood) => ids.includes(mood.id) || detected.includes(mood.id));
  const target = { moods: selected.map((mood) => mood.name) };
  const stopWords = new Set(['i', 'need', 'something', 'for', 'the', 'a', 'an', 'with', 'want', 'some', 'to', 'my', 'me', 'please', 'music', 'song', 'songs', 'and', 'or', 'of']);
  const contentWords = words.filter((word) => !stopWords.has(word) && !TEXT_MOOD_KEYWORDS.some((entry) => entry.words.includes(word)));
  const textMatch = (song) => {
    if (!text) return true;
    const moodHit = selected.some((mood) => song.moods.includes(mood.name));
    const haystack = norm([song.title, song.artist.name, song.genre.name, song.topic].join(' '));
    const titleHit = contentWords.length > 0 && contentWords.every((word) => haystack.includes(word));
    return moodHit || titleHit || (!selected.length && !contentWords.length);
  };
  return { selected, text, target, textMatch };
}
function getPlaylistSongs(catalogue, ids) {
  return (Array.isArray(ids) ? ids : []).map((id) => getSong(catalogue, id)).filter(Boolean);
}
function localMoodRatings(song, ratings) {
  const mine = ratings[String(song.id)] || {};
  const moods = MOODS.map((mood) => {
    const ai = song.moodsDetailed.find((item) => item.id === mood.id);
    return {
      id: mood.id, name: mood.name, emoji: mood.emoji, color: mood.color,
      aiConfidence: ai ? ai.confidence : null,
      community: null,
      mine: mine[mood.id] === undefined ? null : { matchPercentage: mine[mood.id] },
    };
  });
  const set = Object.values(mine);
  return { moods, privateSession: read('incognito', false), totals: { ratings: set.length, raters: set.length ? 1 : 0 } };
}
function archiveWorld(catalogue) {
  const songs = choose(catalogue, { energy: 0.56, valence: 0.56, danceability: 0.55 }, 18);
  const topTopics = new Map();
  for (const song of catalogue.songs) topTopics.set(song.topic, (topTopics.get(song.topic) || 0) + 1);
  const mostCommon = [...topTopics.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  return {
    world: {
      id: 1, title: 'Music across 1950–2019',
      description: 'A collection built from the 28,372 real track records in the uploaded dataset.',
      theme: { palette: ['#182333', '#374D68', '#C8A76E'], motif: 'WAVES', seed: 19502019 },
      songCount: catalogue.songs.length, totalDurationSec: null, archetype: { name: 'THE MUSIC ARCHIVE' },
      version: 1, batchId: null, feedback: null,
      weekStart: '1950-01-01', generatedAt: '2019-12-31', expiresAt: '2019-12-31',
      signals: {
        topMoods: mostCommon.map(([topic, count]) => ({ mood: topic, blended: count / catalogue.songs.length })),
        archetypeScores: [], regionalTrendingMoods: [], feedback: [], language: null,
      },
    },
    songs: songs.map(withPersonalState), versions: [], history: [],
  };
}

export async function demoRequest(method, path, body) {
  const p = path.split('?')[0];
  const q = new URLSearchParams(path.split('?')[1] || '');
  const user = {
    id: 1, username: 'listener', displayName: 'Music listener', email: 'listener@loop.local',
    roleName: 'Listener', role: 'LISTENER', onboarded: true, permissions: [], incognito: read('incognito', false),
    regionCode: null, region: null, languages: [], contentFilter: 'OFF', listeningHabit: 'MIXED',
  };
  if (p === '/auth/session' || p === '/auth/me') return { authenticated: true, ...user, session: { id: 'local-catalogue', expiresAt: null } };
  if (p === '/auth/logout' || p === '/auth/logout-all') { write('incognito', false); return { ok: true }; }
  if (p === '/incognito') {
    if (method === 'POST') write('incognito', true);
    if (method === 'DELETE') write('incognito', false);
    const active = read('incognito', false);
    return { active, startedAt: active ? new Date().toISOString() : null, secondsLeft: 7200, events: 0, memory: [], recentSongs: [], purged: { events: 0, lists: 0 } };
  }

  const catalogue = await loadCatalogue();
  const all = catalogue.songs;
  if (p === '/moods') return MOODS.map((mood) => ({ ...mood, description: 'Estimated from the dataset topic and audio features.' }));
  if (p === '/genres') return catalogue.genres;
  if (p === '/contexts') return CONTEXTS;
  if (p === '/languages') return [...new Set(all.map((song) => song.language).filter(Boolean))].map((name, index) => ({ id: index + 1, name, nativeName: name, iso: name === 'Telugu' ? 'te' : name === 'Hindi' ? 'hi' : 'ta', script: name === 'Telugu' ? 'Telugu' : name === 'Hindi' ? 'Devanagari' : 'Tamil', totalSongs: all.filter((song) => song.language === name).length, songCount: all.filter((song) => song.language === name).length }));
  if (/^\/languages\/\d+$/.test(p)) {
    const languages = [...new Set(all.map((song) => song.language).filter(Boolean))];
    const name = languages[Number(p.split('/').pop()) - 1];
    if (!name) return { notAvailable: true, message: 'This language is not in the local starter catalogue yet.' };
    const songs = all.filter((song) => song.language === name).map(withPersonalState);
    return { id: Number(p.split('/').pop()), name, nativeName: name, iso: name === 'Telugu' ? 'te' : name === 'Hindi' ? 'hi' : 'ta', script: name === 'Telugu' ? 'Telugu' : name === 'Hindi' ? 'Devanagari' : 'Tamil', totalSongs: songs.length, songs, artists: [...new Map(songs.map((song) => [song.artist.id, song.artist])).values()], films: [], regions: [] };
  }
  if (p === '/regions') return [];
  if (p === '/songs' || p === '/trending') {
    const limit = safeLimit(q.get('limit'), 24, 100);
    const rows = p === '/trending'
      ? choose(catalogue, { energy: 0.62, valence: 0.62, danceability: 0.6 }, limit)
      : all.slice(0, limit);
    return listResult(rows, 'From the music archive', 'Real catalogue records from the uploaded 1950–2019 dataset.');
  }
  if (p === '/recommendations/discovery') {
    const limit = safeLimit(q.get('limit'), 24, 100);
    const requestedIntensity = q.get('intensity');
    const rawIntensity = requestedIntensity === null ? 50 : Number(requestedIntensity);
    const intensity = Number.isFinite(rawIntensity) ? Math.max(0, Math.min(100, rawIntensity)) : 50;
    const base = { energy: 0.56, valence: 0.56, danceability: 0.55, acousticness: 0.45, instrumentalness: 0.25 };
    const target = Object.fromEntries(Object.entries(base).map(([key, value]) => [key, value + ((1 - value) - value) * intensity / 100]));
    const rows = choose(catalogue, target, limit, all);
    return { ...listResult(rows, 'Discovery', `Metadata archive matches · ${intensity}% unexpected. This archive has no real playback history.`), discoveryIntensity: intensity };
  }
  if (p === '/recommendations/daily' || p === '/recommendations/similar') {
    const limit = safeLimit(q.get('limit'), 24, 100);
    const seedId = Number(q.get('seed'));
    const seed = Number.isFinite(seedId) && seedId > 0 ? catalogue.songById.get(seedId) : null;
    const storedLikes = read('likes', []);
    const likedSeeds = (Array.isArray(storedLikes) ? storedLikes : []).map((id) => catalogue.songById.get(Number(id))).filter(Boolean).slice(-5);
    const seeds = seed ? [seed] : (p === '/recommendations/daily' ? likedSeeds : []);
    const notebookRanked = seeds.length
      ? recommendByFeatureCentroid(all, seeds, Math.min(100, limit * 3)).map((entry) => entry.song)
      : [];
    const rows = notebookRanked.length
      ? notebookRanked.slice(0, limit)
      : choose(catalogue, seed ? seed.features : { energy: 0.56, valence: 0.56, danceability: 0.55 }, limit,
        seed ? all.filter((song) => song.id !== seed.id) : all);
    const sourceNote = notebookRanked.length
      ? 'Spotify notebook method: standardised audio-feature centroid with cosine-distance ranking. Uses available LOOP features only.'
      : 'Ranked using available archive audio features and topic labels; no liked-song seed was available.';
    return { ...listResult(rows, seed ? 'Similar sound' : 'Made for you', sourceNote), seed: seed ? withPersonalState(seed) : null, algorithm: notebookRanked.length ? 'NOTEBOOK_COSINE_CENTROID' : 'FEATURE_MATCH' };
  }
  if (p === '/recommendations/regional') {
    const languageId = Number(q.get('languageId'));
    const languages = [...new Set(all.map((song) => song.language).filter(Boolean))];
    const language = languages[languageId - 1] || q.get('language') || 'Telugu';
    const rows = all.filter((song) => song.language === language);
    return listResult(rows, `${language} songs`, `Curated ${language} starter collection. Playback opens official-provider search results.`);
  }
  if (p === '/recommendations/recovery') {
    const stages = [
      { title: 'Quiet', target: { energy: 0.24, valence: 0.38, acousticness: 0.7 } },
      { title: 'Steady', target: { energy: 0.5, valence: 0.55, danceability: 0.5 } },
      { title: 'Bright', target: { energy: 0.78, valence: 0.8, danceability: 0.72 } },
    ];
    return {
      title: 'A journey through the archive', subtitle: 'Three real-record selections ordered by audio features',
      stages: stages.map((stage, i) => ({
        batchId: null, title: stage.title, interpretation: { summary: [{ label: 'Selection', value: stage.title }] },
        songs: choose(catalogue, stage.target, 6).map(withPersonalState),
      })),
    };
  }
  if (p.startsWith('/recommendations/context/')) {
    const code = p.split('/').pop();
    const context = CONTEXTS.find((item) => item.code === code);
    if (!context) return { empty: true, message: 'Unknown listening mode.' };
    return listResult(choose(catalogue, context, safeLimit(q.get('limit'), 20, 100)), context.name + ' selection', context.description + ' · matched against dataset audio features.');
  }
  if (/^\/recommendations\/batches\/\d+$/.test(p)) return { empty: true, message: 'Saved recommendation batches are not available in this local archive. Choose a new archive selection instead.' };
  if (p === '/recommendations/mood') {
    const { selected, target: moodTarget, textMatch } = getMoodSelection(body || {});
    const selectedContext = CONTEXTS.find((item) => item.code === (body && body.contextCode));
    const target = selectedContext ? { ...moodTarget, ...selectedContext } : moodTarget;
    const candidates = all.filter((song) => (!selected.length || selected.some((mood) => song.moods.includes(mood.name))) && textMatch(song));
    const rows = choose(catalogue, target, safeLimit(body && body.limit, 24, 60), candidates);
    const matchedMoods = selected.length ? selected : (rows[0] ? rows[0].moodsDetailed.slice(0, 2).map((item) => MOODS.find((mood) => mood.id === item.id)).filter(Boolean) : []);
    return {
      ...listResult(rows, 'Matches from the music archive', 'Mood labels are estimates derived from dataset topics and audio features.'),
      interpretation: {
        moods: matchedMoods.map((mood) => ({ ...mood, confidence: 0.5, weight: 0.5 })),
        summary: [
          { label: 'Energy', score: null, value: 'Compared with dataset audio features' },
          { label: 'Mood', score: null, value: 'Estimated from topic labels and features' },
        ],
        parse: { matches: [], source: 'DATASET' },
      },
      explanation: 'No language, lyric or recording metadata is inferred.',
    };
  }
  if (p === '/recommendations/parse') {
    const selected = getMoodSelection({ text: body && body.text });
    const rows = choose(catalogue, selected.target, 8, all.filter(selected.textMatch));
    return { moods: rows[0] ? rows[0].moodsDetailed.slice(0, 2) : [], confidence: 0.5 };
  }
  if (p === '/worlds/current') return archiveWorld(catalogue);
  if (p === '/history' || p === '/me/sessions') return [];
  if (p === '/likes') return all.filter((song) => read('likes', []).includes(song.id)).map(withPersonalState);
  if (p === '/me/dismissals') return getPlaylistSongs(catalogue, read('dismissals', []));
  if (p === '/me/onboarding') return { languages: [], regions: [], genres: catalogue.genres, moods: MOODS };
  if (p === '/me/mood-diary' && method === 'GET') {
    const days = safeLimit(q.get('days'), 90, 365);
    const anchor = q.get('asOfDate') || diaryDateKey();
    const cutoff = new Date(`${anchor}T12:00:00`); cutoff.setDate(cutoff.getDate() - days);
    const cutoffKey = diaryDateKey(cutoff);
    return read('moodDiary', []).filter((entry) => entry.checkinDate >= cutoffKey).sort((a, b) => b.checkinDate.localeCompare(a.checkinDate));
  }
  if (p === '/me/mood-diary/today' && method === 'PUT') {
    const now = new Date();
    const checkinDate = body?.checkinDate || diaryDateKey(now);
    const rows = read('moodDiary', []);
    const previous = rows.find((entry) => entry.checkinDate === checkinDate);
    const mood = MOODS.find((item) => item.id === Number(body?.moodId));
    const entry = {
      entryId: previous?.entryId || Date.now(), checkinDate,
      moodId: body?.moodId === undefined ? previous?.moodId || null : Number(body.moodId),
      moodName: body?.moodId === undefined ? previous?.moodName || null : mood?.name || null,
      moodEmoji: body?.moodId === undefined ? previous?.moodEmoji || null : mood?.emoji || null,
      moodColor: body?.moodId === undefined ? previous?.moodColor || null : mood?.color || null,
      note: body?.note === undefined ? previous?.note || null : String(body.note).trim() || null,
      createdAt: previous?.createdAt || now.toISOString(), updatedAt: now.toISOString(),
    };
    if (!entry.moodId && !entry.note) return { error: { code: 'VALIDATION_ERROR', message: 'Choose a mood or add a note before saving.' } };
    write('moodDiary', upsertDiaryEntry(rows, entry));
    return entry;
  }
  if (/^\/me\/mood-diary\/\d+$/.test(p) && method === 'DELETE') {
    const entryId = Number(p.split('/').pop());
    const rows = read('moodDiary', []);
    if (!rows.some((entry) => Number(entry.entryId) === entryId)) return { error: { code: 'NOT_FOUND', message: 'Mood diary entry not found.' } };
    write('moodDiary', removeDiaryEntry(rows, entryId));
    return { deleted: true, entryId };
  }
  if (p === '/me/settings' && method === 'PATCH') return { ...user, ...body, languages: [], region: null };
  if (p === '/search' || p === '/search/suggest') {
    const term = norm(q.get('q'));
    const words = term.split(' ').filter(Boolean);
    const matched = term ? all.filter((song) => {
      const haystack = norm([song.title, song.artist.name, song.genre.name, song.topic, song.language].concat(song.moods).join(' '));
      return words.every((word) => haystack.includes(word));
    }) : [];
    const limit = safeLimit(q.get('limit'), 60, 100);
    const artistHits = catalogue.artists.filter((artist) => words.every((word) => norm(artist.name).includes(word))).slice(0, 20);
    const moodHits = MOODS.filter((mood) => words.some((word) => norm(mood.name).includes(word)));
    const genreHits = catalogue.genres.filter((genre) => words.some((word) => norm(genre.name).includes(word)));
    if (p === '/search/suggest') return {
      songs: matched.slice(0, 5).map(withPersonalState), artists: artistHits.slice(0, 3), albums: [],
    };
    return {
      total: matched.length, songs: matched.slice(0, limit).map(withPersonalState),
      artists: artistHits, albums: [], moods: moodHits, genres: genreHits, languages: [...new Set(matched.map((song) => song.language).filter(Boolean))],
    };
  }
  if (/^\/songs\/\d+$/.test(p)) return getSong(catalogue, p.split('/').pop());
  if (/^\/songs\/\d+\/(like|rating)$/.test(p)) {
    const id = Number(p.split('/')[2]);
    if (p.endsWith('/like')) {
      const likes = read('likes', []);
      write('likes', body && body.liked ? [...new Set([...likes, id])] : likes.filter((x) => x !== id));
    } else if (p.endsWith('/rating')) {
      const ratings = read('ratings', {});
      if (method === 'DELETE') delete ratings[id];
      else if (body && Number.isFinite(Number(body.rating))) ratings[id] = Number(body.rating);
      write('ratings', ratings);
    }
    return { ok: true, previous: false };
  }
  if (/^\/songs\/\d+\/dismiss$/.test(p)) {
    const id = Number(p.split('/')[2]);
    const dismissals = read('dismissals', []);
    write('dismissals', method === 'DELETE' ? dismissals.filter((value) => value !== id) : [...new Set([...dismissals, id])]);
    return { ok: true };
  }
  if (/^\/songs\/\d+\/mood-ratings$/.test(p) && method === 'GET') {
    const id = Number(p.split('/')[2]);
    const song = getSong(catalogue, id);
    return song ? localMoodRatings(song, read('moodRatings', {})) : { moods: [], privateSession: false, totals: { ratings: 0, raters: 0 } };
  }
  if (/^\/songs\/\d+\/mood-ratings\/\d+$/.test(p) && method === 'DELETE') {
    const songId = Number(p.split('/')[2]);
    const moodId = Number(p.split('/').pop());
    const ratings = read('moodRatings', {});
    if (ratings[songId]) { delete ratings[songId][moodId]; write('moodRatings', ratings); }
    return { ok: true };
  }
  if (/^\/songs\/\d+\/mood-ratings$/.test(p) && method === 'PUT') {
    const songId = Number(p.split('/')[2]);
    const ratings = read('moodRatings', {});
    const current = ratings[songId] || {};
    const saved = (body && body.ratings || []).map((item) => {
      const created = current[item.moodId] === undefined;
      current[item.moodId] = Number(item.matchPercentage);
      return { ...item, created };
    });
    ratings[songId] = current; write('moodRatings', ratings);
    return { saved, totals: { ratings: Object.keys(current).length, raters: Object.keys(current).length ? 1 : 0 } };
  }
  if (p === '/me/mood-ratings') return [];
  if (/^\/moods\/\d+\/top-rated$/.test(p)) {
    const id = Number(p.split('/')[2]);
    const mood = MOODS.find((item) => item.id === id);
    return listResult(mood ? choose(catalogue, { moods: [mood.name] }, safeLimit(q.get('limit'), 20, 100)) : [], 'Top-rated archive matches', 'Sorted by topic match; community rating data is not available in this dataset.');
  }
  if (p === '/playlists' && method === 'POST') {
    const lists = read('playlists', []);
    const songs = [...new Set((body && body.songIds || []).map(Number).filter((id) => catalogue.songById.has(id)))];
    const item = { id: Date.now(), name: String(body && body.name || 'My playlist').slice(0, 80), songCount: songs.length, kind: 'MANUAL', covers: [], songs, totalDurationSec: null };
    write('playlists', [item, ...lists]); return item;
  }
  if (p === '/playlists') return read('playlists', []);
  if (p === '/playlists/smart') return [
    { type: 'ENERGY_BOOST', name: 'Energy boost', blurb: 'High-energy records from the dataset' },
    { type: 'CALM_MIX', name: 'Calm mix', blurb: 'Gentler acoustic records from the dataset' },
    { type: 'DISCOVERY', name: 'Discovery', blurb: 'Explore more records across genres' },
  ];
  if (p.startsWith('/playlists/smart/') && method === 'GET') {
    const type = p.split('/').pop();
    const target = type === 'ENERGY_BOOST' ? { energy: 0.82, valence: 0.7 }
      : type === 'CALM_MIX' ? { energy: 0.25, acousticness: 0.75 } : {};
    return listResult(choose(catalogue, target, 18), 'Smart archive selection', 'Selected from the uploaded music-feature dataset.');
  }
  if (p.startsWith('/playlists/smart/') && method === 'POST') {
    const type = p.split('/').pop();
    const lists = read('playlists', []);
    const target = type === 'ENERGY_BOOST' ? { energy: 0.82, valence: 0.7 } : type === 'CALM_MIX' ? { energy: 0.25, acousticness: 0.75 } : {};
    const songs = choose(catalogue, target, 18).map((song) => song.id);
    const item = { id: Date.now(), name: String(body && body.name || 'Archive mix').slice(0, 80), songCount: songs.length, kind: 'SAVED_MIX', covers: [], songs, totalDurationSec: null };
    write('playlists', [item, ...lists]); return item;
  }
  if (/^\/playlists\/\d+$/.test(p) && method === 'GET') {
    const id = Number(p.split('/')[2]);
    const item = read('playlists', []).find((playlist) => playlist.id === id);
    if (!item) return { id, name: 'Playlist not found', kind: 'MANUAL', songCount: 0, covers: [], songs: [], totalDurationSec: null };
    return { ...item, songs: getPlaylistSongs(catalogue, item.songs || []) };
  }
  if (/^\/playlists\/\d+\/order$/.test(p) && method === 'PUT') {
    const id = Number(p.split('/')[2]);
    const lists = read('playlists', []);
    const item = lists.find((playlist) => playlist.id === id);
    const requested = Array.isArray(body?.songIds) ? body.songIds.map(Number) : [];
    const current = item?.songs || [];
    if (!item) return { error: { code: 'NOT_FOUND', message: 'Playlist not found.' } };
    if (new Set(requested).size !== requested.length || requested.length !== current.length || requested.some((songId) => !current.includes(songId))) {
      return { error: { code: 'PLAYLIST_ORDER_STALE', message: 'Refresh this playlist and try again.' } };
    }
    item.songs = requested;
    write('playlists', lists);
    return { ...item, songs: getPlaylistSongs(catalogue, item.songs) };
  }
  if (/^\/playlists\/\d+\/songs$/.test(p) && method === 'POST') {
    const id = Number(p.split('/')[2]);
    const lists = read('playlists', []);
    const item = lists.find((playlist) => playlist.id === id);
    if (!item) return { ok: false };
    item.songs = [...new Set([...(item.songs || []), Number(body && body.songId)])];
    item.songCount = item.songs.length;
    write('playlists', lists);
    return { ok: true, songCount: item.songCount };
  }
  if (/^\/playlists\/\d+\/songs\/\d+$/.test(p) && method === 'DELETE') {
    const id = Number(p.split('/')[2]);
    const songId = Number(p.split('/').pop());
    const lists = read('playlists', []);
    const item = lists.find((playlist) => playlist.id === id);
    if (item) { item.songs = (item.songs || []).filter((x) => x !== songId); item.songCount = item.songs.length; write('playlists', lists); }
    return { ok: true };
  }
  if (/^\/playlists\/\d+$/.test(p) && method === 'DELETE') {
    const id = Number(p.split('/')[2]);
    write('playlists', read('playlists', []).filter((item) => item.id !== id));
    return { ok: true };
  }
  if (/^\/playlists\/\d+$/.test(p) && method === 'PATCH') {
    const id = Number(p.split('/')[2]);
    const lists = read('playlists', []);
    const item = lists.find((playlist) => playlist.id === id);
    if (item) { item.name = body.name || item.name; write('playlists', lists); }
    return item || { ok: false };
  }
  if (p === '/incognito') return { active: read('incognito', false), startedAt: null, secondsLeft: 7200, events: 0, memory: [], recentSongs: [] };
  if (p === '/insights/profile') return { days: 30, headline: null, longTerm: [], recentTrend: null, streak: { current: 0, longest: 0 }, mostReplayed: null, mostSkipped: null };
  if (p === '/insights/skip-patterns') return { days: 30, summary: { plays: 0, skips: 0, skipRate: null, avgCompletion: null }, genres: [], artists: [], moods: [], contexts: [], hours: [], songs: [], note: 'The metadata-only archive has no real playback events to analyse.' };
  if (p === '/insights/activity') return { daily: [], genres: [], heatmap: [], languages: [], contexts: [] };
  if (p === '/insights/calendar') {
    const days = safeLimit(q.get('days'), 365, 365);
    const saved = new Map(read('moodDiary', []).map((entry) => [entry.checkinDate, entry]));
    const today = new Date();
    const daily = Array.from({ length: days }, (_, index) => {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - index);
      const day = diaryDateKey(date);
      const entry = saved.get(day);
      return { day, plays: 0, minutes: 0, entryId: entry?.entryId || null, moodId: entry?.moodId || null, moodName: entry?.moodName || null, moodEmoji: entry?.moodEmoji || null, moodColor: entry?.moodColor || null, hasNote: Boolean(entry?.note) };
    });
    return { daily, note: 'This metadata-only demo has no persistent playback history; private diary check-ins still appear.' };
  }
  if (p === '/insights/journey') return { distribution: [], transitions: [], trends: [], sessionArcs: [] };
  if (p === '/insights/preferences') return {
    signals: [], summary: 'Listening insights appear after audio playback is connected.',
    model: null, evidence: { behaviourShare: 0, onboardingShare: 100, completedPlays: 0, neededForFullConfidence: 25 },
    genres: [], artists: [], moods: [],
  };
  if (p === '/playlists/from-batch' && method === 'POST') return { ok: false, message: 'Archive lists can be saved through a local playlist.' };
  if (p === '/worlds/current/regenerate' || p === '/worlds/current/rollback') return archiveWorld(catalogue);
  if (/^\/worlds\/\d+\/feedback$/.test(p)) return { ok: true };
  if (p === '/playback/start') return { playId: playId++, private: read('incognito', false), isReplay: false, media: null };
  if (p.startsWith('/playback/') || p === '/playback/private') return { ok: true };
  if (/^\/artists\/\d+\/artwork$/.test(p) || /^\/albums\/\d+\/artwork$/.test(p)) return {};
  if (/^\/artists\/\d+$/.test(p)) {
    const id = Number(p.split('/').pop());
    const artist = catalogue.artistById.get(id);
    const songs = catalogue.artistSongs.get(id) || [];
    if (!artist) return { id, name: 'Artist not found', type: 'ARTIST', aliases: [], songs: [], popularity: { plays30d: 0, listeners30d: 0, rank: null } };
    return { id, name: artist.name, type: 'ARTIST', language: null, region: null, formedYear: null, bio: null, aliases: [], songs: songs.map(withPersonalState), popularity: { plays30d: 0, listeners30d: 0, rank: null } };
  }
  if (/^\/albums\/\d+$/.test(p)) return { notAvailable: true, message: 'The supplied dataset has no album information.' };
  if (/^\/films\/\d+$/.test(p)) return { notAvailable: true, message: 'The supplied dataset has no film or soundtrack information.' };
  if (p.startsWith('/admin/')) return {};
  return { empty: true, notAvailable: true, message: 'This feature is not available in the metadata-only archive view.' };
}

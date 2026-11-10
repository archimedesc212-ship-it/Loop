// Spotify-notebook-style nearest-neighbour recommendations.
// The attached notebook standardises numeric audio features, averages the seed
// vectors, then ranks candidates by cosine distance. The current LOOP archive
// exposes a smaller feature set, so this adaptation uses only fields it really has.
export const FEATURE_KEYS = Object.freeze([
  'energy', 'valence', 'danceability', 'acousticness',
  'instrumentalness', 'loudnessIndex', 'releaseYear',
]);

function featureValue(song, key) {
  const raw = key === 'releaseYear' ? song?.releaseYear : song?.features?.[key];
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function magnitude(vector) {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

function cosineDistance(a, b) {
  const normA = magnitude(a);
  const normB = magnitude(b);
  if (normA < 1e-10 || normB < 1e-10) {
    // sklearn's cosine distance is undefined for a zero vector. A scaled
    // Euclidean fallback gives deterministic, useful results for mean-like songs.
    return Math.sqrt(a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0));
  }
  const dot = a.reduce((sum, value, i) => sum + value * b[i], 0);
  return 1 - Math.max(-1, Math.min(1, dot / (normA * normB)));
}

/**
 * Return nearest neighbours of one or more seed songs.
 * @returns {{song: object, distance: number, similarity: number}[]}
 */
export function recommendByFeatureCentroid(songs, seedSongs, limit = 10) {
  if (!Array.isArray(songs) || !Array.isArray(seedSongs) || !seedSongs.length) return [];
  const valid = songs.filter((song) => FEATURE_KEYS.every((key) => featureValue(song, key) !== null));
  if (valid.length < 2) return [];

  const means = FEATURE_KEYS.map((key) => mean(valid.map((song) => featureValue(song, key))));
  const scales = FEATURE_KEYS.map((key, index) => {
    const variance = mean(valid.map((song) => (featureValue(song, key) - means[index]) ** 2));
    const standardDeviation = Math.sqrt(variance);
    return standardDeviation > 1e-10 ? standardDeviation : 1;
  });
  const scaleVector = (vector) => vector.map((value, index) => (value - means[index]) / scales[index]);

  const usableSeeds = seedSongs.filter((song) => FEATURE_KEYS.every((key) => featureValue(song, key) !== null));
  if (!usableSeeds.length) return [];
  const seedMean = FEATURE_KEYS.map((key) => mean(usableSeeds.map((song) => featureValue(song, key))));
  const centre = scaleVector(seedMean);
  const excludedIds = new Set(usableSeeds.map((song) => Number(song.id)));
  const excludedNames = new Set(usableSeeds.map((song) => `${String(song.title || '').toLowerCase()}|${song.releaseYear || ''}`));

  const ranked = valid
    .filter((song) => !excludedIds.has(Number(song.id))
      && !excludedNames.has(`${String(song.title || '').toLowerCase()}|${song.releaseYear || ''}`))
    .map((song) => {
      const vector = scaleVector(FEATURE_KEYS.map((key) => featureValue(song, key)));
      const distance = cosineDistance(centre, vector);
      return { song, distance, similarity: Number.isFinite(distance) ? 1 - distance : 0 };
    })
    .sort((a, b) => a.distance - b.distance || Number(a.song.id) - Number(b.song.id));

  const count = Math.max(1, Math.min(100, Math.floor(Number(limit) || 10)));
  return ranked.slice(0, count);
}

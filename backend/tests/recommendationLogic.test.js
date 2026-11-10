const { test } = require('node:test');
const assert = require('node:assert/strict');
const { weightedMoods, interpolateProfile, discoveryTargets, recommendationEvidence } = require('../src/utils/recommendationLogic');

test('explicit mood blend weights are normalized from exactly 100 percent', () => {
  const result = weightedMoods([], [{ moodId: 1, weight: 62.5 }, { moodId: 2, weight: 37.5 }]);
  assert.deepEqual(result, [{ moodId: 1, weight: 0.625 }, { moodId: 2, weight: 0.375 }]);
  assert.equal(result.reduce((sum, row) => sum + row.weight, 0), 1);
});

test('mood blend rejects duplicate, zero, excessive and non-100 percent allocations', () => {
  assert.throws(() => weightedMoods([], [{ moodId: 1, weight: 50 }, { moodId: 1, weight: 50 }]), /once/);
  assert.throws(() => weightedMoods([], [{ moodId: 1, weight: 0 }, { moodId: 2, weight: 100 }]), /greater than 0/);
  assert.throws(() => weightedMoods([], [{ moodId: 1, weight: 50 }, { moodId: 2, weight: 49 }]), /exactly 100/);
  assert.throws(() => weightedMoods([], [{ moodId: 1, weight: 50 }, { moodId: 2, weight: 25 }, { moodId: 3, weight: 15 }, { moodId: 4, weight: 10 }, { moodId: 5, weight: 1 }]), /one and four/);
});

test('legacy mood selections are evenly weighted and duplicate ids are removed', () => {
  assert.deepEqual(weightedMoods([4, 7, 4]), [
    { moodId: 4, weight: 0.5 }, { moodId: 7, weight: 0.5 },
  ]);
});

test('journey interpolation starts at the source profile, ends at the target and moves linearly', () => {
  const start = { target_energy: 0.2, target_valence: 0.1, target_danceability: 0.2, target_acousticness: 0.8,
    target_instrumentalness: 0.9, tempo_min: 50, tempo_max: 80, max_speechiness: 0.1 };
  const end = { target_energy: 0.8, target_valence: 0.9, target_danceability: 0.8, target_acousticness: 0.2,
    target_instrumentalness: 0.1, tempo_min: 120, tempo_max: 160, max_speechiness: 0.7 };
  assert.deepEqual(interpolateProfile(start, end, 0), { energy: 0.2, valence: 0.1, danceability: 0.2, acousticness: 0.8, instrumentalness: 0.9, tempoMin: 50, tempoMax: 80, maxSpeechiness: 0.1 });
  const middle = interpolateProfile(start, end, 0.5);
  assert.equal(middle.energy, 0.5);
  assert.equal(middle.valence, 0.5);
  assert.equal(middle.tempoMin, 85);
  assert.equal(interpolateProfile(start, end, 1).energy, 0.8);
});

test('recommendation confidence is labelled from available evidence rather than score-as-probability', () => {
  assert.equal(recommendationEvidence({ mood_score: 0.9, audio_score: 0.8 }).level, 'NEW_USER_FALLBACK');
  assert.equal(recommendationEvidence({ mood_score: 0.9, audio_score: 0.8, preference_score: 0.7 }).level, 'PARTIAL_MATCH');
  assert.equal(recommendationEvidence({ mood_score: 0.9, audio_score: 0.8, collaborative_score: 0.7 }).level, 'PARTIAL_MATCH');
  assert.equal(recommendationEvidence({ mood_score: 0.9, audio_score: 0.8, preference_score: 0.7,
    recency_score: 0.6, trend_score: 0.4, context_score: 0.8 }).level, 'STRONG_MATCH');
});

test('discovery intensity moves from the familiar sound profile to its audio-feature opposite', () => {
  const base = { energy: 0.8, valence: 0.7, danceability: 0.9, acousticness: 0.2, instrumentalness: 0.1,
    tempoMin: 110, tempoMax: 150, maxSpeechiness: 0.8 };
  assert.deepEqual(discoveryTargets(base, 0), base);
  const half = discoveryTargets(base, 50);
  assert.equal(half.energy, 0.5);
  assert.equal(half.valence, 0.5);
  const high = discoveryTargets(base, 100);
  assert.equal(high.energy, 0.2);
  assert.equal(high.acousticness, 0.8);
  assert.equal(high.tempoMin, 110);
  assert.equal(discoveryTargets(base, 250).energy, high.energy);
});

'use strict';

const MOOD_FIELDS = ['target_energy', 'target_valence', 'target_danceability', 'target_acousticness', 'target_instrumentalness', 'tempo_min', 'tempo_max'];

/** Convert a 0–100 user allocation into weights whose total is exactly 1. */
function weightedMoods(moodIds = [], moodWeights = undefined) {
  if (moodWeights !== undefined) {
    if (!Array.isArray(moodWeights) || moodWeights.length < 1 || moodWeights.length > 4) {
      throw new TypeError('Choose between one and four weighted moods.');
    }
    const seen = new Set();
    const rows = moodWeights.map((item) => {
      const moodId = Number(item?.moodId);
      const weight = Number(item?.weight);
      if (!Number.isInteger(moodId) || moodId < 1 || seen.has(moodId)) throw new TypeError('Each mood must be selected once.');
      if (!Number.isFinite(weight) || weight <= 0 || weight > 100) throw new TypeError('Each mood weight must be greater than 0 and no more than 100.');
      seen.add(moodId);
      return { moodId, weight };
    });
    const total = Math.round(rows.reduce((sum, row) => sum + row.weight, 0) * 100) / 100;
    if (Math.abs(total - 100) > 0.01) throw new TypeError('Mood weights must add up to exactly 100%.');
    return rows.map((row) => ({ ...row, weight: row.weight / total }));
  }
  const unique = [...new Set((moodIds || []).map(Number))];
  if (unique.length > 4) throw new TypeError('Choose no more than four moods.');
  if (!unique.every((id) => Number.isInteger(id) && id > 0)) throw new TypeError('Mood IDs must be positive whole numbers.');
  return unique.map((moodId) => ({ moodId, weight: unique.length ? 1 / unique.length : 0 }));
}


/** Blend a listener's learned sound with its audio-feature opposite for discovery.
 * 0 stays close to their taste; 100 deliberately explores the opposite side of
 * each sound axis. The discovery-only SQL gate still excludes played songs.
 */
function discoveryTargets(base, intensity = 50) {
  const amount = Math.max(0, Math.min(100, Number(intensity) || 0)) / 100;
  const mix = (familiar, adventurous) => Math.round((Number(familiar) + (Number(adventurous) - Number(familiar)) * amount) * 1000) / 1000;
  return {
    energy: mix(base.energy, 1 - base.energy),
    valence: mix(base.valence, 1 - base.valence),
    danceability: mix(base.danceability, 1 - base.danceability),
    acousticness: mix(base.acousticness, 1 - base.acousticness),
    instrumentalness: mix(base.instrumentalness, 1 - base.instrumentalness),
    tempoMin: mix(base.tempoMin, Math.max(40, 260 - base.tempoMax)),
    tempoMax: mix(base.tempoMax, Math.min(220, 260 - base.tempoMin)),
    maxSpeechiness: base.maxSpeechiness ?? 1,
  };
}

function interpolateProfile(start, end, t) {
  const progress = Math.max(0, Math.min(1, Number(t)));
  const mix = (left, right) => Number(left) + (Number(right) - Number(left)) * progress;
  return {
    energy: mix(start.target_energy, end.target_energy),
    valence: mix(start.target_valence, end.target_valence),
    danceability: mix(start.target_danceability, end.target_danceability),
    acousticness: mix(start.target_acousticness, end.target_acousticness),
    instrumentalness: mix(start.target_instrumentalness, end.target_instrumentalness),
    tempoMin: mix(start.tempo_min, end.tempo_min),
    tempoMax: mix(start.tempo_max, end.tempo_max),
    maxSpeechiness: mix(start.max_speechiness ?? 1, end.max_speechiness ?? 1),
  };
}

const SIGNAL_LABELS = {
  mood_score: 'Mood fit', audio_score: 'Audio features', preference_score: 'Your taste', recency_score: 'Recent listening',
  trend_score: 'Current trends', context_score: 'Listening context', regional_score: 'Language and region', exploration_score: 'Discovery variety',
};
function recommendationEvidence(row) {
  const present = Object.entries(SIGNAL_LABELS).filter(([field]) => row[field] !== null && row[field] !== undefined);
  const keys = present.map(([field]) => field);
  const behaviorBacked = keys.includes('preference_score') || keys.includes('recency_score');
  let level;
  if (!behaviorBacked) level = 'NEW_USER_FALLBACK';
  else if (keys.length >= 5) level = 'STRONG_MATCH';
  else if (keys.length >= 3) level = 'PARTIAL_MATCH';
  else level = 'LIMITED_DATA';
  const labels = { STRONG_MATCH: 'Strong match', PARTIAL_MATCH: 'Partial match', LIMITED_DATA: 'Limited data', NEW_USER_FALLBACK: 'New-user fallback' };
  return { level, label: labels[level], supportingSignals: present.map(([, label]) => label), signalCount: keys.length };
}

module.exports = { weightedMoods, interpolateProfile, discoveryTargets, recommendationEvidence, MOOD_FIELDS };

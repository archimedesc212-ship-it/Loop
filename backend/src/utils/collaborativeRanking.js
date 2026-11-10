'use strict';

/**
 * Blend catalogue/personal scores with evidence from listeners who completed
 * at least two of the same tracks. Database access stays in the service layer.
 */
function applyCollaborativeBoost(rows, evidence, { maxWeight = 0.12, minimumListeners = 2, fullConfidenceAt = 5 } = {}) {
  if (!Array.isArray(rows) || !Array.isArray(evidence) || !evidence.length) return rows || [];
  const bySong = new Map(evidence.map((item) => [
    Number(item.song_id),
    { score: Math.max(0, Math.min(1, Number(item.collaborative_score) || 0)), listeners: Number(item.listener_count) || 0 },
  ]));

  return rows.map((row) => {
    const signal = bySong.get(Number(row.song_id));
    if (!signal || signal.listeners < minimumListeners) {
      return { ...row, collaborative_score: null, collaborative_listeners: signal?.listeners || 0 };
    }
    const confidence = Math.min(1, signal.listeners / fullConfidenceAt);
    const weight = maxWeight * confidence;
    const base = Number(row.final_score) || 0;
    return {
      ...row,
      final_score: base * (1 - weight) + signal.score * weight,
      collaborative_score: signal.score,
      collaborative_listeners: signal.listeners,
      collaborative_weight: weight,
    };
  }).sort((a, b) => Number(b.final_score) - Number(a.final_score)
    || Number(a.song_id) - Number(b.song_id));
}

module.exports = { applyCollaborativeBoost };

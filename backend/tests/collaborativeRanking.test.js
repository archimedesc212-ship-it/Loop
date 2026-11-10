const { test } = require('node:test');
const assert = require('node:assert/strict');
const { applyCollaborativeBoost } = require('../src/utils/collaborativeRanking');

test('collaborative evidence boosts songs enjoyed by similar listeners and reranks them', () => {
  const rows = [{ song_id: 1, final_score: 0.81 }, { song_id: 2, final_score: 0.80 }];
  const ranked = applyCollaborativeBoost(rows, [
    { song_id: 2, collaborative_score: 1, listener_count: 5 },
  ]);
  assert.equal(ranked[0].song_id, 2);
  assert.equal(ranked[0].rank_position, 1);
  assert.equal(ranked[0].collaborative_listeners, 5);
  assert.ok(ranked[0].final_score > 0.74);
  assert.equal(ranked[1].song_id, 1);
  assert.equal(ranked[1].rank_position, 2);
  assert.equal(ranked[1].final_score, 0.81);
});

test('one similar listener is insufficient to influence recommendations', () => {
  const ranked = applyCollaborativeBoost([{ song_id: 1, final_score: 0.8 }], [
    { song_id: 1, collaborative_score: 1, listener_count: 1 },
  ]);
  assert.equal(ranked[0].final_score, 0.8);
  assert.equal(ranked[0].collaborative_score, null);
});

test('empty evidence preserves the original list and scores', () => {
  const rows = [{ song_id: 1, final_score: 0.8 }];
  assert.deepEqual(applyCollaborativeBoost(rows, []), rows);
});

test('collaborative influence is confidence-weighted and capped', () => {
  const ranked = applyCollaborativeBoost([{ song_id: 1, final_score: 0.5 }], [
    { song_id: 1, collaborative_score: 1, listener_count: 100 },
  ]);
  assert.equal(ranked[0].collaborative_weight, 0.12);
  assert.equal(ranked[0].final_score, 0.56);
});

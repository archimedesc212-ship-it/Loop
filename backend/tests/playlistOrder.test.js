const test = require('node:test');
const assert = require('node:assert/strict');
const { isExactPlaylistOrder } = require('../src/utils/playlistOrder');

test('playlist reorder accepts a complete permutation', () => {
  assert.equal(isExactPlaylistOrder([10, 20, 30], [30, 10, 20]), true);
});

test('playlist reorder rejects missing, extra, duplicate and foreign song IDs', () => {
  const current = [10, 20, 30];
  for (const next of [[10, 20], [10, 20, 30, 40], [10, 10, 30], [10, 20, 99]]) {
    assert.equal(isExactPlaylistOrder(current, next), false);
  }
});

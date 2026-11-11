const test = require('node:test');
const assert = require('node:assert/strict');
const { validateMoodDiaryDate } = require('../src/utils/moodDiaryDate');

test('Mood Diary accepts the current local calendar day', () => {
  const now = new Date('2026-11-10T12:00:00.000Z');
  assert.equal(validateMoodDiaryDate('2026-11-10', now), '2026-11-10');
});

test('Mood Diary allows one UTC boundary day for browser time zones', () => {
  const now = new Date('2026-11-10T12:00:00.000Z');
  assert.equal(validateMoodDiaryDate('2026-11-09', now), '2026-11-09');
  assert.equal(validateMoodDiaryDate('2026-11-11', now), '2026-11-11');
});

test('Mood Diary rejects malformed, impossible and arbitrarily backdated dates', () => {
  const now = new Date('2026-11-10T12:00:00.000Z');
  for (const value of ['not-a-date', '2026-02-31', '2026-11-07', '2026-11-13', '20261110']) {
    assert.throws(() => validateMoodDiaryDate(value, now), { code: 'VALIDATION_ERROR' });
  }
});

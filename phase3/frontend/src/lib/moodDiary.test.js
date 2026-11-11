import { describe, expect, it } from 'vitest';
import { diaryDateKey, moodCalendarDays, removeDiaryEntry, upsertDiaryEntry } from './moodDiary';

describe('private mood diary helpers', () => {
  it('formats a local calendar date without converting it through UTC', () => {
    expect(diaryDateKey(new Date(2026, 10, 10, 0, 5))).toBe('2026-11-10');
  });

  it('keeps one entry per day and orders newest dates first', () => {
    const existing = [
      { entryId: 1, checkinDate: '2026-11-10', note: 'old today' },
      { entryId: 2, checkinDate: '2026-11-09', note: 'yesterday' },
    ];
    const next = upsertDiaryEntry(existing, { entryId: 3, checkinDate: '2026-11-10', note: 'updated today' });
    expect(next).toHaveLength(2);
    expect(next[0].entryId).toBe(3);
    expect(next[1].entryId).toBe(2);
  });

  it('deletes only the selected diary entry', () => {
    const rows = [{ entryId: 1 }, { entryId: 2 }];
    expect(removeDiaryEntry(rows, '1')).toEqual([{ entryId: 2 }]);
  });
});


describe('mood calendar helper', () => {
  it('is Monday-first and maps saved entries to local dates', () => {
    const cells = moodCalendarDays(2026, 10, [{ day: '2026-11-10', moodName: 'Calm', moodEmoji: '🌿', plays: 4, minutes: 12 }]);
    expect(cells[0].dateKey).toBe('2026-10-26');
    const saved = cells.find((cell) => cell.dateKey === '2026-11-10');
    expect(saved.inMonth).toBe(true);
    expect(saved.entry.moodName).toBe('Calm');
    expect(saved.plays).toBe(4);
    expect(saved.minutes).toBe(12);
  });
});

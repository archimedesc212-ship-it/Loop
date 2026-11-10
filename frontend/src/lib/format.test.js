import { describe, it, expect } from 'vitest';
import { duration, longDuration, score, toDate, hour, plural, hash } from './format';

describe('format helpers', () => {
  it('formats durations, including missing values', () => {
    expect(duration(0)).toBe('0:00');
    expect(duration(61.4)).toBe('1:01');
    expect(duration(null)).toBe('–:––');
    expect(duration(NaN)).toBe('–:––');
    expect(longDuration(3720)).toBe('1 hr 2 min');
    expect(longDuration(undefined)).toBe('–');
    expect(longDuration(null)).toBe('–');
  });
  it('reads calendar days as local dates and instants as instants', () => {
    const d = toDate('2026-10-05');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 5]);
    expect(toDate('2026-10-05T10:00:00Z').toISOString()).toBe('2026-10-05T10:00:00.000Z');
  });
  it('scores, hours, plurals and the stable hash', () => {
    expect(score(0.876)).toBe(88);
    expect(score(null)).toBe('–');
    expect(hour(0)).toBe('12 AM');
    expect(hour(13)).toBe('1 PM');
    expect(plural(1, 'song')).toBe('1 song');
    expect(plural(3, 'song')).toBe('3 songs');
    expect(hash('motif:1')).toBe(hash('motif:1'));
    expect(hash('a')).not.toBe(hash('b'));
  });
});

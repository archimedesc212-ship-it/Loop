import { describe, it, expect } from 'vitest';
import { validatePct, formatPct, formatAi, ratingCount } from './moodRating';

describe('validatePct', () => {
  it('accepts the bounds and up to two decimals', () => {
    expect(validatePct('0')).toEqual({ ok: true, value: 0 });
    expect(validatePct('100')).toEqual({ ok: true, value: 100 });
    expect(validatePct(' 92.5 ')).toEqual({ ok: true, value: 92.5 });
    expect(validatePct('18.00')).toEqual({ ok: true, value: 18 });
    expect(validatePct(76.25)).toEqual({ ok: true, value: 76.25 });
  });
  it('rejects empty, non-numeric, out-of-range and over-precise values', () => {
    for (const bad of ['', '  ', 'abc', '1e2', '12,5', '-1', '-0.01', '100.01', '101', '12.345', null, undefined]) {
      expect(validatePct(bad).ok, String(bad)).toBe(false);
    }
    expect(validatePct('101').error).toMatch(/between 0 and 100/);
    expect(validatePct('12.345').error).toMatch(/two decimal/);
  });
});

describe('formatting', () => {
  it('shows two decimals and never turns missing data into 0 %', () => {
    expect(formatPct(92.5)).toBe('92.50%');
    expect(formatPct(0)).toBe('0.00%');
    expect(formatPct(null)).toBe('—');
    expect(formatPct(undefined)).toBe('—');
    expect(formatAi(0.836)).toBe('84%');
    expect(formatAi(null)).toBe('—');
    expect(ratingCount(1)).toBe('1 rating');
    expect(ratingCount(3)).toBe('3 ratings');
  });
});

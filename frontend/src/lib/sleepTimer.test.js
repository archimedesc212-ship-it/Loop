import { describe, expect, it } from 'vitest';
import { formatSleepRemaining, sleepFadeFactor } from './sleepTimer';

describe('sleep timer helpers', () => {
  it('holds volume steady until the final fade window', () => {
    expect(sleepFadeFactor(90, 120)).toBe(1);
    expect(sleepFadeFactor(30, 120)).toBe(1);
  });

  it('fades linearly and handles timers shorter than the fade window', () => {
    expect(sleepFadeFactor(15, 120)).toBe(0.5);
    expect(sleepFadeFactor(5, 10)).toBe(0.5);
    expect(sleepFadeFactor(0, 10)).toBe(0);
  });

  it('formats remaining time for the player controls', () => {
    expect(formatSleepRemaining(89)).toBe('1:29');
    expect(formatSleepRemaining(3661)).toBe('1:01:01');
  });
});

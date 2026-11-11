import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import Intro, { introSeen, replayIntro } from './Intro';

const motion = (reduce) => { window.matchMedia = vi.fn().mockImplementation(() => ({ matches: reduce, addEventListener() {}, removeEventListener() {} })); };

describe('Intro', () => {
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); motion(false); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('is a labelled dialog whose Skip button has focus from the start', () => {
    render(<Intro onDone={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'LOOP introduction' })).toBeTruthy();
    expect(document.activeElement.textContent).toBe('Skip intro');
    expect(screen.getByText('Every mood has a sound.')).toBeTruthy();
  });

  it('Skip ends it, remembers that it was seen, and calls onDone', () => {
    const done = vi.fn();
    render(<Intro onDone={done} />);
    fireEvent.click(screen.getByText('Skip intro'));
    act(() => { vi.advanceTimersByTime(500); });
    expect(done).toHaveBeenCalledTimes(1);
    expect(introSeen()).toBe(true);
    replayIntro();
    expect(introSeen()).toBe(false);
  });

  it('Escape skips too', () => {
    const done = vi.fn();
    render(<Intro onDone={done} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    act(() => { vi.advanceTimersByTime(500); });
    expect(done).toHaveBeenCalled();
  });

  it('plays through the lines to the brand and finishes by itself', () => {
    const done = vi.fn();
    render(<Intro onDone={done} />);
    // each step schedules the next after it renders, so advance one step at a time
    act(() => { vi.advanceTimersByTime(1700); });
    expect(screen.getByText('Tell LOOP how you feel.')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(1700); });
    act(() => { vi.advanceTimersByTime(1700); });
    expect(screen.getByText('Music Mood Intelligence')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(2200); });
    act(() => { vi.advanceTimersByTime(500); });
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('with reduced motion shows one still frame and waits for Continue', () => {
    motion(true);
    const done = vi.fn();
    render(<Intro onDone={done} />);
    expect(screen.getByText('Continue')).toBeTruthy();
    expect(screen.queryByText('Every mood has a sound.')).toBeNull();
    act(() => { vi.advanceTimersByTime(20000); });
    expect(done).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Continue'));
    act(() => { vi.advanceTimersByTime(10); });
    expect(done).toHaveBeenCalled();
  });
});

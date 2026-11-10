import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const toast = { info: vi.fn(), success: vi.fn(), error: vi.fn() };
vi.mock('../hooks/useToast', () => ({ useToast: () => toast }));
vi.mock('../services/api', () => ({ api: { moodRatings: vi.fn(), saveMoodRatings: vi.fn(), removeMoodRating: vi.fn() } }));

const { default: MoodRatings } = await import('./MoodRatings');
const { api } = await import('../services/api');

const mood = (id, name, extra = {}) => ({ id, name, emoji: '', color: '#88AAFF', category: 'x', aiConfidence: null, community: null, mine: null, ...extra });
const payload = (moods, extra = {}) => ({ songId: 7, title: 'Song', scale: { min: 0, max: 100, decimals: 2 }, privateSession: false,
  totals: { ratings: 0, raters: 0 }, moods, ...extra });

describe('MoodRatings', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('shows a loading state, then moods from the API with no invented values', async () => {
    let resolve;
    api.moodRatings.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { container } = render(<MoodRatings songId={7} />);
    expect(container.querySelector('.skel')).toBeTruthy();
    resolve(payload([mood(1, 'Happy', { aiConfidence: 0.72 }), mood(2, 'Sad', { community: { average: 81, count: 3, min: 64.25, max: 90.5 } })]));
    await screen.findByText('How well does it fit each mood?');
    expect(screen.getByText('No mood ratings for this song yet')).toBeTruthy();
    expect(screen.getByText('No ratings yet')).toBeTruthy();       // Happy has no listener ratings
    expect(screen.getByText('81.00%')).toBeTruthy();               // Sad's average
    expect(screen.getByText('3 ratings')).toBeTruthy();
    expect(screen.getByText(/Dataset 72%/)).toBeTruthy();         // source-feature estimate, not an AI model
    expect(screen.getByRole('button', { name: 'Save ratings' }).disabled).toBe(true);
  });

  it('validates input and blocks saving until it is fixed', async () => {
    api.moodRatings.mockResolvedValue(payload([mood(1, 'Happy', { aiConfidence: 0.5 })]));
    render(<MoodRatings songId={7} />);
    const box = await screen.findByLabelText('Your Happy match, number from 0 to 100');
    fireEvent.change(box, { target: { value: '101' } });
    expect((await screen.findByRole('alert')).textContent).toMatch(/between 0 and 100/);
    expect(screen.getByRole('button', { name: /Save/ }).disabled).toBe(true);
    fireEvent.change(box, { target: { value: '12.345' } });
    expect(screen.getByRole('alert').textContent).toMatch(/two decimal/);
    fireEvent.change(box, { target: { value: '92.5' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save 1 rating' }).disabled).toBe(false);
  });

  it('saves changed ratings in one request and reloads', async () => {
    api.moodRatings.mockResolvedValue(payload([mood(1, 'Happy', { aiConfidence: 0.5, mine: { matchPercentage: 40, reviewText: null } }),
      mood(2, 'Calm', { aiConfidence: 0.3 })]));
    api.saveMoodRatings.mockResolvedValue({ songId: 7, saved: [{ moodId: 1, created: false }, { moodId: 2, created: true }] });
    render(<MoodRatings songId={7} />);
    fireEvent.change(await screen.findByLabelText('Your Happy match, number from 0 to 100'), { target: { value: '55' } });
    fireEvent.change(screen.getByLabelText('Your Calm match, percent'), { target: { value: '80.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save 2 ratings' }));
    await waitFor(() => expect(api.saveMoodRatings).toHaveBeenCalledWith(7, [{ moodId: 1, matchPercentage: 55 }, { moodId: 2, matchPercentage: 80.5 }]));
    await waitFor(() => expect(api.moodRatings).toHaveBeenCalledTimes(2));
    expect(toast.success).toHaveBeenCalled();
  });

  it('shows a save error from the API and keeps the edits', async () => {
    api.moodRatings.mockResolvedValue(payload([mood(1, 'Happy', { aiConfidence: 0.5 })]));
    api.saveMoodRatings.mockRejectedValue(Object.assign(new Error('Mood ratings are paused in a private session.'), { code: 'INCOGNITO_ACTIVE' }));
    render(<MoodRatings songId={7} />);
    const box = await screen.findByLabelText('Your Happy match, number from 0 to 100');
    fireEvent.change(box, { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save 1 rating' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/paused/);
    expect(box.value).toBe('30');
  });

  it('shows an error state with retry when loading fails', async () => {
    api.moodRatings.mockRejectedValueOnce(Object.assign(new Error('Song not found.'), { code: 'NOT_FOUND' }));
    render(<MoodRatings songId={7} />);
    expect(await screen.findByText('Song not found.')).toBeTruthy();
    api.moodRatings.mockResolvedValue(payload([mood(1, 'Happy')]));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('How well does it fit each mood?');
  });

  it('disables editing in a private session', async () => {
    api.moodRatings.mockResolvedValue(payload([mood(1, 'Happy', { aiConfidence: 0.5 })], { privateSession: true }));
    render(<MoodRatings songId={7} />);
    expect(await screen.findByText(/paused during a private session/)).toBeTruthy();
    expect(screen.getByLabelText('Your Happy match, percent').disabled).toBe(true);
  });
});

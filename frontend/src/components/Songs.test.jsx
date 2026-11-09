import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const player = { play: vi.fn(), toggle: vi.fn(), playNext: vi.fn(), isPlaying: () => false, isCurrent: () => false, current: null };
const toast = { info: vi.fn(), success: vi.fn(), error: vi.fn() };
let incognito = false;
vi.mock('../hooks/usePlayer', async (orig) => ({ ...(await orig()), usePlayer: () => player }));
vi.mock('../hooks/useToast', () => ({ useToast: () => toast }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { incognito } }) }));
vi.mock('../services/api', () => ({ api: { dismiss: vi.fn(() => Promise.resolve({ dismissed: true })), like: vi.fn(), playlists: vi.fn(() => Promise.resolve([])) } }));

const { TrackList, PlaybackBadge } = await import('./Songs');
const { api } = await import('../services/api');

const song = (id, playback, extra = {}) => ({
  id, title: `Song ${id}`, durationSec: 200, explicit: false, moods: ['Calm'], cover: ['#111111', '#222222'],
  artist: { id: 1, name: 'Artist' }, album: null, language: { id: 1, name: 'Telugu' }, genre: { id: 1, name: 'Lo-fi' }, playback, ...extra,
});
const PLAYABLE = { playable: true, type: 'GENERATED_SKETCH', source: 'MUSE_SKETCH', demo: true };
const META = { playable: false, type: null, source: null, demo: false };
const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('TrackList', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); incognito = false; });

  it('labels a metadata-only song and disables its play control', () => {
    wrap(<TrackList songs={[song(1, PLAYABLE), song(2, META)]} />);
    expect(screen.getByText('Metadata only')).toBeTruthy();
    const off = screen.getByRole('button', { name: 'Song 2 — metadata only, cannot be played' });
    expect(off.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Play Song 1' }));
    expect(player.play).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), expect.objectContaining({ origin: 'HOME' }));
  });

  it('"Not for me" calls the API with the list’s batch and removes the row', async () => {
    wrap(<TrackList songs={[song(1, PLAYABLE), song(2, PLAYABLE)]} batchId={77} dismissable />);
    fireEvent.click(screen.getByRole('button', { name: 'Not for me: stop recommending Song 1' }));
    await waitFor(() => expect(screen.queryByText('Song 1')).toBeNull());
    expect(api.dismiss).toHaveBeenCalledWith(1, 77);
    expect(screen.getByText('Song 2')).toBeTruthy();
  });

  it('hides "Not for me" during a private session', () => {
    incognito = true;
    wrap(<TrackList songs={[song(1, PLAYABLE)]} batchId={77} dismissable />);
    expect(screen.queryByRole('button', { name: /Not for me/ })).toBeNull();
  });

  it('renders nothing for an empty list', () => {
    const { container } = wrap(<TrackList songs={[]} />);
    expect(container.textContent).toBe('');
  });
});

describe('PlaybackBadge', () => {
  afterEach(cleanup);
  it('says demo sketch only in verbose mode, and nothing when playback is unknown', () => {
    wrap(<><PlaybackBadge song={song(1, PLAYABLE)} /><PlaybackBadge song={song(2, PLAYABLE)} verbose /><PlaybackBadge song={song(3, undefined)} /></>);
    expect(screen.getAllByText('Demo sketch')).toHaveLength(1);
  });
});

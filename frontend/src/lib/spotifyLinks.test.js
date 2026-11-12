import { describe, expect, it } from 'vitest';
import { spotifySearchUrl } from './spotifyLinks';

describe('Spotify external hand-off URL', () => {
  it('opens Spotify search for a song query without calling Spotify APIs', () => {
    expect(spotifySearchUrl('A R Rahman Roja')).toBe('https://open.spotify.com/search/A%20R%20Rahman%20Roja');
  });
  it('opens Spotify home for an empty query', () => {
    expect(spotifySearchUrl('')).toBe('https://open.spotify.com/');
  });
});

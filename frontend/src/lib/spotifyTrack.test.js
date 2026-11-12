import { describe, expect, it } from 'vitest';
import { toSpotifySong } from './spotifyTrack';

const track = {
  id: '4uLU6hMCjMI75M1A2tKUQC',
  title: 'Example track',
  artist: 'Example artist',
  durationMs: 205000,
  album: { title: 'Example album', artworkUrl: 'https://i.scdn.co/image/example' },
  spotifyUrl: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
  embedUrl: 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC',
  playableInMarket: true,
};

describe('toSpotifySong', () => {
  it('maps Spotify catalogue metadata to LOOP queue metadata without audio URLs', () => {
    const song = toSpotifySong(track);
    expect(song.title).toBe('Example track');
    expect(song.artist.name).toBe('Example artist');
    expect(song.durationSec).toBe(205);
    expect(song.playback.type).toBe('SPOTIFY_EMBED');
    expect(song.spotify.embedUrl).toContain('/embed/track/');
    expect(song).not.toHaveProperty('audioUrl');
  });

  it('does not queue tracks explicitly marked unavailable in the current market', () => {
    expect(toSpotifySong({ ...track, playableInMarket: false })).toBeNull();
  });

  it('does not queue incomplete metadata-only tracks', () => {
    expect(toSpotifySong({ id: track.id, title: track.title })).toBeNull();
  });
});

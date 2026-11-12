import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { usePlayer } from '../hooks/usePlayer';
import { getSpotifyAccessToken, isSpotifyConnected } from '../lib/spotifyAuth';
import { toSpotifySong } from '../lib/spotifyTrack';
import { PageHead, ErrorState, ListSkeleton, Empty } from '../components/ui';
import * as Icon from '../components/Icons';

function TrackRow({ track, queue }) {
  const player = usePlayer();
  const song = useMemo(() => toSpotifySong(track), [track]);
  const current = song && player.isCurrent(song.id);
  const play = () => song && player.play(song, { queue: queue.map(toSpotifySong).filter(Boolean), origin: 'SEARCH' });
  return <article className="world-track">
    <button type="button" className="world-artwork-button" onClick={play} disabled={!song} aria-label={`Open ${track.title} in LOOP player`}>
      {track.album?.artworkUrl ? <img className="world-artwork" src={track.album.artworkUrl} alt={`${track.album?.title || track.title} artwork`} loading="lazy" /> : <span className="world-artwork"><Icon.Music /></span>}
    </button>
    <div className="world-track-copy"><strong title={track.title}>{track.title}</strong><span>{track.artist} · {track.album?.title || 'Single'}</span><small>Spotify · {Math.floor((track.durationMs || 0) / 60000)}:{String(Math.floor(((track.durationMs || 0) % 60000) / 1000)).padStart(2, '0')} · <a href={track.spotifyUrl} target="_blank" rel="noreferrer">Open on Spotify ↗</a></small></div>
    <button className="world-play" disabled={!song} onClick={play} aria-label={`Open official player for ${track.title}`}>{current ? <Icon.Music /> : <Icon.Play />}</button>
  </article>;
}

export default function Search() {
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') || '').trim();
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(isSpotifyConnected());
  const [input, setInput] = useState(q);

  useEffect(() => setInput(q), [q]);
  useEffect(() => {
    let active = true;
    if (q.length < 2) { setTracks([]); setError(''); setLoading(false); return () => { active = false; }; }
    setLoading(true); setError('');
    (async () => {
      try {
        const token = await getSpotifyAccessToken();
        if (!token) { if (active) { setConnected(false); setTracks([]); } return; }
        setConnected(true);
        const result = await api.spotifySearch(q, token, 20, 'IN', true);
        if (active) setTracks(Array.isArray(result?.tracks) ? result.tracks : []);
      } catch (reason) {
        if (active) setError(reason?.message || 'Spotify search failed. Check your Spotify connection and LOOP database login.');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [q]);

  const submit = (event) => { event.preventDefault(); const value = input.trim(); if (value.length >= 2) setParams({ q: value }); };

  return <div className="page stack" style={{ '--gap': 20 }}>
    <PageHead kicker="SPOTIFY CATALOGUE · MYSQL SEARCH HISTORY" title="Search music" />
    <form className="search-box" role="search" onSubmit={submit} style={{ width: '100%', maxWidth: 780 }}>
      <Icon.Search /><input aria-label="Search Spotify songs" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Song, artist or album worldwide…" /><button className="btn primary sm" disabled={input.trim().length < 2}>Search</button>
    </form>
    {!connected && <section className="card stack"><h2>Connect Spotify first</h2><p className="small soft">Add your Client ID in LOOP Settings and complete Spotify sign-in. Search terms and result counts are recorded in the LOOP MySQL database after a successful search.</p><div><Link className="btn primary" to="/settings#spotify">Open Spotify settings</Link></div></section>}
    {q.length >= 2 && <div className="row between wrap"><p className="small muted">Results for <strong>{q}</strong></p><span className="tiny muted">{tracks.length} tracks</span></div>}
    {loading && <ListSkeleton n={7} />}
    {error && <ErrorState error={error} onRetry={() => setParams({ q })} />}
    {!loading && connected && q.length >= 2 && !error && tracks.length === 0 && <Empty title="No Spotify tracks found">Try a different song title, artist or spelling.</Empty>}
    {!loading && tracks.length > 0 && <section className="stack" style={{ '--gap': 8 }}>{tracks.map((track) => <TrackRow key={track.id} track={track} queue={tracks} />)}</section>}
    {q.length < 2 && <div className="grid-3">{[['Global top hits','global top hits'],['Telugu hits','Telugu hits'],['Hindi hits','Hindi hits'],['Tamil hits','Tamil hits'],['K-pop','K-pop hits'],['Afrobeats','Afrobeats hits']].map(([label, query]) => <button className="card stack" style={{ textAlign: 'left' }} key={label} onClick={() => setParams({ q: query })}><strong>{label}</strong><span className="tiny muted">Search on Spotify ↗</span></button>)}</div>}
    <p className="tiny muted">Playback is provided by Spotify’s official embedded player. Track availability and full-length playback depend on Spotify’s embed experience, account, and market. LOOP does not download or extract audio.</p>
  </div>;
}

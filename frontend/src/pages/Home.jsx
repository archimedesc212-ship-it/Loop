import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { usePlayer } from '../hooks/usePlayer';
import { getSpotifyAccessToken, isSpotifyConnected } from '../lib/spotifyAuth';
import { toSpotifySong } from '../lib/spotifyTrack';
import { PageHead, ErrorState, ListSkeleton } from '../components/ui';
import * as Icon from '../components/Icons';

const WORLDS = [
  ['Global Top Hits', 'global top hits'], ['Bollywood', 'Bollywood hits'], ['Telugu', 'Telugu hits'],
  ['Hindi', 'Hindi hits'], ['Tamil', 'Tamil hits'], ['Punjabi', 'Punjabi hits'], ['K-pop', 'K-pop hits'],
  ['J-pop', 'J-pop hits'], ['Afrobeats', 'Afrobeats hits'], ['Latin', 'Latin pop hits'],
  ['Arabic', 'Arabic pop'], ['Brazilian', 'Brazilian hits'],
];

function TrackCard({ track, queue }) {
  const player = usePlayer();
  const song = useMemo(() => toSpotifySong(track), [track]);
  const play = () => song && player.play(song, { queue: queue.map(toSpotifySong).filter(Boolean), origin: 'HOME' });
  return (
    <article className="card stack" style={{ minWidth: 0, gap: 10 }}>
      <button type="button" className="spotify-home-track-art" onClick={play} disabled={!song} aria-label={`Open ${track.title} in LOOP player`}>
        {track.album?.artworkUrl ? <img src={track.album.artworkUrl} alt={`${track.album.title || track.title} cover art`} loading="lazy" /> : <span><Icon.Music /></span>}
      </button>
      <div style={{ minWidth: 0 }}>
        <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.title}</strong>
        <span className="small muted" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.artist}</span>
        <span className="tiny muted">Spotify · {Math.floor((track.durationMs || 0) / 60000)}:{String(Math.floor(((track.durationMs || 0) % 60000) / 1000)).padStart(2, '0')}</span>
      </div>
      <button className="btn primary sm" type="button" onClick={play} disabled={!song}><Icon.Play /> Open player in LOOP</button>
      <a className="tiny link" href={track.spotifyUrl} target="_blank" rel="noreferrer">Listen on Spotify ↗</a>
    </article>
  );
}

export default function Home() {
  const player = usePlayer();
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(isSpotifyConnected());
  const [featuredIndex, setFeaturedIndex] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError('');
      try {
        const token = await getSpotifyAccessToken();
        if (!token) { if (active) { setConnected(false); setTracks([]); } return; }
        setConnected(true);
        const results = await api.spotifySearch('global hits', token, 12, 'IN', false);
        if (active) setTracks(Array.isArray(results?.tracks) ? results.tracks : []);
      } catch (reason) {
        if (active) setError(reason?.message || 'Spotify recommendations could not be loaded.');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (tracks.length < 2) { setFeaturedIndex(0); return undefined; }
    const timer = window.setInterval(() => setFeaturedIndex((current) => (current + 1) % tracks.length), 9000);
    return () => window.clearInterval(timer);
  }, [tracks.length]);

  const featured = tracks[featuredIndex] || tracks[0];
  const queue = tracks.map(toSpotifySong).filter(Boolean);
  const playFeatured = () => {
    const song = toSpotifySong(featured);
    if (song) player.play(song, { queue, origin: 'HOME' });
  };

  return (
    <div className="page stack" style={{ '--gap': 26 }}>
      <header className="home-masthead">
        <div><span className="home-eyebrow">LOOP · DBMS MUSIC PROJECT</span><h1>Music, organised.</h1><p>Search the Spotify catalogue, open official track players, and manage your personal library.</p></div>
        <nav className="home-shortcuts"><Link to="/search">Search <Icon.Arrow /></Link><Link to="/library">Library <Icon.Arrow /></Link><Link to="/database">Database <Icon.Arrow /></Link></nav>
      </header>

      <section className="hero home-discovery-hero" style={{ display: 'grid', gap: 14 }}>
        <span className="home-hero-kicker">SPOTIFY MUSIC CATALOGUE</span>
        <h2 className="display">Find a song. Open its official player.</h2>
        <p className="lead">LOOP stores your accounts, searches, playlists and activity in MySQL. Spotify supplies catalogue metadata and its official embedded listening experience.</p>
        <div className="row wrap">
          <Link className="btn primary" to="/search">Search songs <Icon.Search /></Link>
          <Link className="btn ghost" to="/settings#spotify">Connect Spotify <Icon.Arrow /></Link>
        </div>
      </section>

      {!connected && <section className="card stack">
        <h2>Connect Spotify to load music</h2>
        <p className="small soft">Add your Spotify Client ID in Settings, then connect your Spotify account. Your Spotify access token is kept in this browser session and is not stored in MySQL.</p>
        <div><Link className="btn primary" to="/settings#spotify">Open Spotify settings</Link></div>
      </section>}
      {error && <ErrorState error={error} onRetry={() => window.location.reload()} />}
      {loading ? <ListSkeleton n={4} /> : tracks.length > 0 && <>
        <section className="section stack" style={{ '--gap': 12 }}>
          <div className="section-head"><div><h2 className="section-title">Worldwide spotlight</h2><p className="small muted">Selected from Spotify search results. Artwork links directly to Spotify.</p></div><Link className="small link" to="/search?q=global%20hits">More global music</Link></div>
          {featured && <div className="spotify-feature-banner card" aria-live="polite">
            <button type="button" className="spotify-feature-art" onClick={playFeatured} aria-label={`Open ${featured.title} in LOOP player`}>
              {featured.album?.artworkUrl ? <img src={featured.album.artworkUrl} alt={`${featured.album?.title || featured.title} cover art`} /> : <span><Icon.Music /></span>}
            </button>
            <div className="spotify-feature-copy">
              <span className="tiny muted">WORLDWIDE SPOTLIGHT · SPOTIFY</span>
              <h2>{featured.title}</h2>
              <p className="soft">{featured.artist} · {featured.album?.title || 'Spotify catalogue'}</p>
              <div className="row wrap">
                <button className="btn primary" onClick={playFeatured}><Icon.Play /> Open player in LOOP</button>
                <a className="btn ghost" href={featured.spotifyUrl} target="_blank" rel="noreferrer">Spotify track ↗</a>
              </div>
              <span className="tiny muted">Artwork and catalogue metadata provided by Spotify. Select the official embedded player to listen.</span>
              <div className="spotify-feature-dots" aria-label="Choose featured track">
                {tracks.slice(0, 8).map((track, index) => <button key={track.id} type="button" className={index === featuredIndex ? 'active' : ''} aria-label={`Show featured track ${index + 1}: ${track.title}`} aria-pressed={index === featuredIndex} onClick={() => setFeaturedIndex(index)} />)}
              </div>
            </div>
          </div>}
        </section>
        <section className="section">
          <div className="section-head"><div><h2 className="section-title">Global picks</h2><p className="small muted">Search results from Spotify, not invented chart rankings.</p></div><Link className="small link" to="/search?q=global%20hits">Browse all</Link></div>
          <div className="grid-4">{tracks.slice(0, 8).map((track) => <TrackCard key={track.id} track={track} queue={tracks} />)}</div>
        </section>
      </>}

      <section className="section">
        <div className="section-head"><div><h2 className="section-title">Explore worldwide</h2><p className="small muted">Regional discovery shortcuts. Each opens Spotify catalogue search.</p></div></div>
        <div className="world-discovery-grid">{WORLDS.map(([label, query]) => <Link key={label} className="world-discovery-tile" to={`/search?q=${encodeURIComponent(query)}`}>{label}<Icon.Arrow /></Link>)}</div>
      </section>

      <section className="section">
        <div className="section-head"><div><h2 className="section-title">DBMS project modules</h2><p className="small muted">The database is the system of record for LOOP users and activity.</p></div><Link to="/database" className="small link">Explore schema</Link></div>
        <div className="grid-3">
          <Link className="card stack" to="/database"><strong>Normalised catalogue schema</strong><span className="small muted">Entities, primary keys, foreign keys and relationships.</span></Link>
          <Link className="card stack" to="/library"><strong>Relational playlists</strong><span className="small muted">Users, playlists and playlist-song relationships.</span></Link>
          <Link className="card stack" to="/database"><strong>Queries, views & triggers</strong><span className="small muted">Inspect the SQL design, reporting views and transactional logic.</span></Link>
        </div>
      </section>
    </div>
  );
}

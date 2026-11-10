import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { SongCard } from '../components/Songs';
import { MoodTiles, FeelInput, HERO_MOODS } from '../components/Rec';
import { ShelfSkeleton, Empty, ErrorState } from '../components/ui';
import { Arrow } from '../components/Icons';

function Shelf({ title, sub, to, state, origin = 'HOME' }) {
  const { data, error, loading, reload } = state;
  const songs = data && (Array.isArray(data) ? data : data.songs);
  return (
    <section className="section">
      <div className="section-head">
        <div><h2 className="section-title">{title}</h2>{sub && <p className="small muted" style={{ marginTop: 2 }}>{sub}</p>}</div>
        {to && <Link to={to} className="small link">See all</Link>}
      </div>
      {loading && !data && <ShelfSkeleton />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {songs && songs.length === 0 && <Empty title="Nothing here yet">Try Discover to find music for your mood.</Empty>}
      {songs?.length > 0 && <div className="shelf">{songs.slice(0, 10).map((song) => (
        <SongCard key={song.id} song={song} queue={songs} origin={origin} batchId={data?.batchId} reason={song.reasons?.[0]?.text} />
      ))}</div>}
    </section>
  );
}

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const moods = useApi(() => api.moods(), []);
  const daily = useApi(() => api.recDaily(12), [user.incognito]);
  const popular = useApi(() => api.trending({ limit: 12 }), []);
  const recent = useApi(() => api.history(10), [user.incognito]);
  const [selected, setSelected] = useState([]);
  const [text, setText] = useState('');
  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const openDiscover = () => navigate('/mood', { state: { text: text.trim(), moodIds: selected } });
  const toggleMood = (id) => setSelected((current) => current.includes(id)
    ? current.filter((value) => value !== id)
    : [...current, id].slice(-3));

  return (
    <div className="page">
      <section className="hero">
        <div className="stack" style={{ '--gap': '16px', maxWidth: 760 }}>
          <div className="soft">{greeting}, {user.displayName.split(' ')[0]}</div>
          <h1 className="display">What would you like to listen to?</h1>
          <p className="lead">Choose a mood or describe how you feel. LOOP will find tracks that fit.</p>
          <FeelInput value={text} onChange={setText} onSubmit={openDiscover} placeholder="Try: calm music for studying…" />
          {moods.data && <MoodTiles moods={moods.data} only={HERO_MOODS.slice(0, 8)} selected={selected} onToggle={toggleMood} />}
          <div className="row wrap">
            <button className="btn primary" onClick={openDiscover} disabled={!selected.length && text.trim().length < 2}>Find music <Arrow /></button>
            <Link className="btn ghost" to="/search">Browse all music</Link>
          </div>
        </div>
      </section>

      <Shelf title="Made for you" sub="A daily mix based on your listening and mood preferences." to="/mix/daily" state={daily} />
      <Shelf title="Recently played" sub="Pick up where you left off." state={recent} />
      <Shelf title="Popular in LOOP" sub="Popular songs from the curated recommendation catalogue." to="/search?q=popular" state={popular} />

      <section className="section">
        <div className="section-head"><div><h2 className="section-title">Explore music worldwide</h2><p className="small muted">Search music across international catalogues, languages and genres.</p></div><Link to="/search" className="small link">Open global search</Link></div>
        <div className="world-discovery-grid">
          {[
            ['Bollywood', 'Bollywood hits'], ['K-pop', 'K-pop'], ['Afrobeats', 'Afrobeats'], ['Latin pop', 'Latin pop'],
            ['Arabic', 'Arabic pop'], ['J-pop', 'Japanese pop'], ['Global hits', 'global hits'], ['Rock classics', 'classic rock'],
          ].map(([label, query]) => <Link key={label} className="world-discovery-tile" to={`/search?q=${encodeURIComponent(query)}`}>{label}<Arrow /></Link>)}
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2 className="section-title">Your music</h2></div>
        <div className="grid-3">
          <Link to="/library" className="card stack"><strong>Playlists</strong><span className="small muted">Create and manage your music lists.</span></Link>
          <Link to="/library" state={{ tab: 'liked' }} className="card stack"><strong>Liked songs</strong><span className="small muted">Keep the tracks you love in one place.</span></Link>
          <Link to="/search" className="card stack"><strong>Find something new</strong><span className="small muted">Search tracks, artists and genres.</span></Link>
        </div>
      </section>
    </div>
  );
}

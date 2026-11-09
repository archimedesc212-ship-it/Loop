import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { onPlayFinished } from '../hooks/usePlayer';
import { SongCard } from '../components/Songs';
import { WorldArt } from '../components/Art';
import { MoodTiles, FeelInput, HERO_MOODS } from '../components/Rec';
import { ShelfSkeleton, Empty, ErrorState } from '../components/ui';
import { Arrow } from '../components/Icons';

function Shelf({ title, sub, to, state, origin, reasonOf, emptyText }) {
  const { data, error, loading, reload } = state;
  const list = data && (Array.isArray(data) ? data : data.songs);
  return (
    <section className="section">
      <div className="section-head">
        <div><h2 className="section-title">{title}</h2>{sub && <p className="small muted" style={{ marginTop: 2 }}>{typeof sub === 'function' ? sub(data) : sub}</p>}</div>
        {to && <Link to={to} className="small link">See all</Link>}
      </div>
      {loading && !data && <ShelfSkeleton />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {list && list.length === 0 && <Empty title="Nothing here yet">{emptyText || (data && data.message)}</Empty>}
      {list && list.length > 0 && (
        <div className="shelf">
          {list.slice(0, 12).map((s) => <SongCard key={s.id} song={s} queue={list} origin={origin} batchId={data.batchId} reason={reasonOf ? reasonOf(s) : undefined} />)}
        </div>
      )}
    </section>
  );
}

const MODES = [
  { to: '/mix/context/STUDY', emoji: '📚', name: 'Focus', blurb: 'Wordless and steady' },
  { to: '/mix/context/WORKOUT', emoji: '🏋️', name: 'Workout', blurb: 'High energy, high tempo' },
  { to: '/mix/context/RELAX', emoji: '🌿', name: 'Chill', blurb: 'Slow down' },
  { to: '/mix/context/NIGHT', emoji: '🌙', name: 'Late night', blurb: 'Low light, dreamy' },
  { to: '/mix/discovery', emoji: '🧭', name: 'Discovery', blurb: 'Never played before' },
  { to: '/mix/recovery', emoji: '🌤️', name: 'Mood recovery', blurb: 'From low to bright' },
  { to: '/mix/regional', emoji: '🗺️', name: 'Your language', blurb: 'Regional discovery' },
  { to: '/mix/context/TRAVEL', emoji: '🛣️', name: 'Road trip', blurb: 'Forward-moving' },
];

export default function Home() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [tick, setTick] = useState(0);
  useEffect(() => onPlayFinished(() => setTick((t) => t + 1)), []);
  const moods = useApi(() => api.moods(), []);
  const daily = useApi(() => api.recDaily(16), [user.incognito]);
  const similar = useApi(() => api.recSimilar(undefined, 12), [user.incognito]);
  const trending = useApi(() => api.trending({ limit: 12 }), []);
  const recent = useApi(() => api.history(12), [tick, user.incognito]);
  const genres = useApi(() => api.genres(), []);
  const world = useApi(() => api.world(), []);
  const [selected, setSelected] = useState([]);
  const [text, setText] = useState('');
  const hour = new Date().getHours();
  const greet = hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const go = (state) => nav('/mood', { state });

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-art">{world.data && <WorldArt theme={world.data.world.theme} />}</div>
        <div className="stack" style={{ '--gap': '18px', maxWidth: 760 }}>
          <div className="soft">{greet}, {user.displayName.split(' ')[0]}</div>
          <h1 className="display">How are you feeling today?</h1>
          <FeelInput value={text} onChange={setText} onSubmit={() => go({ text, moodIds: selected })} />
          {moods.data && (
            <MoodTiles moods={moods.data} only={HERO_MOODS} selected={selected}
              onToggle={(id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-4)))} />
          )}
          {selected.length > 0 && (
            <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => go({ moodIds: selected, text })}>
              Find {moods.data.filter((m) => selected.includes(m.id)).map((m) => m.name).join(' + ')}<Arrow />
            </button>
          )}
        </div>
      </section>

      <Shelf title="Recommended for you" sub={(d) => d && d.subtitle} to="/mix/daily" state={daily} origin="HOME"
        reasonOf={(s) => (s.reasons[0] ? s.reasons[0].text : null)} />

      <section className="section">
        <div className="section-head"><h2 className="section-title">Modes</h2></div>
        <div className="grid-4">
          {MODES.map((m) => (
            <Link key={m.to} to={m.to} className="card row" style={{ '--gap': '12px' }}>
              <span style={{ fontSize: '1.6rem' }} aria-hidden="true">{m.emoji}</span>
              <div><div style={{ fontWeight: 600 }}>{m.name}</div><div className="small muted">{m.blurb}</div></div>
            </Link>
          ))}
        </div>
      </section>

      {world.data && (
        <section className="section">
          <Link to="/world" className="hero" style={{ display: 'block', padding: 28 }}>
            <div className="hero-art"><WorldArt theme={world.data.world.theme} /></div>
            <div className="stack" style={{ '--gap': '8px', maxWidth: 560 }}>
              <span className="chip accent" style={{ alignSelf: 'flex-start' }}>Your MUSE World this week</span>
              <h2 className="display" style={{ fontSize: 'clamp(1.8rem, 3.6vw, 2.8rem)' }}>{world.data.world.title}</h2>
              <p className="soft">{world.data.world.description}</p>
              <span className="link small">Enter this world · {world.data.world.songCount} songs</span>
            </div>
          </Link>
        </section>
      )}

      <Shelf title={similar.data && similar.data.title ? similar.data.title : 'Because you liked…'} sub="Similar sound and mood" state={similar} origin="HOME"
        to={similar.data && similar.data.seed ? `/mix/similar/${similar.data.seed.id}` : undefined}
        emptyText="Rate a song 4★ or more, or like one, and MUSE will find songs that sound like it." />
      <Shelf title="Trending now" sub="Most momentum in the last 7 days across MUSE" state={trending} origin="HOME"
        reasonOf={(s) => (s.trend ? `${s.trend.plays} plays this week${s.trend.velocityPct !== null ? ` · ${s.trend.velocityPct > 0 ? '+' : ''}${Math.round(s.trend.velocityPct)}%` : ' · new'}` : null)} />
      <Shelf title="Recently played" state={recent} origin="LIBRARY" to="/library"
        emptyText={user.incognito ? 'Private sessions do not add to your history.' : 'Play something and it will appear here.'} />

      <section className="section">
        <div className="section-head"><h2 className="section-title">Popular genres</h2></div>
        {genres.data && (
          <div className="grid-4">
            {[...genres.data].sort((a, b) => b.plays - a.plays).slice(0, 8).map((g) => (
              <Link key={g.id} to={`/search?q=${encodeURIComponent(g.name)}`} className="card" style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${g.color} 26%, var(--surface)) 0%, var(--surface) 70%)` }}>
                <div style={{ fontWeight: 600 }}>{g.name}</div>
                <div className="small muted">{g.songs} songs · {g.plays} plays</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

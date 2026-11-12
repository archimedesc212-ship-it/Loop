import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { SongCard } from '../components/Songs';
import { MoodTiles, FeelInput, HERO_MOODS } from '../components/Rec';
import { ShelfSkeleton, Empty, ErrorState } from '../components/ui';
import { Arrow, Prev, Next, Spark, Play } from '../components/Icons';
import { usePlayer } from '../hooks/usePlayer';
import { searchYouTubeBrowser } from '../lib/youtubeBrowser';

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
  const player = usePlayer();
  const moods = useApi(() => api.moods(), []);
  const daily = useApi(() => api.recDaily(12), [user?.incognito]);
  const popular = useApi(() => api.trending({ limit: 12 }), []);
  const telugu = useApi(() => api.recRegional(1, 8), []);
  const hindi = useApi(() => api.recRegional(2, 8), []);
  const tamil = useApi(() => api.recRegional(3, 8), []);
  const recent = useApi(() => api.history(10), [user?.incognito]);
  const [selected, setSelected] = useState([]);
  const [text, setText] = useState('');
  const [featuredVideos, setFeaturedVideos] = useState([]);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const featuredVideo = featuredVideos[featuredIndex] || null;
  useEffect(() => {
    let active = true;
    const query = 'global music hits official music video';
    const loadSpotlight = async () => {
      let videos = [];
      try {
        const result = await api.youtubeSearch(query, 8);
        videos = Array.isArray(result?.videos) ? result.videos : [];
      } catch { /* use the key saved in Settings for a browser-side search */ }
      // A deployed API may be online but have no YouTube key configured. In
      // that case the Settings key is the source of truth for the Home banners.
      if (!videos.length) {
        try { videos = await searchYouTubeBrowser(query, 8); } catch { videos = []; }
      }
      if (!active) return;
      const usable = (Array.isArray(videos) ? videos : []).filter((video) => video?.thumbnailUrl && video?.externalId && video?.embedUrl && video.embeddable !== false);
      if (usable.length) { setFeaturedVideos(usable); setFeaturedIndex(0); }
      setFeaturedLoading(false);
    };
    loadSpotlight().catch(() => { if (active) setFeaturedLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (featuredVideos.length < 2) return undefined;
    const timer = window.setInterval(() => setFeaturedIndex((index) => (index + 1) % featuredVideos.length), 8500);
    return () => window.clearInterval(timer);
  }, [featuredVideos.length]);
  const playFeatured = (requestedVideo = featuredVideo) => {
    if (!requestedVideo) return;
    const queue = featuredVideos.map((video) => ({
      id: `yt-${video.externalId}`, title: video.title, artist: { name: video.channel || 'YouTube' },
      album: { title: 'Featured videos' }, durationSec: video.durationSec || 0, artworkUrl: video.thumbnailUrl,
      cover: ['#263d38', '#1a2228'], playback: { playable: true, type: 'YOUTUBE_EMBED' },
      youtube: { embedUrl: video.embedUrl, watchUrl: video.sourceUrl },
    }));
    const index = featuredVideos.findIndex((video) => video.externalId === requestedVideo.externalId);
    const song = index >= 0 ? queue[index] : null;
    if (song?.youtube?.embedUrl) player.play(song, { queue, origin: 'WORLD' });
    else navigate(`/search?q=${encodeURIComponent(requestedVideo.title)}`);
  };
  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const openDiscover = () => navigate('/mood', { state: { text: text.trim(), moodIds: selected } });
  const toggleMood = (id) => setSelected((current) => current.includes(id)
    ? current.filter((value) => value !== id)
    : [...current, id].slice(-3));

  return (
    <div className="page home-page">
      <header className="home-masthead">
        <div><span className="home-eyebrow">YOUR MUSIC, YOUR MOMENT</span><h1>{greeting}<span className="home-greeting-dot">.</span></h1><p>Pick up where you left off, or find something that fits right now.</p></div>
        <nav className="home-shortcuts" aria-label="Music shortcuts"><Link to="/search">Explore <Arrow /></Link><Link to="/library">Your library <Arrow /></Link></nav>
      </header>
      <section className="hero home-discovery-hero">
        <div className="stack" style={{ '--gap': '16px', maxWidth: 760 }}>
          <div className="soft home-hero-kicker"><Spark /> A soundtrack for right now</div>
          <h2 className="display">What would you like to listen to?</h2>
          <p className="lead">Choose a mood or describe how you feel. LOOP will find tracks that fit.</p>
          <FeelInput value={text} onChange={setText} onSubmit={openDiscover} placeholder="Try: calm music for studying…" />
          {moods.data && <MoodTiles moods={moods.data} only={HERO_MOODS.slice(0, 8)} selected={selected} onToggle={toggleMood} />}
          <div className="row wrap">
            <button className="btn primary" onClick={openDiscover} disabled={!selected.length && text.trim().length < 2}>Find music <Arrow /></button>
            <Link className="btn ghost" to="/search">Browse all music</Link>
          </div>
        </div>
      </section>

      <section className="online-feature-banner" aria-label="Worldwide featured music">
        {featuredVideo?.thumbnailUrl && <img className="online-feature-image" src={featuredVideo.thumbnailUrl} alt="" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />}
        <div className="online-feature-shade" />
        <div className="online-feature-content">
          <span className="online-feature-kicker">{featuredLoading ? 'DISCOVERING WORLDWIDE MUSIC' : 'WORLD MUSIC SPOTLIGHT'}</span>
          <h2>{featuredVideo?.title || 'Discover your next favourite song'}</h2>
          <p>{featuredVideo?.channel ? `Now featuring ${featuredVideo.channel}. This banner uses the matching YouTube thumbnail and opens the official player inside LOOP.` : 'Explore new sounds, artists and music from around the world.'}</p>
          <div className="row wrap">
            {featuredVideo && <button className="btn primary" type="button" onClick={playFeatured}><Play />Play featured</button>}
            <Link className="btn ghost" to={featuredVideo ? `/search?q=${encodeURIComponent(featuredVideo.title)}` : '/search?q=global%20music'}>Explore this sound</Link>
            <Link className="btn ghost" to="/assistant">Ask LOOP <Spark /></Link>
          </div>
          {featuredVideos.length > 1 && <div className="featured-controls" aria-label="Featured music carousel controls">
            <button className="icon-btn" type="button" onClick={() => setFeaturedIndex((index) => (index - 1 + featuredVideos.length) % featuredVideos.length)} aria-label="Previous featured video"><Prev /></button>
            <div className="featured-dots" role="group" aria-label="Choose featured video">{featuredVideos.map((video, index) => <button key={video.externalId} type="button" className={index === featuredIndex ? 'active' : ''} onClick={() => setFeaturedIndex(index)} aria-label={`Show featured item ${index + 1}`} aria-pressed={index === featuredIndex} />)}</div>
            <button className="icon-btn" type="button" onClick={() => setFeaturedIndex((index) => (index + 1) % featuredVideos.length)} aria-label="Next featured video"><Next /></button>
          </div>}
          <small className="online-feature-note">Each spotlight rotates to a different song-related YouTube thumbnail. Playback stays in YouTube’s official embedded player.</small>
        </div>
      </section>

      {featuredVideos.length > 0 && <section className="section world-video-section" aria-label="Worldwide music recommendations">
        <div className="section-head"><div><h2 className="section-title">Worldwide music picks</h2><p className="small muted">Music videos and official uploads discovered from YouTube’s music category.</p></div><Link className="small link" to="/search?q=global%20music%20hits">Explore worldwide</Link></div>
        <div className="world-video-grid">{featuredVideos.slice(0, 6).map((video) => <article className="world-video-card" key={video.externalId}>
          <button className="world-video-art" type="button" onClick={() => playFeatured(video)} aria-label={`Play ${video.title}`}>
            <img src={video.thumbnailUrl} alt="" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" /><span><Play /></span>
          </button>
          <strong title={video.title}>{video.title}</strong><small>{video.channel || 'YouTube'}</small>
        </article>)}</div>
      </section>}

      <div className="home-section-intro"><span className="home-eyebrow">CURATED FOR YOUR DAY</span><h2>Made to match your mood</h2><p>Your mixes, recent favourites and sounds worth discovering.</p></div>
      <Shelf title="Made for you" sub="A daily mix based on your listening and mood preferences." to="/mix/daily" state={daily} />
      <Shelf title="Recently played" sub="Pick up where you left off." state={recent} />
      <Shelf title="Popular in LOOP" sub="Popular songs from the curated recommendation catalogue." to="/search?q=popular" state={popular} />
      <Shelf title="Telugu hits" sub="A starter collection of Telugu film and independent music." to="/search?q=Telugu" state={telugu} />
      <Shelf title="Hindi hits" sub="A starter collection of Hindi film and pop music." to="/search?q=Hindi" state={hindi} />
      <Shelf title="Tamil hits" sub="A starter collection of Tamil film and independent music." to="/search?q=Tamil" state={tamil} />

      <section className="section">
        <div className="section-head"><div><h2 className="section-title">Explore music worldwide</h2><p className="small muted">Explore music across South Asia, East Asia, Africa, Europe, the Middle East and the Americas. Choose a region or sound to search worldwide.</p></div><Link to="/search" className="small link">Open global search</Link></div>
        <div className="world-discovery-grid">
          {[
            ['Global Top Hits', 'global top hits official music'], ['Bollywood', 'Bollywood latest hits'], ['Telugu', 'Telugu latest hit songs'], ['Hindi', 'Hindi pop hits'],
            ['Tamil', 'Tamil hit songs'], ['Punjabi', 'Punjabi pop hits'], ['K-pop', 'K-pop global hits'], ['J-pop', 'Japanese pop hits'],
            ['Afrobeats', 'Afrobeats global hits'], ['Amapiano', 'Amapiano hits'], ['Latin Pop', 'Latin pop hits'], ['Reggaeton', 'reggaeton hits'],
            ['Arabic Pop', 'Arabic pop hits'], ['Turkish Pop', 'Turkish pop hits'], ['French Pop', 'French pop hits'], ['Brazilian', 'Brazilian funk hits'],
            ['Indonesian', 'Indonesian pop hits'], ['Thai Pop', 'Thai pop hits'], ['Rock', 'global rock hits'], ['Electronic', 'electronic dance hits'],
          ].map(([label, query]) => <Link key={label} className="world-discovery-tile" to={`/search?q=${encodeURIComponent(query)}`}>{label}<Arrow /></Link>)}
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2 className="section-title">Your music</h2></div>
        <div className="grid-3">
          <Link to="/library" className="card stack"><strong>Playlists</strong><span className="small muted">Create and manage your music lists.</span></Link>
          <Link to="/library" state={{ tab: 'liked' }} className="card stack"><strong>Liked songs</strong><span className="small muted">Keep the tracks you love in one place.</span></Link>
          <Link to="/search" className="card stack"><strong>Find something new</strong><span className="small muted">Search tracks, artists and genres.</span></Link>
          <Link to="/assistant" className="card stack"><strong>Ask LOOP</strong><span className="small muted">Describe a moment and get a personalised mix.</span></Link>
        </div>
      </section>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import * as Icon from './Icons';
import { Cover } from './Art';
import { useAuth } from '../hooks/useAuth';
import { usePlayer } from '../hooks/usePlayer';
import { useToast } from '../hooks/useToast';
import { useOnline } from '../hooks/useOnline';
import { api } from '../services/api';
import { duration } from '../lib/format';
import { buildSearchSuggestions } from '../lib/searchSuggestions';
import { formatSleepRemaining } from '../lib/sleepTimer';
import { registerMoodColors, LikeButton } from './Songs';
import ImmersivePlayer from './ImmersivePlayer';

const NAV = [
  { to: '/', label: 'Home', short: 'Home', icon: Icon.Home, end: true },
  { to: '/mood', label: 'Discover', short: 'Discover', icon: Icon.Mood },
  { to: '/assistant', label: 'Assistant', short: 'Assistant', icon: Icon.Spark },
  { to: '/search', label: 'Search', short: 'Search', icon: Icon.Search },
  { to: '/library', label: 'Library', short: 'Library', icon: Icon.Library },
];

function Sidebar({ collapsed = false }) {
  const { user, can } = useAuth();
  const admin = ['health.view', 'catalog.write', 'pipeline.view', 'users.manage', 'artist.review'].some((permission) => can(permission));
  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`} aria-label="Main">
      <Link to="/" className="brand" title={collapsed ? 'LOOP' : undefined}><Icon.BrandMark className="brand-mark" /><span className="nav-text">LOOP</span></Link>
      {NAV.map(({ to, label, icon: Ico, end }) => (
        <NavLink key={to} to={to} end={end} className="nav-link" title={collapsed ? label : undefined}><Ico /><span className="nav-text">{label}</span></NavLink>
      ))}
      {admin && (
        <>
          <div className="nav-label">{user.roleName}</div>
          <NavLink to="/admin" className="nav-link" title={collapsed ? 'Admin' : undefined}><Icon.Shield /><span className="nav-text">Admin</span></NavLink>
        </>
      )}
      <NavLink to={user.role === 'ARTIST' ? '/artist/studio' : '/artist/apply'} className="nav-link" title={collapsed ? (user.role === 'ARTIST' ? 'Artist Studio' : 'Become an artist') : undefined}>{user.role === 'ARTIST' ? <Icon.Music /> : <Icon.Mic />}<span className="nav-text">{user.role === 'ARTIST' ? 'Artist Studio' : 'Become an artist'}</span></NavLink>
      <div className="sidebar-foot stack" style={{ '--gap': '10px' }}>
        <div className="row" style={{ '--gap': '10px' }}>
          <span className="avatar">{user.displayName.slice(0, 1)}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.displayName}</div>
            <div className="tiny muted">{user.email?.endsWith('@guest.loop.invalid') ? 'Guest listener' : (user.roleName || 'Listener')}</div>
          </div>
        </div>
        {user.email?.endsWith('@guest.loop.invalid') && <div className="row" style={{ '--gap': '4px' }}>
          <Link to="/login" className="btn ghost sm grow">Sign in</Link>
          <Link to="/register" className="btn primary sm grow">Create account</Link>
        </div>}
        <div className="row" style={{ '--gap': '4px' }}>
          <Link to="/settings" className="btn ghost sm grow"><Icon.Settings />Settings</Link>
        </div>
      </div>
    </aside>
  );
}

function MobileNav() {
  const items = NAV;
  return (
    <nav className="mobile-nav" aria-label="Main">
      {items.map(({ to, short, icon: Ico, end }) => (
        <NavLink key={to} to={to} end={end}><Ico />{short}</NavLink>
      ))}
    </nav>
  );
}

function PrivateToggle() {
  const { user, refresh } = useAuth();
  const player = usePlayer();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const flip = async () => {
    setBusy(true);
    try {
      await player.reset();
      if (user.incognito) {
        const r = await api.endIncognito();
        toast.success(`Private session ended — ${r.purged.events} plays and ${r.purged.lists} mixes deleted`);
      } else {
        await api.startIncognito();
        toast.info('Private session on. Mood ratings are paused, and this archive view does not collect playback history.');
      }
      await refresh();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <button className={`btn sm${user.incognito ? '' : ' ghost'}`} onClick={flip} disabled={busy}
      style={user.incognito ? { background: 'rgba(169,148,240,0.18)', color: 'var(--private)', borderColor: 'transparent' } : undefined}
      aria-pressed={user.incognito} title="Private session: listening is not saved to your profile">
      {user.incognito ? <Icon.EyeOff /> : <Icon.Eye />}<span>{user.incognito ? 'Private on' : 'Private'}</span>
    </button>
  );
}

function TopBar({ onToggleSidebar, sidebarCollapsed }) {
  const nav = useNavigate();
  const loc = useLocation();
  const [q, setQ] = useState(new URLSearchParams(loc.search).get('q') || '');
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const requestId = useRef(0);
  const { user } = useAuth();

  useEffect(() => {
    setQ(new URLSearchParams(loc.search).get('q') || '');
    setSuggestionsOpen(false);
  }, [loc.pathname, loc.search]);

  // Autocomplete uses LOOP's own catalogue only. Provider searches (especially
  // YouTube Data API) run after submit, avoiding a quota-consuming call per key.
  useEffect(() => {
    const term = q.trim();
    const token = ++requestId.current;
    if (term.length < 2) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      setActiveSuggestion(-1);
      return undefined;
    }
    setSuggestionsLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = await api.searchSuggestions(term);
        if (requestId.current !== token) return;
        setSuggestions(buildSearchSuggestions(result));
        setActiveSuggestion(-1);
      } catch {
        if (requestId.current === token) setSuggestions([]);
      } finally {
        if (requestId.current === token) setSuggestionsLoading(false);
      }
    }, 260);
    return () => {
      window.clearTimeout(timer);
      requestId.current += 1;
    };
  }, [q]);

  const submit = (e) => {
    e.preventDefault();
    if (q.trim().length >= 2) {
      setSuggestionsOpen(false);
      nav(`/search?q=${encodeURIComponent(q.trim())}`);
    }
  };
  const chooseSuggestion = (item) => {
    setQ(item.query);
    setSuggestionsOpen(false);
    setActiveSuggestion(-1);
    nav(`/search?q=${encodeURIComponent(item.query)}`);
  };
  const onSearchKeyDown = (e) => {
    if (e.key === 'Escape') { setSuggestionsOpen(false); setActiveSuggestion(-1); return; }
    if (!suggestionsOpen || !suggestions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestion((index) => (index + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestion((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (e.key === 'Enter' && activeSuggestion >= 0) {
      e.preventDefault();
      chooseSuggestion(suggestions[activeSuggestion]);
    }
  };

  return (
    <div className="topbar">
      <button type="button" className="icon-btn sidebar-toggle hide-sm" onClick={onToggleSidebar} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-pressed={sidebarCollapsed} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}><Icon.Menu /></button>
      <form className="search-box" onSubmit={submit} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setSuggestionsOpen(false); }} role="search" autoComplete="off">
        <Icon.Search aria-hidden="true" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setSuggestionsOpen(true); }}
          onFocus={() => setSuggestionsOpen(true)}
          onKeyDown={onSearchKeyDown}
          placeholder="Search songs, artists, albums worldwide…"
          aria-label="Search songs, artists and albums"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={suggestionsOpen && q.trim().length >= 2}
          aria-controls="loop-search-suggestions"
          aria-activedescendant={activeSuggestion >= 0 ? `loop-search-option-${activeSuggestion}` : undefined}
        />
        {suggestionsOpen && q.trim().length >= 2 && (
          <div className="search-suggestions" id="loop-search-suggestions" role="listbox" aria-label="Search suggestions">
            {suggestionsLoading && <div className="search-suggestion-status" role="status">Finding songs and artists…</div>}
            {!suggestionsLoading && suggestions.length === 0 && <div className="search-suggestion-status">No catalogue suggestions. Press Enter to search worldwide.</div>}
            {suggestions.map((item, index) => (
              <button
                type="button"
                role="option"
                aria-selected={activeSuggestion === index}
                id={`loop-search-option-${index}`}
                key={item.key}
                className={`search-suggestion${activeSuggestion === index ? ' active' : ''}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseSuggestion(item)}
              >
                <span className="search-suggestion-icon" aria-hidden="true">{item.kind === 'Song' ? '♫' : item.kind === 'Artist' ? '♙' : '▤'}</span>
                <span className="search-suggestion-copy"><strong>{item.title}</strong><small>{item.detail}</small></span>
                <span className="search-suggestion-kind">{item.kind}</span>
              </button>
            ))}
            <button type="submit" className="search-suggestion search-suggestion-all">
              <span className="search-suggestion-icon" aria-hidden="true">⌕</span>
              <span className="search-suggestion-copy"><strong>Search all music sources</strong><small>YouTube · Apple Music · LOOP</small></span>
              <span className="search-suggestion-kind">Enter</span>
            </button>
          </div>
        )}
      </form>
      <div className="grow" />
      <PrivateToggle />
      <Link to="/settings" className="avatar mobile-only" aria-label="Settings">{user.displayName.slice(0, 1)}</Link>
    </div>
  );
}

function QueuePanel({ onClose }) {
  const p = usePlayer();
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.querySelector('button')?.focus();
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="queue-panel" role="dialog" aria-label="Play queue" ref={ref}>
      <div className="row between" style={{ marginBottom: 8 }}>
        <strong>Up next</strong>
        <button className="icon-btn" onClick={onClose} aria-label="Close queue"><Icon.X /></button>
      </div>
      <ol className="queue-list">
        {p.queue.map((s, i) => (
          <li key={`${s.id}-${i}`} className={i === p.index ? 'on' : ''}>
            <button className="queue-item" onClick={() => p.jumpTo(i)} disabled={i === p.index} aria-current={i === p.index ? 'true' : undefined}>
              <span className="num tiny muted">{i + 1}</span>
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="q-title">{s.title}</span>
                <span className="tiny muted">{s.artist.name}{s.playback?.type === 'APPLE_MUSIC_LOOKUP' ? ' · Apple Music' : s.playback && s.playback.playable === false ? ' · metadata only' : ''}</span>
              </span>
            </button>
            {i !== p.index && <button className="icon-btn" onClick={() => p.removeAt(i)} aria-label={`Remove ${s.title} from the queue`}><Icon.X width={16} height={16} /></button>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function mediaNote(media, incognito) {
  const where = incognito ? ' · private, not saved' : '';
  if (!media) return where.slice(3) || '';
  if (media.demo) return `Demo sketch (not the recording)${where}`;
  return `${media.label}${media.attribution ? ` · ${media.attribution}` : ''}${where}`;
}

function PlayerBar({ onOpenImmersive }) {
  const p = usePlayer();
  const { user } = useAuth();
  const [queueOpen, setQueueOpen] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  const closeQueue = useCallback(() => setQueueOpen(false), []);
  const s = p.current;
  if (!s) return null;
  return (
    <>
      <div className={`player${user.incognito ? ' private' : ''}`} role="region" aria-label="Player">
        <div className="now">
          {s.artworkUrl || p.media?.artworkUrl ? <img className="cover player-artwork" src={s.artworkUrl || p.media.artworkUrl} alt="" /> : <Cover colors={s.cover} seed={s.album ? (Number(s.album.id) || 1) * 31 + (Number(s.id) || 1) : (Number(s.id) || 1)} />}
          <div style={{ minWidth: 0 }}>
            {(String(s.id).startsWith('apple-') || String(s.id).startsWith('yt-'))
              ? <strong style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</strong>
              : <Link to={`/song/${s.id}`} style={{ fontWeight: 600, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</Link>}
            <div className="tiny muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={mediaNote(p.media, user.incognito)}>
              {s.artist.name} · {mediaNote(p.media, user.incognito)}
            </div>
          </div>
          {!(String(s.id).startsWith('apple-') || String(s.id).startsWith('yt-')) && <span className="hide-sm"><LikeButton song={s} /></span>}
        </div>
        {p.externalPlayback ? (
          <div className="center external-player-center">
            <div className="controls">
              <button className="icon-btn" onClick={p.prev} aria-label="Previous"><Icon.Prev /></button>
              <span className="chip accent">{p.media?.type === 'YOUTUBE_EMBED' ? 'YouTube' : 'Apple Music'}</span>
              <button className="icon-btn" onClick={p.next} aria-label="Next"><Icon.Next /></button>
            </div>
            <div className="tiny muted">Use the embedded player above to listen without leaving LOOP.</div>
          </div>
        ) : (
          <div className="center">
            <div className="controls">
              <button className="icon-btn" onClick={p.prev} aria-label="Previous"><Icon.Prev /></button>
              <button className="play-btn" onClick={p.toggle} aria-label={p.status === 'playing' ? 'Pause' : 'Play'} disabled={p.status === 'loading'}>
                {p.status === 'playing' ? <Icon.Pause /> : <Icon.Play />}
              </button>
              <button className="icon-btn" onClick={p.next} aria-label="Next (counts as a skip if early)"><Icon.Next /></button>
            </div>
            <div className="progress">
              <span style={{ textAlign: 'right' }}>{duration(p.position)}</span>
              <input type="range" min="0" max={Math.max(1, Math.floor(p.length))} value={Math.round(p.position)} onChange={(e) => p.seek(Number(e.target.value))}
                aria-label="Seek" aria-valuetext={`${duration(p.position)} of ${duration(p.length)}`} />
              <span>{duration(p.length)}</span>
            </div>
          </div>
        )}
        <div className="right">
          {!p.externalPlayback && <>
            <div className="sleep-control">
              <button className={`icon-btn${sleepOpen ? ' on' : ''}`} onClick={() => setSleepOpen((open) => !open)} aria-label="Sleep timer" aria-expanded={sleepOpen} title="Sleep timer">
                <Icon.Clock />
                {p.sleepRemaining !== null && <span className="badge-count">{formatSleepRemaining(p.sleepRemaining)}</span>}
              </button>
              {sleepOpen && <div className="sleep-panel" role="dialog" aria-label="Sleep timer settings">
                <div className="row between"><b>Sleep timer</b><button className="icon-btn" onClick={() => setSleepOpen(false)} aria-label="Close sleep timer"><Icon.X /></button></div>
                <p className="tiny muted">Playback fades down during the final 30 seconds, then stops.</p>
                <div className="sleep-options">
                  {[5, 15, 30, 45, 60, 90].map((minutes) => <button key={minutes} className="btn ghost sm" onClick={() => { p.setSleepTimer(minutes); setSleepOpen(false); }}>{minutes} min</button>)}
                </div>
                {p.sleepRemaining !== null && <div className="row between" style={{ marginTop: 10 }}>
                  <span className="small">Stops in <b>{formatSleepRemaining(p.sleepRemaining)}</b></span>
                  <button className="btn ghost sm" onClick={() => p.cancelSleepTimer()}>Cancel</button>
                </div>}
              </div>}
            </div>
            <div className="row hide-sm" style={{ '--gap': '4px' }}>
              <button className="icon-btn" onClick={p.toggleMute} aria-label={p.muted ? 'Unmute' : 'Mute'} aria-pressed={p.muted}>
                {p.muted || p.volume === 0 ? <Icon.VolumeOff /> : <Icon.Volume />}
              </button>
              <input type="range" className="volume" min="0" max="100" value={Math.round((p.muted ? 0 : p.volume) * 100)}
                onChange={(e) => p.setVolume(Number(e.target.value) / 100)} aria-label="Volume" aria-valuetext={`${Math.round(p.volume * 100)}%`} />
            </div>
          </>}
          <button className="btn ghost sm" onClick={onOpenImmersive} aria-label="Open immersive player" title="Open immersive player">Immersive</button>
          <button className={`icon-btn${queueOpen ? ' on' : ''}`} onClick={() => setQueueOpen((o) => !o)} aria-label="Show play queue" aria-expanded={queueOpen}>
            <Icon.List /><span className="badge-count">{p.queue.length}</span>
          </button>
          {!p.realAudio && !p.externalPlayback && (
            <div className="toggle-group hide-sm" role="group" aria-label="Demo sketch clock" title="Demo time: the sketch clock runs faster so a full listen fits a presentation. Listened time is still measured honestly. Real audio always plays in real time.">
              {[1, 10].map((v) => <button key={v} className={p.speed === v ? 'on' : ''} aria-pressed={p.speed === v} onClick={() => p.setSpeed(v)}>{v === 1 ? 'Real time' : 'Demo ×10'}</button>)}
            </div>
          )}
        </div>
        {queueOpen && <QueuePanel onClose={closeQueue} />}
      </div>
      {p.externalPlayback && (p.media?.embedUri || p.media?.embedUrl) && (
        <section className={p.media?.type === 'YOUTUBE_EMBED' ? 'apple-inline-panel youtube-inline-panel' : 'apple-inline-panel'} aria-label={p.media?.type === 'YOUTUBE_EMBED' ? 'YouTube embedded player' : 'Apple Music embedded player'}>
          <div className="row between apple-inline-heading">
            <div className="tiny muted">NOW PLAYING · {p.media.trackName} — {p.media.artistName}</div>
            {p.media?.watchUrl ? <a className="tiny link" href={p.media.watchUrl} target="_blank" rel="noreferrer">Open in YouTube</a> : <a className="tiny link" href={p.media.storeUrl} target="_blank" rel="noreferrer">Open in Apple Music</a>}
          </div>
          <iframe
            title={`${p.media?.type === 'YOUTUBE_EMBED' ? 'YouTube' : 'Apple Music'} player: ${p.media.trackName}`}
            src={p.media.embedUrl || p.media.embedUri}
            width="100%"
            height={p.media?.type === 'YOUTUBE_EMBED' ? '315' : '175'}
            allow="autoplay *; encrypted-media *; fullscreen *; picture-in-picture *"
            frameBorder="0"
            loading="eager"
            referrerPolicy="strict-origin-when-cross-origin"
          />
          <p className="tiny muted">{p.media?.type === 'YOUTUBE_EMBED' ? <>Playback is provided by YouTube’s official embedded player. Some videos may be unavailable for embedding. {p.media.watchUrl && <a href={p.media.watchUrl} target="_blank" rel="noreferrer" className="player-provider-fallback">Open directly on YouTube</a>}</> : <>Full tracks may require an Apple Music subscription. Short previews play directly in LOOP when Apple provides one. {p.media?.storeUrl && <a href={p.media.storeUrl} target="_blank" rel="noreferrer" className="player-provider-fallback">Open on Apple Music</a>}</>}</p>
        </section>
      )}

    </>
  );
}

function LearnedNote() {
  // after each permanent play, show what the database learned from it
  const p = usePlayer();
  const toast = useToast();
  useEffect(() => {
    const r = p.lastResult;
    if (!r || r.private || r.reason === 'reset' || r.reason === 'unload') return;
    const verdict = r.completed ? 'Finished' : r.skipped ? 'Skipped' : `Played ${Math.round(r.completionPct)}%`;
    toast.info(`${verdict}: “${r.song.title}”.${r.learned ? ` ${r.learned.genre} preference is now ${Math.round(r.learned.score * 100)}/100.` : ''}`);
  }, [p.lastResult]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function OfflineBanner() {
  const { online, browserOnline } = useOnline();
  if (online) return null;
  return (
    <div className="offline-banner" role="status" aria-live="polite">
      <Icon.Wifi width={18} height={18} />
      <span>{browserOnline ? 'LOOP can’t reach its server right now. What you see may be out of date; actions will fail until it is back.' : 'You’re offline. Reconnect to keep listening and saving.'}</span>
    </div>
  );
}

export default function Layout() {
  const { user } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => { try { return localStorage.getItem('loop.sidebarCollapsed') === 'true'; } catch { return false; } });
  const [immersiveOpen, setImmersiveOpen] = useState(false);
  useEffect(() => { try { localStorage.setItem('loop.sidebarCollapsed', String(sidebarCollapsed)); } catch { /* preference storage is optional */ } }, [sidebarCollapsed]);
  const nav = useNavigate();
  useEffect(() => { api.moods().then(registerMoodColors).catch(() => {}); }, []);
  useEffect(() => { if (user && !user.onboarded) nav('/welcome'); }, [user, nav]);
  return (
    <div className={`app${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <a className="skip-link" href="#main">Skip to content</a>
      <Sidebar collapsed={sidebarCollapsed} />
      <main className="main" id="main" tabIndex={-1}>
        <TopBar onToggleSidebar={() => setSidebarCollapsed((value) => !value)} sidebarCollapsed={sidebarCollapsed} />
        <OfflineBanner />
        {user.incognito && (
          <div className="private-banner" role="status">
            <Icon.EyeOff width={18} height={18} style={{ color: 'var(--private)' }} />
            <span className="grow">Private session. No listening history or audio playback is collected in this metadata-only archive view; mood ratings are paused. <Link to="/private" style={{ color: 'var(--private)', fontWeight: 600 }}>See what this session remembers</Link></span>
          </div>
        )}
        <Outlet />
      </main>
      <PlayerBar onOpenImmersive={() => setImmersiveOpen(true)} />
      <ImmersivePlayer open={immersiveOpen} onClose={() => setImmersiveOpen(false)} />
      <LearnedNote />
      <MobileNav />
    </div>
  );
}

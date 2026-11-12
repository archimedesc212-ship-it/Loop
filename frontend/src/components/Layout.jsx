import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import * as Icon from './Icons';
import { Cover } from './Art';
import { useAuth } from '../hooks/useAuth';
import { usePlayer } from '../hooks/usePlayer';
import { useToast } from '../hooks/useToast';
import { useOnline } from '../hooks/useOnline';
import { api, isDemoMode } from '../services/api';
import { duration } from '../lib/format';
import { buildSearchSuggestions } from '../lib/searchSuggestions';
import { formatSleepRemaining } from '../lib/sleepTimer';
import { LikeButton } from './Songs';
import ImmersivePlayer from './ImmersivePlayer';

function youtubeEmbedWithOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !/(^|\.)youtube(?:-nocookie)?\.com$/i.test(url.hostname)) return '';
    url.searchParams.set('enablejsapi', '1');
    url.searchParams.set('origin', window.location.origin);
    url.searchParams.set('playsinline', '1');
    return url.toString();
  } catch { return ''; }
}

const NAV = [
  { to: '/', label: 'Home', short: 'Home', icon: Icon.Home, end: true },
  { to: '/search', label: 'Search', short: 'Search', icon: Icon.Search },
  { to: '/library', label: 'Library', short: 'Library', icon: Icon.Library },
  { to: '/database', label: 'Database', short: 'Database', icon: Icon.Database },
];

function Sidebar({ collapsed = false }) {
  const { user, can, refresh } = useAuth();
  const toast = useToast();
  const guest = isDemoMode || user.role === 'GUEST' || user.email?.endsWith('@guest.loop.invalid');
  const signOut = async () => {
    try {
      await api.logout();
      await refresh(); // Continue as a fresh guest after signing out.
      toast.success('Signed out. You can keep listening as a guest.');
    } catch (error) { toast.error(error); }
  };
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
      <div className="sidebar-foot stack" style={{ '--gap': '10px' }}>
        <div className="row" style={{ '--gap': '10px' }}>
          <span className="avatar">{user.displayName.slice(0, 1)}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.displayName}</div>
            <div className="tiny muted">{guest ? 'Guest listener' : (user.roleName || 'Listener')}</div>
          </div>
        </div>
        {guest ? <div className="row" style={{ '--gap': '4px' }}>
          <Link to="/login" className="btn ghost sm grow">Sign in</Link>
          <Link to="/register" className="btn primary sm grow">Create account</Link>
        </div> : <div className="row" style={{ '--gap': '4px' }}>
          <button type="button" className="btn ghost sm grow" onClick={signOut}>Sign out</button>
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
          placeholder="Search Spotify songs and artists…"
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
              <span className="search-suggestion-copy"><strong>Search Spotify catalogue</strong><small>Spotify · MySQL search history</small></span>
              <span className="search-suggestion-kind">Enter</span>
            </button>
          </div>
        )}
      </form>
      <div className="grow" />
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
                <span className="tiny muted">{s.artist.name}{s.playback?.type === 'YOUTUBE_LOOKUP' ? ' · YouTube' : s.playback && s.playback.playable === false ? ' · metadata only' : ''}</span>
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

function PlayerBar({ onOpenImmersive, immersiveOpen = false }) {
  const p = usePlayer();
  const { user } = useAuth();
  const [queueOpen, setQueueOpen] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  const closeQueue = useCallback(() => setQueueOpen(false), []);

  // Desktop-friendly playback shortcuts. Ignore typing fields and editable controls.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      const tag = target?.tagName?.toLowerCase();
      if (target?.isContentEditable || ['input', 'textarea', 'select', 'button'].includes(tag)) return;
      if (event.code === 'Space' && !p.externalPlayback) {
        event.preventDefault();
        p.toggle();
      } else if (event.key === 'ArrowLeft' && p.current && !p.externalPlayback) {
        event.preventDefault();
        p.seek(Math.max(0, p.position - 10));
      } else if (event.key === 'ArrowRight' && p.current && !p.externalPlayback) {
        event.preventDefault();
        p.seek(Math.min(p.length || p.position + 10, p.position + 10));
      } else if (event.key.toLowerCase() === 'n' && p.current) {
        p.next();
      } else if (event.key.toLowerCase() === 'p' && p.current) {
        p.prev();
      } else if (event.key.toLowerCase() === 'm' && p.current) {
        p.toggleMute();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [p.toggle, p.seek, p.next, p.prev, p.toggleMute, p.current, p.externalPlayback, p.position, p.length]);

  const s = p.current;
  if (!s) return null;
  return (
    <>
      <div className={`player${user?.incognito ? ' private' : ''}`} role="region" aria-label="Player">
        <div className="now">
          <button type="button" className="player-cover-open" onClick={onOpenImmersive} aria-label={`Open artwork and Now Playing for ${s.title}`}>
            {s.artworkUrl || p.media?.artworkUrl ? <img className="cover player-artwork" src={s.artworkUrl || p.media.artworkUrl} alt="" /> : <Cover colors={s.cover} seed={s.album ? (Number(s.album.id) || 1) * 31 + (Number(s.id) || 1) : (Number(s.id) || 1)} />}
          </button>
          <button type="button" className="player-open-now" onClick={onOpenImmersive} aria-label={`Open now playing: ${s.title} by ${s.artist?.name || 'Unknown artist'}`} style={{ minWidth: 0 }}>
            <strong style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</strong>
            <span className="tiny muted" style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={mediaNote(p.media, user?.incognito)}>
              {s.artist?.name || 'Unknown artist'} · {mediaNote(p.media, user?.incognito)}
            </span>
          </button>
          {!p.externalPlayback && !(String(s.id).startsWith('yt-')) && <span className="hide-sm"><LikeButton song={s} /></span>}
        </div>
        {p.externalPlayback ? (
          <div className="center external-player-center">
            {p.media?.type === 'SPOTIFY_EMBED'
              ? <span className="tiny muted">Use Spotify’s official player controls below</span>
              : <div className="controls"><button className="icon-btn" onClick={p.prev} aria-label="Previous"><Icon.Prev /></button><button className="play-btn" onClick={p.toggle} aria-label={p.status === 'playing' ? 'Pause' : 'Play'}>{p.status === 'playing' ? <Icon.Pause /> : <Icon.Play />}</button><button className="icon-btn" onClick={p.next} aria-label="Next"><Icon.Next /></button></div>}
            <button className="player-expand-btn" onClick={onOpenImmersive} aria-label="Open Now Playing" title="Open full-screen player">Open Now Playing</button>
          </div>
        ) : (
          <div className="center">
            <div className="controls" title="Keyboard: Space play/pause · ←/→ seek 10s · N next · P previous · M mute">
              <button className={`icon-btn${p.shuffle ? ' on' : ''}`} onClick={p.setShuffle} aria-label="Toggle shuffle" aria-pressed={p.shuffle}>⤨</button>
              <button className="icon-btn" onClick={p.prev} aria-label="Previous"><Icon.Prev /></button>
              <button className="play-btn" onClick={p.toggle} aria-label={p.status === 'playing' ? 'Pause' : 'Play'} disabled={p.status === 'loading'}>
                {p.status === 'playing' ? <Icon.Pause /> : <Icon.Play />}
              </button>
              <button className="icon-btn" onClick={p.next} aria-label="Next (counts as a skip if early)"><Icon.Next /></button>
              <button className={`icon-btn${p.repeat !== 'off' ? ' on' : ''}`} onClick={p.setRepeat} aria-label={`Repeat ${p.repeat}`} aria-pressed={p.repeat !== 'off'}>{p.repeat === 'one' ? '↻¹' : '↻'}</button>
            </div>
            <div className="progress">
              <span style={{ textAlign: 'right' }}>{duration(p.position)}</span>
              <input type="range" min="0" max={Math.max(1, Math.floor(p.length))} value={Math.round(p.position)} onChange={(e) => p.seek(Number(e.target.value))}
                aria-label="Seek playback position" aria-valuetext={`${duration(p.position)} of ${duration(p.length)}`} title="Use arrow keys to seek 10 seconds" />
              <span>{duration(p.length)}</span>
            </div>
          </div>
        )}
        <div className="right">
          <>
            {!p.externalPlayback && <div className="sleep-control">
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
            </div>}
            <div className="row hide-sm" style={{ '--gap': '4px' }}>
              <button className="icon-btn" onClick={p.toggleMute} aria-label={p.muted ? 'Unmute' : 'Mute'} aria-pressed={p.muted}>
                {p.muted || p.volume === 0 ? <Icon.VolumeOff /> : <Icon.Volume />}
              </button>
              <input type="range" className="volume" min="0" max="100" value={Math.round((p.muted ? 0 : p.volume) * 100)}
                onChange={(e) => p.setVolume(Number(e.target.value) / 100)} aria-label="Volume" aria-valuetext={`${Math.round(p.volume * 100)}%`} />
            </div>
          </>
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
      {p.media?.type === 'YOUTUBE_SEARCH' && p.media?.watchUrl && (
        <section className="youtube-inline-fallback" aria-label="YouTube search fallback">
          <span>We couldn't find an embeddable upload for this track.</span>
          <a href={p.media.watchUrl} target="_blank" rel="noreferrer">Search and play on YouTube <Icon.Arrow /></a>
        </section>
      )}
      {p.externalPlayback && p.media?.type === 'SPOTIFY_EMBED' && p.media?.embedUrl && (
        <section className={`youtube-inline-panel spotify-inline-panel${immersiveOpen ? ' is-immersive' : ''}`} aria-label="Spotify official embedded player">
          <div className="row between youtube-inline-heading">
            <div className="tiny muted">NOW PLAYING · {p.media.trackName} — {p.media.artistName}</div>
            <a className="tiny link" href={p.media.spotifyUrl} target="_blank" rel="noreferrer">Spotify ↗</a>
          </div>
          <iframe title={`Spotify player: ${p.media.trackName}`} src={p.media.embedUrl} width="100%" height={immersiveOpen ? 352 : 152}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="eager"
            referrerPolicy="strict-origin-when-cross-origin" />
          <p className="tiny muted">Official Spotify player · Premium playback and track availability depend on Spotify, account and market.</p>
        </section>
      )}
      {p.externalPlayback && p.media?.type === 'YOUTUBE_EMBED' && p.media?.embedUrl && (
        <section className={`youtube-inline-panel${immersiveOpen ? ' is-immersive' : ''}`} aria-label="YouTube embedded player">
          <div className="row between youtube-inline-heading">
            <div className="tiny muted">NOW PLAYING · {p.media.trackName} — {p.media.artistName}</div>
            {p.media?.watchUrl ? <a className="tiny link" href={p.media.watchUrl} target="_blank" rel="noreferrer">Open in YouTube</a> : null}
          </div>
          <iframe title={`YouTube player: ${p.media.trackName}`} src={youtubeEmbedWithOrigin(p.media.embedUrl)} width="100%" height="315"
            allow="autoplay *; encrypted-media *; fullscreen *; picture-in-picture *" frameBorder="0" allowFullScreen loading="eager" referrerPolicy="strict-origin-when-cross-origin" />
          <p className="tiny muted">Playback is provided by YouTube’s official embedded player.</p>
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
  useEffect(() => { if (user && !user.onboarded) nav('/welcome'); }, [user, nav]);
  return (
    <div className={`app${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <a className="skip-link" href="#main">Skip to content</a>
      <Sidebar collapsed={sidebarCollapsed} />
      <main className="main" id="main" tabIndex={-1}>
        <TopBar onToggleSidebar={() => setSidebarCollapsed((value) => !value)} sidebarCollapsed={sidebarCollapsed} />
        <OfflineBanner />
        <Outlet />
      </main>
      <PlayerBar onOpenImmersive={() => setImmersiveOpen(true)} immersiveOpen={immersiveOpen} />
      <ImmersivePlayer open={immersiveOpen} onClose={() => setImmersiveOpen(false)} />
      <LearnedNote />
      <MobileNav />
    </div>
  );
}

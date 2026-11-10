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
import { formatSleepRemaining } from '../lib/sleepTimer';
import { registerMoodColors, LikeButton } from './Songs';

const NAV = [
  { to: '/', label: 'Home', short: 'Home', icon: Icon.Home, end: true },
  { to: '/mood', label: 'Discover', short: 'Discover', icon: Icon.Mood },
  { to: '/search', label: 'Search', short: 'Search', icon: Icon.Search },
  { to: '/library', label: 'Library', short: 'Library', icon: Icon.Library },
];

function Sidebar() {
  const { user, can } = useAuth();
  const admin = ['health.view', 'catalog.write', 'pipeline.view', 'users.manage', 'artist.review'].some((permission) => can(permission));
  return (
    <aside className="sidebar" aria-label="Main">
      <Link to="/" className="brand"><Icon.BrandMark className="brand-mark" />LOOP</Link>
      {NAV.map(({ to, label, icon: Ico, end }) => (
        <NavLink key={to} to={to} end={end} className="nav-link"><Ico />{label}</NavLink>
      ))}
      {admin && (
        <>
          <div className="nav-label">{user.roleName}</div>
          <NavLink to="/admin" className="nav-link"><Icon.Shield />Admin</NavLink>
        </>
      )}
      <NavLink to={user.role === 'ARTIST' ? '/artist/studio' : '/artist/apply'} className="nav-link">{user.role === 'ARTIST' ? <Icon.Music /> : <Icon.Mic />} {user.role === 'ARTIST' ? 'Artist Studio' : 'Become an artist'}</NavLink>
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

function TopBar() {
  const nav = useNavigate();
  const loc = useLocation();
  const [q, setQ] = useState(new URLSearchParams(loc.search).get('q') || '');
  useEffect(() => { if (loc.pathname !== '/search') setQ(''); }, [loc.pathname]);
  const submit = (e) => { e.preventDefault(); if (q.trim().length >= 2) nav(`/search?q=${encodeURIComponent(q.trim())}`); };
  const { user } = useAuth();
  return (
    <div className="topbar">
      <form className="search-box" onSubmit={submit} role="search">
        <Icon.Search />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Track titles, artists, genres, moods…" aria-label="Search" />
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

function PlayerBar() {
  const p = usePlayer();
  const { user } = useAuth();
  const [queueOpen, setQueueOpen] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [appleOpen, setAppleOpen] = useState(false);
  const closeQueue = useCallback(() => setQueueOpen(false), []);
  const s = p.current;
  const embedUri = p.media?.embedUri;

  useEffect(() => {
    setAppleOpen(!!embedUri);
  }, [embedUri]);
  useEffect(() => {
    const openExternal = () => setAppleOpen(true);
    window.addEventListener('muse:open-external', openExternal);
    return () => window.removeEventListener('muse:open-external', openExternal);
  }, []);
  if (!s) return null;
  return (
    <>
      <div className={`player${user.incognito ? ' private' : ''}`} role="region" aria-label="Player">
        <div className="now">
          <Cover colors={s.cover} seed={s.album ? s.album.id * 31 + s.id : s.id} />
          <div style={{ minWidth: 0 }}>
            <Link to={`/song/${s.id}`} style={{ fontWeight: 600, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</Link>
            <div className="tiny muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={mediaNote(p.media, user.incognito)}>
              {s.artist.name} · {mediaNote(p.media, user.incognito)}
            </div>
          </div>
          <span className="hide-sm"><LikeButton song={s} /></span>
        </div>
        {p.externalPlayback ? (
          <div className="center external-player-center">
            <div className="controls">
              <button className="icon-btn" onClick={p.prev} aria-label="Previous"><Icon.Prev /></button>
              <button className="play-btn" onClick={() => setAppleOpen(true)} aria-label="Open Apple Music player"><Icon.Play /></button>
              <button className="icon-btn" onClick={p.next} aria-label="Next"><Icon.Next /></button>
            </div>
            <div className="tiny muted">Playback is handled by the Apple Music player</div>
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
      {appleOpen && p.media?.embedUri && (
        <div className="modal-back" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAppleOpen(false); }}>
          <section className="modal apple-music-modal" role="dialog" aria-modal="true" aria-labelledby="apple-player-title">
            <div className="row between" style={{ marginBottom: 14 }}>
              <div style={{ minWidth: 0 }}>
                <h2 id="apple-player-title" style={{ margin: 0 }}>Play this track</h2>
                <div className="tiny muted">{p.media.trackName} · {p.media.artistName} · Apple Music</div>
              </div>
              <button className="icon-btn" onClick={() => setAppleOpen(false)} aria-label="Close Apple Music player"><Icon.X /></button>
            </div>
            <iframe
              title={`Apple Music player: ${p.media.trackName}`}
              src={p.media.embedUri}
              width="100%"
              height="175"
              allow="autoplay *; encrypted-media *; fullscreen *; picture-in-picture *"
              frameBorder="0"
              loading="eager"
              referrerPolicy="strict-origin-when-cross-origin"
              style={{ display: 'block', width: '100%', border: 0, borderRadius: 12, background: 'transparent' }}
            />
            <p className="tiny muted" style={{ margin: '12px 0' }}>Apple Music controls playback. Full songs may require an Apple Music subscription; otherwise a short preview may be available. LOOP does not download or store audio.</p>
            <div className="row between" style={{ alignItems: 'center' }}>
              <a className="btn primary" href={p.media.storeUrl} target="_blank" rel="noreferrer">Open in Apple Music <Icon.Arrow /></a>
              <span className="tiny muted">Playback controls are inside the player.</span>
            </div>
          </section>
        </div>
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
  const nav = useNavigate();
  useEffect(() => { api.moods().then(registerMoodColors).catch(() => {}); }, []);
  useEffect(() => { if (user && !user.onboarded) nav('/welcome'); }, [user, nav]);
  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to content</a>
      <Sidebar />
      <main className="main" id="main" tabIndex={-1}>
        <TopBar />
        <OfflineBanner />
        {user.incognito && (
          <div className="private-banner" role="status">
            <Icon.EyeOff width={18} height={18} style={{ color: 'var(--private)' }} />
            <span className="grow">Private session. No listening history or audio playback is collected in this metadata-only archive view; mood ratings are paused. <Link to="/private" style={{ color: 'var(--private)', fontWeight: 600 }}>See what this session remembers</Link></span>
          </div>
        )}
        <Outlet />
      </main>
      <PlayerBar />
      <LearnedNote />
      <MobileNav />
    </div>
  );
}

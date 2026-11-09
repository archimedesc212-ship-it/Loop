import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { usePlayer } from '../hooks/usePlayer';
import { Field, PageHead, ErrorState, Modal, ListSkeleton } from '../components/ui';
import { dateTime } from '../lib/format';
import { replayIntro } from '../components/Intro';
import { Logout } from '../components/Icons';

export default function Settings() {
  const { user, setUser, signOut } = useAuth();
  const toast = useToast();
  const player = usePlayer();
  const nav = useNavigate();
  const opts = useApi(() => api.onboardingOptions(), []);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setForm({ displayName: user.displayName, regionCode: user.region ? user.region.code : '', contentFilter: user.contentFilter,
      listeningHabit: user.listeningHabit || 'MIXED', languageIds: user.languages.map((l) => l.id) });
  }, [user]);
  if (!form) return null;
  const toggleLang = (id) => setForm((f) => ({ ...f, languageIds: f.languageIds.includes(id) ? f.languageIds.filter((x) => x !== id) : [...f.languageIds, id].slice(0, 5) }));
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const u = await api.updateSettings({ ...form, regionCode: form.regionCode || undefined });
      setUser(u);
      toast.success('Settings saved');
    } catch (err) { toast.error(err); } finally { setBusy(false); }
  };
  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <PageHead title="Settings" actions={<button className="btn ghost" onClick={async () => { await player.reset(); await signOut(); nav('/login'); }}><Logout />Sign out</button>} />
      {opts.error && <ErrorState error={opts.error} onRetry={opts.reload} />}
      <form className="stack" style={{ '--gap': '18px' }} onSubmit={save}>
        <Field label="Display name"><input className="input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} maxLength={60} /></Field>
        <div className="field"><span>Languages (in order of preference, up to five)</span>
          <div className="row wrap" style={{ '--gap': '8px' }}>
            {opts.data && opts.data.languages.map((l) => {
              const at = form.languageIds.indexOf(l.id);
              return <button type="button" key={l.id} className={`pick${at >= 0 ? ' on' : ''}`} aria-pressed={at >= 0} onClick={() => toggleLang(l.id)}>{at >= 0 && <span className="order">{at + 1}</span>}{l.name} <span className="muted">{l.nativeName}</span></button>;
            })}
          </div>
        </div>
        <div className="grid-2">
          <Field label="Region" hint="A light signal for regional discovery — never used to assume your taste.">
            <select className="select" value={form.regionCode} onChange={(e) => setForm({ ...form, regionCode: e.target.value })}>
              <option value="">Prefer not to say</option>{opts.data && opts.data.regions.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="Content filter" hint="Applied to recommendations, search, trending and playback.">
            <select className="select" value={form.contentFilter} onChange={(e) => setForm({ ...form, contentFilter: e.target.value })}>
              <option value="OFF">Show everything</option><option value="NO_EXPLICIT">Hide explicit songs</option><option value="FAMILY">Family-safe only</option>
            </select>
          </Field>
        </div>
        <div className="row"><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
          <Link className="btn ghost" to="/welcome">Redo onboarding</Link></div>
      </form>
      <HiddenSongs />
      <AccountSecurity />
      <div className="card stack section" style={{ '--gap': '6px' }} id="credits">
        <h3>About and credits</h3>
        <p className="small soft">MUSE’s demo catalogue is fictional and written for this project. Playback of demo songs is a sound sketch synthesised in your browser — not a recording.</p>
        <p className="small soft">When film details are shown, they come from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
        <p className="small soft">Imported recording metadata comes from MusicBrainz; video links come from the YouTube Data API and open on YouTube. Each source is shown on the song or film page it was used for.</p>
      </div>
      <div className="card stack section" style={{ '--gap': '6px' }}>
        <h3>Introduction</h3>
        <p className="small soft">Watch the short MUSE introduction again.</p>
        <div><button className="btn sm" onClick={() => { replayIntro(); nav('/login?intro=1'); }}>Replay introduction</button></div>
      </div>
    </div>
  );
}

function HiddenSongs() {
  const toast = useToast();
  const list = useApi(() => api.dismissals(), []);
  const undo = async (s) => {
    try { await api.undismiss(s.id); list.setData(list.data.filter((x) => x.id !== s.id)); toast.success(`“${s.title}” can be recommended again`); } catch (e) { toast.error(e); }
  };
  return (
    <div className="card stack section" style={{ '--gap': '10px' }}>
      <h3>Hidden songs</h3>
      <p className="small soft">Songs you marked “Not for me” are left out of every recommendation. They still appear in search and on artist pages.</p>
      {list.loading && <ListSkeleton n={2} />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.data && (list.data.length === 0 ? <p className="small muted">Nothing hidden.</p> : (
        <ul className="stack" style={{ '--gap': '6px', listStyle: 'none', padding: 0, margin: 0 }}>
          {list.data.map((s) => (
            <li key={s.id} className="row between small">
              <span><Link className="link" to={`/song/${s.id}`}>{s.title}</Link> <span className="muted">· {s.artist.name}</span></span>
              <button className="btn ghost sm" onClick={() => undo(s)}>Show again</button>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

function AccountSecurity() {
  const { user, signOut } = useAuth();
  const toast = useToast();
  const player = usePlayer();
  const nav = useNavigate();
  const sessions = useApi(() => api.sessions(), []);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwError, setPwError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const revoke = async (s) => {
    setBusy(s.id);
    try {
      await api.revokeSession(s.id);
      if (s.current) { await player.reset(); await signOut(); nav('/login'); return; }
      sessions.setData(sessions.data.filter((x) => x.id !== s.id));
      toast.success('That device was signed out');
    } catch (e) { toast.error(e); } finally { setBusy(null); }
  };
  const everywhere = async () => {
    setBusy('all');
    try { await player.reset(); await api.logoutAll(); } catch (e) { toast.error(e); }
    await signOut();
    nav('/login');
  };
  const changePassword = async (e) => {
    e.preventDefault();
    setPwError(null);
    if (pw.newPassword !== pw.confirm) { setPwError('The new passwords do not match.'); return; }
    setBusy('pw');
    try {
      const r = await api.changePassword({ currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      toast.success(`Password changed${r.otherSessionsRevoked ? ` — ${r.otherSessionsRevoked} other session(s) signed out` : ''}`);
      sessions.reload();
    } catch (err) {
      setPwError(err.details ? Object.values(err.details)[0] : err.message);
    } finally { setBusy(null); }
  };

  return (
    <div className="card stack section" style={{ '--gap': '14px' }}>
      <h3>Account and security</h3>
      <p className="small soft">@{user.username} · {user.email} · {user.roleName}</p>

      <div className="stack" style={{ '--gap': '8px' }}>
        <strong className="small">Where you’re signed in</strong>
        {sessions.loading && <ListSkeleton n={2} />}
        {sessions.error && <ErrorState error={sessions.error} onRetry={sessions.reload} />}
        {sessions.data && sessions.data.map((s) => (
          <div key={s.id} className="row between small wrap">
            <span>{describeAgent(s.userAgent)}{s.current && <span className="chip accent" style={{ marginLeft: 8 }}>This device</span>}
              <span className="muted"> · signed in {dateTime(s.createdAt)} · last active {dateTime(s.lastSeenAt)}</span></span>
            <button className="btn ghost sm" onClick={() => revoke(s)} disabled={busy === s.id}>{s.current ? 'Sign out' : 'Sign out device'}</button>
          </div>
        ))}
        <div><button className="btn sm" onClick={everywhere} disabled={busy === 'all'}>Sign out everywhere</button></div>
      </div>

      <form className="stack" style={{ '--gap': '10px' }} onSubmit={changePassword} aria-label="Change password">
        <strong className="small">Change password</strong>
        <div className="grid-2">
          <Field label="Current password"><input className="input" type="password" autoComplete="current-password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
          <div />
          <Field label="New password" hint="At least 8 characters with a letter and a number."><input className="input" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
          <Field label="Repeat new password" error={pwError}><input className="input" type="password" autoComplete="new-password" required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
        </div>
        <div><button className="btn primary sm" disabled={busy === 'pw'}>{busy === 'pw' ? 'Changing…' : 'Change password'}</button></div>
        <p className="tiny muted">Changing your password signs out every other device. Passwords are stored only as bcrypt hashes; five wrong attempts lock the account for 15 minutes.</p>
      </form>

      <div className="stack" style={{ '--gap': '6px' }}>
        <strong className="small">Delete account</strong>
        <p className="tiny muted">Permanently deletes your account, listening history, ratings, playlists and worlds. This cannot be undone.</p>
        <div><button className="btn danger sm" onClick={() => setDeleting(true)}>Delete my account…</button></div>
      </div>
      {deleting && <DeleteAccount onClose={() => setDeleting(false)} />}
    </div>
  );
}

function describeAgent(ua) {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /node|undici/i.test(ua) ? 'API client' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

function DeleteAccount({ onClose }) {
  const { signOut } = useAuth();
  const player = usePlayer();
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await player.reset();
      await api.deleteAccount({ password, confirm });
      await signOut();
      nav('/login', { replace: true });
    } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <Modal title="Delete your account" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <p className="small">This permanently removes your account and everything MUSE learned from your listening.</p>
        <Field label="Your password"><input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Field label="Type DELETE to confirm" error={error}><input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" /></Field>
        <div className="row"><button className="btn danger" disabled={busy || confirm !== 'DELETE' || !password}>{busy ? 'Deleting…' : 'Delete permanently'}</button>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}

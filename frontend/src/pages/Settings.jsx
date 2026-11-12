import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { Field, PageHead, ErrorState, ListSkeleton } from '../components/ui';
import { accentThemes, applyAccentTheme, getAccentTheme } from '../lib/theme';
import { getMusicProviderSettings, saveMusicProviderSettings } from '../lib/providerSettings';
import { verifyYouTubeApiKey } from '../lib/youtubeBrowser';

export default function Settings() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
    const opts = useApi(() => api.onboardingOptions(), []);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const [accentTheme, setAccentTheme] = useState(() => getAccentTheme().id);
  const [youtubeApiKey, setYoutubeApiKey] = useState(() => getMusicProviderSettings().youtubeApiKey);
  const [showYoutubeKey, setShowYoutubeKey] = useState(false);
  const [providerBusy, setProviderBusy] = useState(false);
  const [providerStatus, setProviderStatus] = useState('');
  useEffect(() => {
    if (!user) { setForm(null); return; }
    setForm({ displayName: user.displayName || '', regionCode: user.region ? user.region.code : '', contentFilter: user.contentFilter || 'OFF',
      listeningHabit: user.listeningHabit || 'MIXED', languageIds: (Array.isArray(user.languages) ? user.languages : []).map((l) => l.id) });
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
  const saveProviderKey = (e) => {
    e.preventDefault();
    try {
      saveMusicProviderSettings({ youtubeApiKey });
      setProviderStatus(youtubeApiKey.trim() ? 'YouTube key saved on this device.' : 'YouTube key cleared.');
      toast.success(youtubeApiKey.trim() ? 'YouTube API key saved' : 'YouTube API key cleared');
    } catch (error) {
      setProviderStatus(error.message || 'Could not save the key in this browser.');
      toast.error(error);
    }
  };
  const testProviderKey = async () => {
    setProviderBusy(true);
    setProviderStatus('Checking the key…');
    try {
      await verifyYouTubeApiKey(youtubeApiKey);
      setProviderStatus('Key verified. YouTube music search and home banners are ready.');
      toast.success('YouTube API key verified');
    } catch (error) {
      setProviderStatus(error.message || 'The key could not be verified.');
      toast.error(error);
    } finally { setProviderBusy(false); }
  };
  const exportData = async (e) => {
    e.preventDefault();
    if (!exportPassword) return;
    setExportBusy(true);
    try {
      const data = await api.exportData({ password: exportPassword });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `loop-personal-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportPassword('');
      toast.success('Your personal data export is ready');
    } catch (err) { toast.error(err); } finally { setExportBusy(false); }
  };
  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <PageHead title="Settings" />
      <section className="card stack appearance-card" aria-labelledby="appearance-title">
        <div className="appearance-heading">
          <div>
            <h2 id="appearance-title">Appearance</h2>
            <p className="small soft">Make LOOP feel like yours. Your colour is used across navigation, buttons, highlights, the player and visualizer.</p>
          </div>
          <span className="appearance-live-dot" aria-hidden="true" />
        </div>
        <div className="appearance-label-row"><strong>Accent colour</strong><span className="small muted">Saved on this device</span></div>
        <div className="accent-theme-grid" role="group" aria-label="Choose accent colour">
          {accentThemes.map((theme) => (
            <button type="button" key={theme.id} className={`accent-theme-option${accentTheme === theme.id ? ' selected' : ''}`}
              onClick={() => { setAccentTheme(theme.id); applyAccentTheme(theme.id); }}
              aria-pressed={accentTheme === theme.id} aria-label={`Use ${theme.label}`}>
              <span className="accent-theme-swatch" style={{ '--swatch': theme.color }} />
              <span>{theme.label}</span>
              {accentTheme === theme.id && <span className="accent-theme-check" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
        <div className="appearance-preview" aria-live="polite">
          <div className="appearance-preview-copy"><span className="tiny muted">LIVE PREVIEW</span><strong>Colour your listening space</strong><span className="small soft">Your selection updates instantly and stays after you reopen LOOP.</span></div>
          <div className="appearance-preview-actions"><span className="appearance-preview-pill">Selected theme</span><span className="appearance-preview-play">▶</span></div>
        </div>
      </section>
      <section className="card stack section provider-settings-card" aria-labelledby="provider-settings-title">
        <div className="stack" style={{ '--gap': '5px' }}>
          <h2 id="provider-settings-title">Music sources</h2>
          <p className="small soft">Add your YouTube Data API v3 key here once. LOOP uses it for worldwide song discovery, YouTube thumbnails and the rotating Home spotlight. The key stays in this browser and is not sent to LOOP's database.</p>
        </div>
        <form className="stack" onSubmit={saveProviderKey}>
          <Field label="YouTube Data API v3 key" hint="This is a public browser API key, not an account password. Restrict it in Google Cloud to YouTube Data API v3 and your LOOP website's HTTP referrers.">
            <div className="provider-key-input">
              <input className="input" type={showYoutubeKey ? 'text' : 'password'} value={youtubeApiKey} onChange={(event) => { setYoutubeApiKey(event.target.value); setProviderStatus(''); }} autoComplete="off" spellCheck="false" maxLength={256} placeholder="Paste your YouTube API key" aria-label="YouTube Data API v3 key" />
              <button type="button" className="btn ghost sm" onClick={() => setShowYoutubeKey((value) => !value)}>{showYoutubeKey ? 'Hide' : 'Show'}</button>
            </div>
          </Field>
          <div className="row wrap">
            <button className="btn primary" type="submit">Save key in Settings</button>
            <button className="btn ghost" type="button" onClick={testProviderKey} disabled={providerBusy || !youtubeApiKey.trim()}>{providerBusy ? 'Checking…' : 'Test key'}</button>
            <button className="btn ghost" type="button" onClick={() => { setYoutubeApiKey(''); saveMusicProviderSettings({ youtubeApiKey: '' }); setProviderStatus('YouTube key cleared.'); }}>Clear key</button>
          </div>
          {providerStatus && <p className="small" role="status">{providerStatus}</p>}
        </form>
        <div className="provider-policy-note">
          <strong>Spotify credentials are not used in this multi-source player.</strong> Spotify's current developer policy prohibits combining Spotify streams or content with another service. LOOP can keep a separate “Open in Spotify” link, but it cannot combine Spotify API music with YouTube/Openverse playback here.
        </div>
        <p className="tiny muted">Openverse needs no API key. It returns openly licensed recordings with source and licence information. YouTube playback stays inside its official embedded player; LOOP does not extract audio from videos.</p>
      </section>
      {opts.error && <ErrorState error={opts.error} onRetry={opts.reload} />}
      <form className="stack" style={{ '--gap': '18px' }} onSubmit={save}>
        <Field label="Display name"><input className="input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} maxLength={60} /></Field>
        <div className="field"><span>Languages</span>
          {opts.data && Array.isArray(opts.data.languages) && opts.data.languages.length === 0 && <p className="small muted">The supplied dataset has no language column. LOOP leaves language unknown rather than guessing it from the artist or title.</p>}
          <div className="row wrap" style={{ '--gap': '8px' }}>
            {Array.isArray(opts.data?.languages) && opts.data.languages.map((l) => {
              const at = form.languageIds.indexOf(l.id);
              return <button type="button" key={l.id} className={`pick${at >= 0 ? ' on' : ''}`} aria-pressed={at >= 0} onClick={() => toggleLang(l.id)}>{at >= 0 && <span className="order">{at + 1}</span>}{l.name} <span className="muted">{l.nativeName}</span></button>;
            })}
          </div>
        </div>
        <div className="grid-2">
          <Field label="Region" hint="Regional metadata was not included in the supplied dataset, so LOOP does not infer it.">
            <select className="select" value={form.regionCode} onChange={(e) => setForm({ ...form, regionCode: e.target.value })}>
              <option value="">Prefer not to say</option>{Array.isArray(opts.data?.regions) && opts.data.regions.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="Content filter" hint="Applied to recommendations, search, trending and playback.">
            <select className="select" value={form.contentFilter} onChange={(e) => setForm({ ...form, contentFilter: e.target.value })}>
              <option value="OFF">Show everything</option><option value="NO_EXPLICIT">Hide explicit songs</option><option value="FAMILY">Family-safe only</option>
            </select>
          </Field>
        </div>
        <div className="row"><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
          </div>
      </form>
      <AccountSecurity user={user} setUser={setUser} navigate={navigate} />
      <HiddenSongs />

      <form className="card stack section" style={{ '--gap': '10px' }} onSubmit={exportData}>
        <h3>Download your data</h3>
        <p className="small soft">Export the personal data LOOP stores for this account as a JSON file. The export includes your profile, preferences, listening history, ratings, likes, playlists, searches and artist-account records where applicable. Password hashes, session credentials, token hashes, IP hashes and other users’ data are excluded. Your current password is required, and exports are limited to once per hour.</p>
        <Field label="Confirm your current password">
          <input className="input" type="password" autoComplete="current-password" value={exportPassword}
            onChange={(e) => setExportPassword(e.target.value)} maxLength={72} required />
        </Field>
        <div className="row"><button className="btn ghost" disabled={exportBusy || !exportPassword}>{exportBusy ? 'Preparing export…' : 'Download my data (JSON)'}</button></div>
      </form>

      <div className="card stack section" style={{ '--gap': '6px' }} id="credits">
        <h3>About and credits</h3>
        <p className="small soft">LOOP uses the 28,372-record Music Dataset: 1950 to 2019, supplied for this project. It includes track title, artist, year, genre, topic labels and audio features.</p>
        <p className="small soft">Creators: Luan Moura, Emanuel Fontelles, Vinicius Sampaio and Mardônio França. Licensed under CC BY 4.0.</p>
        <p className="small soft">Lyrics are excluded. The uploaded files contain no original recordings, track durations, language labels, album metadata or film metadata. Songs are shown as catalogue records only; audio playback is not available from this dataset.</p>
        <div className="row wrap small"><a className="link" href="https://www.kaggle.com/datasets/saurabhshahane/music-dataset-1950-to-2019" target="_blank" rel="noreferrer">Kaggle source</a><a className="link" href="https://doi.org/10.17632/3t9vbwxgr5.3" target="_blank" rel="noreferrer">Mendeley Data</a></div>
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



function AccountSecurity({ user, setUser, navigate }) {
  const toast = useToast();
  const sessions = useApi(() => api.sessions(), []);
  const [revoking, setRevoking] = useState(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletePhrase, setDeletePhrase] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const registered = user.role !== 'GUEST' && !user.email?.endsWith('@guest.loop.invalid');
  const isArtist = user.permissions?.includes('artist.upload');

  const revoke = async (session) => {
    if (session.current || revoking) return;
    setRevoking(session.id);
    try {
      await api.revokeSession(session.id);
      sessions.setData((old) => (old || []).filter((item) => item.id !== session.id));
      toast.success('That session has been signed out');
    } catch (err) { toast.error(err); }
    finally { setRevoking(null); }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) return toast.error('The new passwords do not match.');
    if (!/(?=.*[A-Za-z])(?=.*\d).{8,72}/.test(newPassword)) return toast.error('Use 8–72 characters with at least one letter and one number.');
    setPasswordBusy(true);
    try {
      const result = await api.changePassword({ currentPassword, newPassword });
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      await sessions.reload();
      toast.success(`Password changed. ${result.otherSessionsRevoked || 0} other session(s) signed out.`);
    } catch (err) { toast.error(err); }
    finally { setPasswordBusy(false); }
  };

  const deleteAccount = async (e) => {
    e.preventDefault();
    if (deletePhrase !== 'DELETE') return toast.error('Type DELETE exactly to confirm.');
    setDeleteBusy(true);
    try {
      await api.deleteAccount({ password: deletePassword, confirm: 'DELETE' });
      setUser(null);
      toast.success('Your account was deleted');
      navigate('/login', { replace: true });
    } catch (err) { toast.error(err); }
    finally { setDeleteBusy(false); }
  };

  const date = (value) => {
    if (!value) return 'Unknown';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 'Unknown' : parsed.toLocaleString();
  };
  return (
    <section className="stack section" aria-labelledby="privacy-security-title" style={{ '--gap': '14px' }}>
      <div className="stack" style={{ '--gap': '4px' }}>
        <h2 id="privacy-security-title">Privacy &amp; account security</h2>
        <p className="small soft">Manage access to your account and understand what LOOP stores about your activity.</p>
      </div>

      <div className="card stack" style={{ '--gap': '10px' }}>
        <div className="row between wrap"><h3>Signed-in devices</h3><button className="btn ghost sm" onClick={sessions.reload} disabled={sessions.loading}>Refresh</button></div>
        <p className="small soft">These are active sign-in sessions for your account. You can sign out a device without affecting this device.</p>
        {sessions.loading && <p className="small muted">Loading sessions…</p>}
        {sessions.error && <ErrorState error={sessions.error} onRetry={sessions.reload} />}
        {sessions.data && sessions.data.length === 0 && <p className="small muted">No active sessions were returned.</p>}
        {sessions.data?.map((session) => (
          <div className="row between wrap session-device" key={session.id}>
            <div className="stack" style={{ '--gap': '2px', minWidth: 0 }}>
              <div className="row wrap small" style={{ '--gap': '6px' }}>
                <strong>{session.userAgent || 'Unknown device / browser'}</strong>
                {session.current && <span className="pill">This device</span>}
              </div>
              <span className="tiny muted">Last active {date(session.lastSeenAt)} · Expires {date(session.expiresAt)}</span>
            </div>
            <button className="btn ghost sm danger" disabled={session.current || !!revoking} onClick={() => revoke(session)}>
              {revoking === session.id ? 'Signing out…' : session.current ? 'Current session' : 'Sign out'}
            </button>
          </div>
        ))}
      </div>

      {registered ? (
        <form className="card stack" style={{ '--gap': '10px' }} onSubmit={changePassword}>
          <h3>Change password</h3>
          <p className="small soft">Changing your password signs out every other active session.</p>
          <Field label="Current password"><input className="input" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} maxLength={72} required /></Field>
          <div className="grid-2">
            <Field label="New password" hint="8–72 characters; at least one letter and one number."><input className="input" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} maxLength={72} required /></Field>
            <Field label="Confirm new password"><input className="input" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} maxLength={72} required /></Field>
          </div>
          <div className="row"><button className="btn primary" disabled={passwordBusy || !currentPassword || !newPassword || !confirmPassword}>{passwordBusy ? 'Updating…' : 'Change password'}</button></div>
        </form>
      ) : (
        <div className="card stack" style={{ '--gap': '6px' }}><h3>Guest account</h3><p className="small soft">Guest sessions do not have a password to change or a permanent identity to delete. Create an account to secure your preferences and data.</p><div className="row"><Link className="btn primary sm" to="/register">Create an account</Link></div></div>
      )}

      <div className="card stack" style={{ '--gap': '8px' }}>
        <h3>Your data at a glance</h3>
        <p className="small soft">Depending on the features you use, LOOP may store:</p>
        <ul className="small soft" style={{ margin: 0, paddingLeft: 20 }}>
          <li>Account identity, profile settings, selected languages, and content preferences.</li>
          <li>Your likes, ratings, dismissed songs, playlists, searches, and non-private listening history.</li>
          <li>Private Mood Diary check-ins and notes, visible only to you and excluded from recommendation training.</li>
          <li>Sign-in session metadata used to keep your account secure. Ended sign-in sessions are purged after 30 days by the server housekeeping job.</li>
          {isArtist && <li>Artist applications, uploaded track metadata, rights declarations, and moderation records.</li>}
        </ul>
        <p className="tiny muted">The Download your data section below provides a password-confirmed JSON export. It excludes password hashes, session credentials, token hashes, IP hashes, and other users’ records.</p>
      </div>

      {registered && (
        <form className="card stack" style={{ '--gap': '10px' }} onSubmit={deleteAccount}>
          <h3>Delete account</h3>
          {isArtist ? <p className="small soft">Artist uploads and rights reports may need to be retained for legal and moderation history. The server may refuse immediate deletion and direct you to a reviewed deactivation or anonymisation process.</p> : <p className="small soft">This permanently removes your account and ordinary listener data. Download your data first if you want a copy. This action cannot be undone.</p>}
          <Field label="Current password"><input className="input" type="password" autoComplete="current-password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} maxLength={72} required /></Field>
          <Field label="Type DELETE to confirm"><input className="input" value={deletePhrase} onChange={(e) => setDeletePhrase(e.target.value)} autoComplete="off" required /></Field>
          <div className="row"><button className="btn ghost danger" disabled={deleteBusy || !deletePassword || deletePhrase !== 'DELETE'}>{deleteBusy ? 'Deleting…' : 'Permanently delete my account'}</button></div>
        </form>
      )}
    </section>
  );
}

import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { Field, PageHead, ErrorState } from '../components/ui';
import { beginSpotifyAuth, disconnectSpotify, getSpotifyClientId, getSpotifyRedirectUri, isSpotifyConnected, saveSpotifyClientId } from '../lib/spotifyAuth';

export default function Settings() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const opts = useApi(() => api.onboardingOptions(), []);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const [spotifyClientId, setSpotifyClientId] = useState(() => getSpotifyClientId());
  const [spotifyConnected, setSpotifyConnected] = useState(() => isSpotifyConnected());
  const [spotifyStatus, setSpotifyStatus] = useState('');
  const [spotifyBusy, setSpotifyBusy] = useState(false);
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
  useEffect(() => {
    if (searchParams.get('spotify') === 'connected') {
      setSpotifyConnected(isSpotifyConnected());
      setSpotifyStatus('Spotify account connected. Search now uses your authorised Spotify session.');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const saveSpotifyId = (event) => {
    event.preventDefault();
    try {
      saveSpotifyClientId(spotifyClientId);
      setSpotifyStatus(spotifyClientId.trim() ? 'Spotify Client ID saved in this browser.' : 'Spotify Client ID cleared.');
      toast.success('Spotify Client ID saved');
    } catch (error) {
      setSpotifyStatus(error.message || 'Could not save the Spotify Client ID.');
      toast.error(error);
    }
  };
  const connectSpotify = async () => {
    setSpotifyBusy(true);
    try {
      saveSpotifyClientId(spotifyClientId);
      setSpotifyStatus('Redirecting to Spotify for secure account authorisation…');
      await beginSpotifyAuth(spotifyClientId);
    } catch (error) {
      setSpotifyStatus(error.message || 'Spotify connection could not start.');
      toast.error(error);
      setSpotifyBusy(false);
    }
  };
  const clearSpotify = () => {
    disconnectSpotify();
    setSpotifyConnected(false);
    setSpotifyStatus('Spotify account disconnected from this browser session.');
    toast.info('Spotify disconnected');
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
      <PageHead kicker="DBMS / ACCOUNT & API CONFIGURATION" title="Settings"><p className="small muted">Connect the music catalogue, manage your database-backed profile and protect your account.</p></PageHead>
      <section className="card stack section provider-settings-card" aria-labelledby="provider-settings-title" id="spotify">
        <div className="stack" style={{ '--gap': '5px' }}>
          <h2 id="provider-settings-title">Spotify connection</h2>
          <p className="small soft">Add your Spotify Client ID, save it here, and connect your Spotify account. LOOP uses the Spotify Web API for catalogue search and the official Spotify Embed for listening.</p>
        </div>
        <form className="stack" onSubmit={saveSpotifyId}>
          <Field label="Spotify Client ID" hint="Use the Client ID from Spotify Developer Dashboard. Do not enter your account password or Client Secret here.">
            <input className="input" type="text" value={spotifyClientId} onChange={(event) => { setSpotifyClientId(event.target.value); setSpotifyStatus(''); }} autoComplete="off" spellCheck="false" maxLength={128} placeholder="Paste Spotify Client ID" />
          </Field>
          <div className="stack" style={{ '--gap': 4 }}>
            <span className="tiny muted">Redirect URI — add this exact address to your Spotify app settings</span>
            <code style={{ wordBreak: 'break-all' }}>{getSpotifyRedirectUri()}</code>
          </div>
          <div className="row wrap">
            <button className="btn primary" type="submit">Save Client ID</button>
            <button className="btn ghost" type="button" onClick={connectSpotify} disabled={spotifyBusy || !spotifyClientId.trim()}>{spotifyBusy ? 'Connecting…' : 'Connect Spotify'}</button>
            {spotifyConnected && <button className="btn ghost" type="button" onClick={clearSpotify}>Disconnect</button>}
          </div>
          <div className="row wrap"><span className={`chip ${spotifyConnected ? 'success' : ''}`}>{spotifyConnected ? 'Spotify account connected' : 'Spotify account not connected'}</span></div>
          {spotifyStatus && <p className="small" role="status">{spotifyStatus}</p>}
        </form>
        <div className="provider-policy-note">
          <strong>Playback and data policy:</strong> Search metadata is requested with the connected user's OAuth access token. Listening happens in Spotify's unmodified official embedded player; LOOP does not download, extract, cache or re-host Spotify audio. Full playback and availability are controlled by Spotify, the user's Premium status, market and embed experience.
        </div>
        <p className="tiny muted">Spotify developer app: <a className="link" href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">Open Dashboard ↗</a>. Keep your Client Secret private; this browser PKCE flow does not need it.</p>
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

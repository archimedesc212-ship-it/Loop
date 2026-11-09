// Providers & media: configuration state of every external integration (never
// the secret values), an explicit "Test" for each, TMDB film enrichment, and
// licensed local media registration.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../hooks/useAuth';
import { ErrorState, ListSkeleton, Field, Empty } from '../../components/ui';
import { dateTime } from '../../lib/format';

const STATE = {
  ready: ['ok', 'Ready'],
  disabled: ['muted', 'Disabled'],
  missing_credentials: ['warn', 'Missing credentials'],
  invalid_config: ['bad', 'Invalid configuration'],
};

function StateBadge({ state }) {
  const [cls, label] = STATE[state] || ['muted', state];
  return <span className={`status ${cls}`}>{label}</span>;
}

function ProviderTable() {
  const { can } = useAuth();
  const list = useApi(() => api.admin.providers(), []);
  const [busy, setBusy] = useState(null);
  const [results, setResults] = useState({});
  const test = async (p) => {
    if (p.code === 'YOUTUBE_DATA' && !window.confirm('A YouTube test uses one of your project’s daily search calls (100 per day by default). Continue?')) return;
    setBusy(p.code);
    try {
      const r = await api.admin.testProvider(p.code);
      setResults((x) => ({ ...x, [p.code]: { ok: true, text: `OK in ${r.ms} ms (${r.sample} result${r.sample === 1 ? '' : 's'})` } }));
    } catch (e) {
      setResults((x) => ({ ...x, [p.code]: { ok: false, text: e.message } }));
    } finally { setBusy(null); list.reload(); }
  };
  if (list.loading) return <ListSkeleton n={6} />;
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />;
  return (
    <div className="table-wrap"><table className="data">
      <caption className="sr-only">External providers and their configuration state</caption>
      <thead><tr><th scope="col">Provider</th><th scope="col">Purpose</th><th scope="col">State</th><th scope="col">Settings (.env)</th><th scope="col">Last success</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
      <tbody>{list.data.map((p) => (
        <tr key={p.code}>
          <td><strong>{p.name}</strong><div className="tiny muted mono">{p.code}</div></td>
          <td className="small">{p.purpose}<div className="tiny muted">{p.terms}</div></td>
          <td><StateBadge state={p.state} />
            {p.missing && <div className="tiny muted">needs {p.missing.join(', ')}</div>}
            {p.message && <div className="tiny" style={{ color: 'var(--bad)' }}>{p.message}</div>}
            {p.detail && <div className="tiny muted">{p.detail}</div>}
            {p.catalogueEnabled === false && p.kind === 'PLAYBACK' && <div className="tiny muted">source switched off in Pipeline › Sources</div>}
          </td>
          <td className="tiny mono">{p.env.join(', ')}<div className="muted" style={{ fontFamily: 'inherit' }}>{p.credential}</div>
            {p.signup && <a className="link" href={p.signup} target="_blank" rel="noopener noreferrer">Get credentials</a>}</td>
          <td className="tiny">{p.lastSuccessAt ? dateTime(p.lastSuccessAt) : '—'}</td>
          <td>
            {can('pipeline.run') && <button className="btn sm" onClick={() => test(p)} disabled={busy === p.code || p.state !== 'ready'}
              title={p.state !== 'ready' ? 'Configure it in .env and restart the API first' : 'Make one small real request'}>{busy === p.code ? 'Testing…' : 'Test'}</button>}
            {results[p.code] && <div className="tiny" role="status" style={{ color: results[p.code].ok ? 'var(--good)' : 'var(--bad)', maxWidth: 220 }}>{results[p.code].text}</div>}
          </td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

function Films() {
  const toast = useToast();
  const films = useApi(() => api.admin.films(), []);
  const [busy, setBusy] = useState(null);
  const [cands, setCands] = useState({});
  const enrich = async (f, tmdbId) => {
    setBusy(f.id);
    try {
      const r = await api.admin.enrichFilm(f.id, tmdbId);
      if (r.stored) { toast.success(`${f.title}: TMDB ${r.created ? 'details added' : r.changed ? 'details updated' : 'already up to date'}`); setCands((c) => ({ ...c, [f.id]: null })); films.reload(); }
      else { setCands((c) => ({ ...c, [f.id]: r.candidates })); toast.info(r.reason === 'NO_RESULTS' ? `TMDB found nothing for “${f.title}”.` : `No confident match for “${f.title}” — choose one below.`); }
    } catch (e) { toast.error(e); } finally { setBusy(null); }
  };
  if (films.loading) return <ListSkeleton n={3} />;
  if (films.error) return <ErrorState error={films.error} onRetry={films.reload} />;
  if (!films.data.length) return <Empty title="No films in the catalogue" />;
  return (
    <div className="stack" style={{ '--gap': '8px' }}>
      {films.data.map((f) => (
        <div key={f.id} className="stack" style={{ '--gap': '6px' }}>
          <div className="row between small wrap">
            <span><Link className="link" to={`/film/${f.id}`}>{f.title}</Link> <span className="muted">· {f.releaseYear} · {f.language} · {f.albums} album(s)</span>
              {f.tmdbId && <span className="chip" style={{ marginLeft: 8 }}>TMDB #{f.tmdbId}</span>}</span>
            <button className="btn ghost sm" onClick={() => enrich(f)} disabled={busy === f.id}>{busy === f.id ? 'Looking up…' : f.tmdbId ? 'Refresh from TMDB' : 'Find on TMDB'}</button>
          </div>
          {cands[f.id] && cands[f.id].length > 0 && (
            <div className="row wrap" style={{ '--gap': '6px', paddingLeft: 12 }}>
              {cands[f.id].map((c) => <button key={c.tmdbId} className="chip" onClick={() => enrich(f, c.tmdbId)}>{c.title} ({c.year || '?'})</button>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function LocalMedia() {
  const toast = useToast();
  const media = useApi(() => api.admin.media(), []);
  const [form, setForm] = useState({ songId: '', fileName: '', attribution: '' });
  const [busy, setBusy] = useState(false);
  const register = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.admin.registerMedia(Number(form.songId), { fileName: form.fileName, attribution: form.attribution || undefined });
      toast.success(r.created ? 'File registered — the song now plays from it' : 'Already registered; availability refreshed');
      media.reload();
    } catch (err) { toast.error(err); } finally { setBusy(false); }
  };
  const check = async () => {
    try { const r = await api.admin.checkMedia(); toast.success(`Checked ${r.checked} file(s): ${r.available} available, ${r.unavailable} missing`); media.reload(); } catch (e) { toast.error(e); }
  };
  return (
    <div className="stack" style={{ '--gap': '12px' }}>
      {media.error && <ErrorState error={media.error} onRetry={media.reload} />}
      {media.data && (
        <div className="table-wrap"><table className="data">
          <thead><tr><th scope="col">Media type</th><th scope="col">Source</th><th scope="col">Availability</th><th scope="col">Songs</th></tr></thead>
          <tbody>{media.data.summary.map((r) => <tr key={`${r.type}${r.source}${r.availability}`}><td>{r.type}</td><td className="mono tiny">{r.source}</td><td><span className={`status ${r.availability === 'AVAILABLE' ? 'ok' : r.availability === 'UNAVAILABLE' ? 'bad' : 'muted'}`}>{r.availability}</span></td><td className="num">{r.n}</td></tr>)}</tbody>
        </table></div>
      )}
      <form className="stack" style={{ '--gap': '10px' }} onSubmit={register} aria-label="Register a local audio file">
        <p className="small soft">Put audio files you own or are licensed to use in the server’s local media folder, then attach one to a song. Only signed-in users can stream it.</p>
        <div className="grid-3">
          <Field label="Song ID"><input className="input" inputMode="numeric" required value={form.songId} onChange={(e) => setForm({ ...form, songId: e.target.value.replace(/\D/g, '') })} /></Field>
          <Field label="File name" hint={media.data ? `${media.data.localFiles.length} file(s) in the folder` : undefined}>
            <input className="input" list="local-files" required value={form.fileName} onChange={(e) => setForm({ ...form, fileName: e.target.value })} />
          </Field>
          <datalist id="local-files">{media.data && media.data.localFiles.map((f) => <option key={f} value={f} />)}</datalist>
          <Field label="Attribution (optional)"><input className="input" maxLength={200} value={form.attribution} onChange={(e) => setForm({ ...form, attribution: e.target.value })} /></Field>
        </div>
        <div className="row"><button className="btn primary sm" disabled={busy}>{busy ? 'Registering…' : 'Register file'}</button>
          <button type="button" className="btn ghost sm" onClick={check}>Re-check files</button></div>
      </form>
    </div>
  );
}

export function ProvidersAdmin() {
  return (
    <div className="stack" style={{ '--gap': '22px' }}>
      <section className="panel stack">
        <h3>External providers</h3>
        <p className="small soft">Every provider is off until its settings are in <code>.env</code> and the API is restarted. MUSE runs fully without any of them. Secret values are never shown here. See <code>docs/PROVIDERS.md</code>.</p>
        <ProviderTable />
      </section>
      <section className="panel stack">
        <h3>Film details (TMDB)</h3>
        <Films />
      </section>
      <section className="panel stack">
        <h3>Playback media</h3>
        <LocalMedia />
      </section>
    </div>
  );
}

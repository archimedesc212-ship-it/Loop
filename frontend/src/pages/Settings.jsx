import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { Field, PageHead, ErrorState, ListSkeleton } from '../components/ui';

export default function Settings() {
  const { user, setUser } = useAuth();
  const toast = useToast();
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
      <PageHead title="Settings" />
      {opts.error && <ErrorState error={opts.error} onRetry={opts.reload} />}
      <form className="stack" style={{ '--gap': '18px' }} onSubmit={save}>
        <Field label="Display name"><input className="input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} maxLength={60} /></Field>
        <div className="field"><span>Languages</span>
          {opts.data && opts.data.languages.length === 0 && <p className="small muted">The supplied dataset has no language column. LOOP leaves language unknown rather than guessing it from the artist or title.</p>}
          <div className="row wrap" style={{ '--gap': '8px' }}>
            {opts.data && opts.data.languages.map((l) => {
              const at = form.languageIds.indexOf(l.id);
              return <button type="button" key={l.id} className={`pick${at >= 0 ? ' on' : ''}`} aria-pressed={at >= 0} onClick={() => toggleLang(l.id)}>{at >= 0 && <span className="order">{at + 1}</span>}{l.name} <span className="muted">{l.nativeName}</span></button>;
            })}
          </div>
        </div>
        <div className="grid-2">
          <Field label="Region" hint="Regional metadata was not included in the supplied dataset, so LOOP does not infer it.">
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
          </div>
      </form>
      <HiddenSongs />

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


// Cold start: six short steps. Order of picks = strength (first pick weighs most).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { BrandMark } from '../components/Icons';
import { ErrorState, Thinking } from '../components/ui';

function Picks({ items, selected, onChange, max, render = (x) => x.name, idOf = (x) => x.id }) {
  const toggle = (id) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else if (selected.length < max) onChange([...selected, id]);
  };
  return (
    <div className="row wrap" style={{ '--gap': '8px' }}>
      {items.map((it) => {
        const id = idOf(it); const at = selected.indexOf(id);
        return (
          <button key={id} type="button" className={`pick${at >= 0 ? ' on' : ''}`} onClick={() => toggle(id)} aria-pressed={at >= 0}>
            {at >= 0 && <span className="order">{at + 1}</span>}{render(it)}
          </button>
        );
      })}
    </div>
  );
}

export default function Onboarding() {
  const { data, error, loading, reload } = useApi(() => api.onboardingOptions(), []);
  const { refresh, user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [a, setA] = useState({ languageIds: [], genreIds: [], artistIds: [], composerIds: [], moodIds: [], contextCodes: [], regionCode: '', listeningHabit: 'MIXED', contentFilter: 'OFF' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setA((s) => ({ ...s, [k]: v }));
  // "Redo onboarding" starts from the answers saved last time
  useEffect(() => { if (data && data.current) setA((s) => ({ ...s, ...data.current })); }, [data]);
  const withSongs = data ? data.languages.filter((l) => l.songs > 0) : [];
  const languages = withSongs.length ? withSongs : (data ? data.languages : []);   // empty catalogue: still offer every language

  const steps = [
    { title: 'Which languages do you listen in?', hint: 'Pick up to five, favourite first. You can change this any time.', ok: a.languageIds.length > 0,
      body: data && <Picks items={languages} selected={a.languageIds} onChange={set('languageIds')} max={5} render={(l) => <>{l.name} <span className="muted">{l.nativeName}</span></>} /> },
    { title: 'Genres you enjoy', hint: 'Up to six. LOOP uses these only until your listening says more.', ok: true,
      body: data && <Picks items={data.genres} selected={a.genreIds} onChange={set('genreIds')} max={6} /> },
    { title: 'Artists you already like', hint: 'Optional — up to eight.', ok: true,
      body: data && (data.artists.length === 0 ? <p className="small soft">No artists in the catalogue yet — skip this step.</p> : <Picks items={data.artists} selected={a.artistIds} onChange={set('artistIds')} max={8} render={(x) => <>{x.name}{x.language && <span className="muted"> · {x.language}</span>}</>} />) },
    { title: 'Composers and film music', hint: 'Optional — up to four. Many songs you love may come from film soundtracks; pick the composers behind them.', ok: true,
      body: data && (data.composers.length
        ? <Picks items={data.composers} selected={a.composerIds} onChange={set('composerIds')} max={4} render={(x) => <>{x.name}{x.films && <span className="muted"> · {x.films}</span>}</>} />
        : <p className="small soft">No composers in the catalogue yet — skip this step.</p>) },
    { title: 'Moods and moments', hint: 'Which moods do you reach for, and when do you listen most?', ok: true,
      body: data && (
        <div className="stack" style={{ '--gap': '18px' }}>
          <Picks items={data.moods} selected={a.moodIds} onChange={set('moodIds')} max={5} render={(m) => <>{m.emoji} {m.name}</>} />
          <Picks items={data.contexts} selected={a.contextCodes} onChange={set('contextCodes')} max={4} idOf={(c) => c.code} render={(c) => <>{c.emoji} {c.name}</>} />
        </div>
      ) },
    { title: 'A couple of settings', hint: 'Your region is a light signal for discovery, never an assumption about your taste.', ok: true,
      body: data && (
        <div className="grid-2">
          <label className="field"><span>Region (optional)</span>
            <select className="select" value={a.regionCode} onChange={(e) => set('regionCode')(e.target.value)}>
              <option value="">Prefer not to say</option>{data.regions.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
            </select></label>
          <label className="field"><span>Content filter</span>
            <select className="select" value={a.contentFilter} onChange={(e) => set('contentFilter')(e.target.value)}>
              <option value="OFF">Show everything</option><option value="NO_EXPLICIT">Hide explicit songs</option><option value="FAMILY">Family-safe only</option>
            </select></label>
          <label className="field"><span>How do you usually listen?</span>
            <select className="select" value={a.listeningHabit} onChange={(e) => set('listeningHabit')(e.target.value)}>
              <option value="BACKGROUND">In the background</option><option value="ACTIVE">Focused, song by song</option><option value="MIXED">A bit of both</option>
            </select></label>
        </div>
      ) },
  ];

  const finish = async () => {
    setBusy(true);
    try {
      await api.saveOnboarding({ ...a, regionCode: a.regionCode || undefined });
      await refresh();
      toast.success('Your first mixes are ready.');
      nav('/', { replace: true });
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  const s = steps[step];
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'start center', padding: '48px 16px' }}>
      <div className="stack page" style={{ width: 'min(760px, 100%)', '--gap': '22px' }}>
        <div className="row between"><div className="row"><BrandMark width={32} height={32} /><strong>Hi {user.displayName.split(' ')[0]}</strong></div><span className="small muted">Step {step + 1} of {steps.length}</span></div>
        <div className="steps" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={step + 1} aria-label="Onboarding progress">{steps.map((_, i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
        <div><h1 className="display" style={{ fontSize: 'clamp(1.8rem, 3.6vw, 2.6rem)' }}>{s.title}</h1><p className="soft" style={{ marginTop: 8 }}>{s.hint}</p></div>
        {loading && <Thinking label="Loading choices" />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {s.body}
        <div className="row between" style={{ marginTop: 8 }}>
          <button className="btn ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
          {step < steps.length - 1
            ? <button className="btn primary" disabled={!s.ok} onClick={() => setStep(step + 1)}>Continue</button>
            : <button className="btn primary" disabled={busy || !a.languageIds.length} onClick={finish}>{busy ? 'Saving…' : 'Build my first mix'}</button>}
        </div>
      </div>
    </div>
  );
}

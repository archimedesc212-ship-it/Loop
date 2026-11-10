import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import { MoodTiles, FeelInput, Interpretation, RecHeader, RecList, HERO_MOODS } from '../components/Rec';
import { ErrorState, Thinking, ListSkeleton, MoodChip } from '../components/ui';
import TopRatedByMood from '../components/TopRatedByMood';

const SUGGESTIONS = ['I need something calm for studying', 'I want something energetic for my workout', "I've had a rough day and want something peaceful", 'Feeling nostalgic tonight', 'Not happy, need motivation'];

export default function MoodPage() {
  const loc = useLocation();
  const moods = useApi(() => api.moods(), []);
  const contexts = useApi(() => api.contexts(), []);
  const [selected, setSelected] = useState(loc.state?.moodIds || []);
  const [text, setText] = useState(loc.state?.text || '');
  const [contextCode, setContextCode] = useState(loc.state?.contextCode || '');
  const [showAll, setShowAll] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const resultRef = useRef(null);

  const run = async (override) => {
    const body = { moodIds: selected, text: text.trim() || undefined, contextCode: contextCode || undefined, limit: 20, ...override };
    if (!body.moodIds.length && !body.text) return;
    setBusy(true); setError(null);
    try {
      const r = await api.recMood(body);
      setResult(r);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (e) { setError(e); setResult(null); } finally { setBusy(false); }
  };
  // arrived from the home hero with a choice already made
  useEffect(() => { if (loc.state && (loc.state.moodIds?.length || loc.state.text)) run(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 4 ? [...s, id] : s));
  const ctxList = contexts.data || [];

  return (
    <div className="page">
      <div className="stack" style={{ '--gap': '20px', maxWidth: 980 }}>
        <div className="stack" style={{ '--gap': '8px' }}>
          <h1 className="display">How are you feeling?</h1>
          <p className="lead">Pick up to four moods or describe a sound in your own words. LOOP matches your request against the topic labels and audio features in the uploaded music dataset.</p>
        </div>
        <FeelInput value={text} onChange={setText} onSubmit={() => run()} busy={busy} />
        <div className="row wrap" style={{ '--gap': '6px' }}>
          {SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => { setText(s); run({ text: s, moodIds: selected }); }}>{s}</button>)}
        </div>
        {moods.error && <ErrorState error={moods.error} onRetry={moods.reload} />}
        {moods.data && (
          <>
            <MoodTiles moods={moods.data} selected={selected} onToggle={toggle} only={showAll ? null : HERO_MOODS} />
            <div className="row between wrap">
              <button className="btn ghost sm" onClick={() => setShowAll(!showAll)}>{showAll ? 'Fewer moods' : `All ${moods.data.length} moods`}</button>
              <div className="row wrap" style={{ '--gap': '6px' }}>
                <span className="small muted">For</span>
                <div className="toggle-group" role="group" aria-label="Activity">
                  <button className={!contextCode ? 'on' : ''} onClick={() => setContextCode('')}>Anything</button>
                  {ctxList.slice(0, 7).map((c) => <button key={c.code} className={contextCode === c.code ? 'on' : ''} onClick={() => setContextCode(c.code)}>{c.emoji} {c.name}</button>)}
                </div>
              </div>
            </div>
            <div className="row">
              <button className="btn primary" disabled={busy || (!selected.length && text.trim().length < 2)} onClick={() => run()}>
                {busy ? 'Finding…' : selected.length ? `Find ${moods.data.filter((m) => selected.includes(m.id)).map((m) => m.name).join(' + ')}` : 'Find music'}
              </button>
              {(selected.length > 0 || text) && <button className="btn ghost" onClick={() => { setSelected([]); setText(''); setResult(null); setError(null); }}>Clear</button>}
            </div>
          </>
        )}
      </div>

      <div ref={resultRef} className="section" style={{ scrollMarginTop: 20 }}>
        {busy && <div className="stack"><Thinking /><ListSkeleton n={6} /></div>}
        {!busy && error && (
          <div className="stack" style={{ maxWidth: 680 }}>
            <ErrorState error={error} />
            {error.details?.suggestions && <div className="row wrap" style={{ '--gap': '6px' }}>{error.details.suggestions.map((s) => <button key={s} className="chip" onClick={() => { setText(s); run({ text: s }); }}>{s}</button>)}</div>}
          </div>
        )}
        {!busy && result && (
          <div className="stack page" style={{ '--gap': '22px' }}>
            <div className="stack" style={{ '--gap': '10px' }}>
              <div className="soft small">Your mood feels like</div>
              <h2 className="display" style={{ fontSize: 'clamp(2.2rem, 5vw, 3.6rem)' }}>
                {result.interpretation.moods.slice(0, 2).map((m, i) => (
                  <span key={m.id}>{i > 0 && <span className="muted"> + </span>}<span style={{ boxShadow: `inset 0 -0.14em 0 ${m.color}` }}>{m.name}</span></span>
                ))}
              </h2>
              {result.interpretation.moods.length > 2 && (
                <div className="row wrap" style={{ '--gap': '6px' }}><span className="small muted">with a touch of</span>
                  {result.interpretation.moods.slice(2).map((m) => <MoodChip key={m.id} name={m.name} emoji={m.emoji} color={m.color} />)}</div>
              )}
            </div>
            <Interpretation list={result} />
            <RecHeader list={{ ...result, title: 'Archive matches', subtitle: 'Matched using the supplied topic labels and audio features.' }} />
            <RecList list={result} />
          </div>
        )}
      </div>

      {moods.data && moods.data.length > 0 && (
        <div className="section" style={{ maxWidth: 980 }}>
          <TopRatedByMood moods={moods.data} />
        </div>
      )}
    </div>
  );
}

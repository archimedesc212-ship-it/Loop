import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import { MoodTiles, FeelInput, Interpretation, RecHeader, RecList, HERO_MOODS } from '../components/Rec';
import { ErrorState, Thinking, ListSkeleton, MoodChip } from '../components/ui';
import TopRatedByMood from '../components/TopRatedByMood';

const SUGGESTIONS = ['I need something calm for studying', 'I want something energetic for my workout', "I've had a rough day and want something peaceful", 'Feeling nostalgic tonight', 'Not happy, need motivation'];

function equalWeights(ids) {
  if (!ids.length) return {};
  const part = Math.floor((100 / ids.length) * 100) / 100;
  return Object.fromEntries(ids.map((id, index) => [id, index === ids.length - 1 ? Math.round((100 - part * (ids.length - 1)) * 100) / 100 : part]));
}

export default function MoodPage() {
  const loc = useLocation();
  const moods = useApi(() => api.moods(), []);
  const contexts = useApi(() => api.contexts(), []);
  const [selected, setSelected] = useState(loc.state?.moodIds || []);
  const [weights, setWeights] = useState(() => equalWeights(loc.state?.moodIds || []));
  const [text, setText] = useState(loc.state?.text || '');
  const [contextCode, setContextCode] = useState(loc.state?.contextCode || '');
  const [showAll, setShowAll] = useState(false);
  const [result, setResult] = useState(null);
  const [dialEnergy, setDialEnergy] = useState(0.55);
  const [dialValence, setDialValence] = useState(0.6);
  const [dialResult, setDialResult] = useState(null);
  const [journeyStart, setJourneyStart] = useState('');
  const [journeyTarget, setJourneyTarget] = useState('');
  const [journeyResult, setJourneyResult] = useState(null);
  const [journeyBusy, setJourneyBusy] = useState(false);
  const [journeyError, setJourneyError] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const resultRef = useRef(null);

  const run = async (override) => {
    const body = { moodIds: selected, moodWeights: selected.length ? selected.map((moodId) => ({ moodId, weight: Number(weights[moodId] || 0) })) : undefined, text: text.trim() || undefined, contextCode: contextCode || undefined, limit: 20, ...override };
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

  const toggle = (id) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : selected.length < 4 ? [...selected, id] : selected;
    setSelected(next);
    setWeights(equalWeights(next));
  };
  const setMoodWeight = (id, raw) => {
    if (selected.length <= 1) return;
    const chosen = Math.max(1, Math.min(99, Number(raw) || 1));
    const others = selected.filter((x) => x !== id);
    const oldTotal = others.reduce((sum, other) => sum + Number(weights[other] || 0), 0) || others.length;
    let allocated = 0;
    const next = { ...weights, [id]: chosen };
    others.forEach((other, index) => {
      const value = index === others.length - 1
        ? Math.round((100 - chosen - allocated) * 100) / 100
        : Math.round(((100 - chosen) * (Number(weights[other] || 1) / oldTotal)) * 100) / 100;
      next[other] = Math.max(0.01, value);
      allocated += next[other];
    });
    // Correct rounding on the final item to keep the sum at exactly 100.00.
    const last = others[others.length - 1];
    next[last] = Math.round((next[last] + 100 - selected.reduce((sum, moodId) => sum + Number(next[moodId] || 0), 0)) * 100) / 100;
    setWeights(next);
  };
  const runDial = async () => {
    setBusy(true); setError(null); setResult(null);
    try { setDialResult(await api.recDial({ energy: dialEnergy, valence: dialValence, limit: 20 })); }
    catch (e) { setError(e); setDialResult(null); } finally { setBusy(false); }
  };
  const runJourney = async () => {
    if (!journeyStart || !journeyTarget) return;
    setJourneyBusy(true); setJourneyError(null); setJourneyResult(null);
    try { setJourneyResult(await api.recJourney({ startMoodId: Number(journeyStart), targetMoodId: Number(journeyTarget), steps: 4, perStage: 5 })); }
    catch (e) { setJourneyError(e); } finally { setJourneyBusy(false); }
  };
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
            {selected.length > 0 && (
              <div className="card stack" style={{ '--gap': '10px' }}>
                <div className="row between wrap"><b>Blend your moods</b><span className="small muted">Total: {selected.reduce((sum, id) => sum + Number(weights[id] || 0), 0).toFixed(2)}%</span></div>
                <p className="tiny muted">Give each selected mood a share of the sound. LOOP validates that all weights add up to 100%.</p>
                {selected.map((id) => {
                  const mood = moods.data.find((item) => item.id === id);
                  return <div key={id} className="row between"><span className="small">{mood?.emoji} {mood?.name}</span>
                    <label className="row small" style={{ '--gap': '6px' }}><input className="input" type="number" min="1" max="99" step="0.01" value={Number(weights[id] || 0).toFixed(2)} disabled={selected.length === 1}
                      onChange={(e) => setMoodWeight(id, e.target.value)} style={{ width: 92 }} aria-label={`${mood?.name} mood weight`} /><span>%</span></label></div>;
                })}
              </div>
            )}
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

      {moods.data && moods.data.length > 0 && (
        <div className="section grid-2" style={{ maxWidth: 980, alignItems: 'stretch' }}>
          <section className="card stack" style={{ '--gap': '12px' }}>
            <div><h2 className="section-title">Mood Dial</h2><p className="small muted">Choose a point between low/high energy and negative/positive sound. LOOP finds the nearest named mood and adjusts the sound profile to your exact point.</p></div>
            <label className="field"><span>Energy · {Math.round(dialEnergy * 100)}%</span><input type="range" min="0" max="1" step="0.01" value={dialEnergy} onChange={(e) => setDialEnergy(Number(e.target.value))} /></label>
            <label className="field"><span>Positivity · {Math.round(dialValence * 100)}%</span><input type="range" min="0" max="1" step="0.01" value={dialValence} onChange={(e) => setDialValence(Number(e.target.value))} /></label>
            <button className="btn primary" disabled={busy} onClick={runDial}>{busy ? 'Finding…' : 'Find my dial mix'}</button>
            {dialResult && <div className="stack"><RecHeader list={dialResult} /><RecList list={dialResult} /></div>}
          </section>
          <section className="card stack" style={{ '--gap': '12px' }}>
            <div><h2 className="section-title">Mood Journey</h2><p className="small muted">Build a sequence that gradually moves from one sound to another using the real catalogue audio features.</p></div>
            <label className="field"><span>Start mood</span><select className="select" value={journeyStart} onChange={(e) => setJourneyStart(e.target.value)}><option value="">Choose a starting mood</option>{moods.data.map((m) => <option key={m.id} value={m.id}>{m.emoji} {m.name}</option>)}</select></label>
            <label className="field"><span>Destination mood</span><select className="select" value={journeyTarget} onChange={(e) => setJourneyTarget(e.target.value)}><option value="">Choose a destination mood</option>{moods.data.map((m) => <option key={m.id} value={m.id}>{m.emoji} {m.name}</option>)}</select></label>
            <button className="btn primary" disabled={journeyBusy || !journeyStart || !journeyTarget} onClick={runJourney}>{journeyBusy ? 'Building journey…' : 'Build my journey'}</button>
            {journeyError && <ErrorState error={journeyError} />}
            {journeyBusy && <Thinking label="Building gradual sound transitions" />}
          </section>
        </div>
      )}
      {journeyResult && <div className="section page stack" style={{ '--gap': '18px', maxWidth: 980 }}>
        <div><h2 className="display">{journeyResult.title}</h2><p className="small muted">{journeyResult.subtitle}</p></div>
        {journeyResult.stages.map((stage, index) => <section key={`${stage.batchId}-${index}`} className="panel stack" style={{ '--gap': '10px' }}><RecHeader list={stage} /><RecList list={stage} /></section>)}
      </div>}

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

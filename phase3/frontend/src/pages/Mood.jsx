import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import { MoodTiles, FeelInput, Interpretation, RecHeader, RecList, HERO_MOODS } from '../components/Rec';
import { ErrorState, Thinking } from '../components/ui';

const SUGGESTIONS = [
  'Calm music for studying',
  'Energetic songs for a workout',
  'Peaceful music after a long day',
  'Something romantic',
];

export default function MoodPage() {
  const location = useLocation();
  const moods = useApi(() => api.moods(), []);
  const contexts = useApi(() => api.contexts(), []);
  const [selected, setSelected] = useState(location.state?.moodIds || []);
  const [text, setText] = useState(location.state?.text || '');
  const [contextCode, setContextCode] = useState(location.state?.contextCode || '');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const findMusic = async (override = {}) => {
    const moodIds = override.moodIds ?? selected;
    const moodText = override.text ?? text;
    if (!moodIds.length && moodText.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const response = await api.recMood({
        moodIds,
        text: moodText.trim() || undefined,
        contextCode: override.contextCode ?? (contextCode || undefined),
        limit: 20,
      });
      setResult(response);
    } catch (requestError) {
      setResult(null);
      setError(requestError);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (location.state && (location.state.moodIds?.length || location.state.text)) {
      findMusic({ moodIds: location.state.moodIds || [], text: location.state.text || '' });
    }
    // Run once for the initial navigation state only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMood = (id) => {
    setSelected((current) => current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id].slice(-3));
  };
  const clear = () => {
    setSelected([]);
    setText('');
    setContextCode('');
    setResult(null);
    setError(null);
  };

  return (
    <div className="page stack" style={{ '--gap': '22px', maxWidth: 980 }}>
      <div className="stack" style={{ '--gap': '8px' }}>
        <div className="soft small">Discover</div>
        <h1 className="display">Find music for your mood</h1>
        <p className="lead">Pick up to three moods or describe what you want to hear. You can also choose what you are doing.</p>
      </div>

      <FeelInput value={text} onChange={setText} onSubmit={() => findMusic()} busy={busy} placeholder="I want something relaxed and peaceful…" />

      <div className="row wrap" style={{ '--gap': '7px' }}>
        {SUGGESTIONS.map((suggestion) => (
          <button key={suggestion} className="chip" type="button" onClick={() => { setText(suggestion); findMusic({ text: suggestion }); }}>{suggestion}</button>
        ))}
      </div>

      {moods.loading && <Thinking label="Loading moods" />}
      {moods.error && <ErrorState error={moods.error} onRetry={moods.reload} />}
      {moods.data && <section className="stack" style={{ '--gap': '12px' }}>
        <div className="row between wrap">
          <h2 className="section-title">Choose your mood</h2>
          <span className="small muted">{selected.length}/3 selected</span>
        </div>
        <MoodTiles moods={moods.data} only={HERO_MOODS} selected={selected} onToggle={toggleMood} />
      </section>}

      {contexts.data?.length > 0 && <label className="field" style={{ maxWidth: 340 }}>
        <span>What are you doing? (optional)</span>
        <select className="select" value={contextCode} onChange={(event) => setContextCode(event.target.value)}>
          <option value="">Anything</option>
          {contexts.data.map((context) => <option key={context.code} value={context.code}>{context.name}</option>)}
        </select>
      </label>}

      <div className="row wrap">
        <button className="btn primary" disabled={busy || (!selected.length && text.trim().length < 2)} onClick={() => findMusic()}>{busy ? 'Finding music…' : 'Find music'}</button>
        {(selected.length > 0 || text || contextCode) && <button className="btn ghost" onClick={clear}>Clear</button>}
      </div>

      {error && <ErrorState error={error} onRetry={() => findMusic()} />}
      {busy && !result && <Thinking label="Finding tracks for you" />}
      {result && <section className="section stack" style={{ '--gap': '18px' }}>
        <RecHeader list={result} kicker="Your recommendations" />
        <Interpretation list={result} />
        <RecList list={result} />
      </section>}
    </div>
  );
}

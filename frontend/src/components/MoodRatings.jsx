// "How well does this song fit each mood?" — the signed-in user's 0–100 ratings,
// shown next to the average of all listeners and the AI's own prediction, which are
// labelled separately and never mixed. Moods come from the database (GET …/mood-ratings).
import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';
import { ErrorState, Skeleton } from './ui';
import { validatePct, formatPct, formatAi, ratingCount } from '../lib/moodRating';

/** Moods worth showing first: the AI tagged them, someone rated them, or the user did. */
const relevant = (m) => m.aiConfidence !== null || m.community || m.mine;

export function MoodRatingRow({ mood, draft, error, disabled, onChange, onRemove, removing }) {
  const id = `mr-${mood.id}`;
  const value = draft ?? (mood.mine ? String(mood.mine.matchPercentage) : '');
  const sliderValue = Number.isFinite(Number(value)) && value !== '' ? Math.min(100, Math.max(0, Number(value))) : 0;
  const changed = draft !== undefined && draft !== (mood.mine ? String(mood.mine.matchPercentage) : '');
  return (
    <div className={`mr-row${changed ? ' changed' : ''}`} style={{ '--mood': mood.color || 'var(--accent)' }}>
      <div className="mr-name">
        <span className="mr-dot" aria-hidden="true" />
        <span>{mood.emoji} {mood.name}</span>
      </div>

      <div className="mr-community" aria-label={`${mood.name}: listeners' average`}>
        {mood.community ? (
          <>
            <div className="mr-bar" aria-hidden="true"><i style={{ width: `${mood.community.average}%` }} /></div>
            <span className="num small">{formatPct(mood.community.average)}</span>
            <span className="tiny muted">{ratingCount(mood.community.count)}</span>
          </>
        ) : <span className="tiny muted">No ratings yet</span>}
      </div>

      <div className="mr-ai tiny muted" title="The mood model's prediction, not a user rating">
        {mood.aiConfidence !== null ? <>AI {formatAi(mood.aiConfidence)}</> : <>AI —</>}
      </div>

      <div className="mr-mine">
        <input type="range" min="0" max="100" step="0.5" value={sliderValue} disabled={disabled}
          aria-label={`Your ${mood.name} match, percent`} onChange={(e) => onChange(mood.id, e.target.value)}
          className={value === '' ? 'unset' : ''} />
        <input id={id} className="input mr-num" inputMode="decimal" value={value} placeholder="—" disabled={disabled}
          aria-label={`Your ${mood.name} match, number from 0 to 100`} aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined} onChange={(e) => onChange(mood.id, e.target.value)} />
        <span className="tiny muted">%</span>
        <span className="mr-action">
          {mood.mine && !changed && (
            <button className="btn ghost sm" disabled={disabled || removing} onClick={() => onRemove(mood.id)} aria-label={`Remove your ${mood.name} rating`}>
              {removing ? '…' : 'Remove'}
            </button>
          )}
        </span>
      </div>
      {error && <small id={`${id}-err`} className="field-error mr-err" role="alert">{error}</small>}
    </div>
  );
}

export default function MoodRatings({ songId, privateSession = false }) {
  const toast = useToast();
  const { data, error, loading, reload } = useApi(() => api.moodRatings(songId), [songId]);
  const [drafts, setDrafts] = useState({});
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [removing, setRemoving] = useState(null);
  useEffect(() => { setDrafts({}); setSaveError(null); }, [songId]);

  const errors = useMemo(() => {
    const out = {};
    for (const [id, v] of Object.entries(drafts)) {
      if (v === '') continue;   // an emptied box just means "no change"
      const r = validatePct(v);
      if (!r.ok) out[id] = r.error;
    }
    return out;
  }, [drafts]);

  if (loading && !data) return <div className="card stack" style={{ '--gap': '10px' }}><Skeleton h={20} w="40%" /><Skeleton h={120} /></div>;
  if (error) return <div className="card"><ErrorState error={error} onRetry={reload} /></div>;
  if (!data) return null;

  const paused = privateSession || data.privateSession;
  const moods = data.moods;
  const shown = showAll ? moods : moods.filter((m) => relevant(m) || drafts[m.id] !== undefined);
  const list = shown.length ? shown : moods;
  const pending = Object.entries(drafts)
    .filter(([id, v]) => v !== '' && !errors[id])
    .map(([id, v]) => ({ moodId: Number(id), matchPercentage: validatePct(v).value }))
    .filter((p) => {
      const m = moods.find((x) => x.id === p.moodId);
      return !m.mine || m.mine.matchPercentage !== p.matchPercentage;
    });
  const hasErrors = Object.keys(errors).length > 0;

  const change = (id, v) => { setSaveError(null); setDrafts((d) => ({ ...d, [id]: v })); };
  const save = async () => {
    if (!pending.length || hasErrors) return;
    setSaving(true); setSaveError(null);
    try {
      const r = await api.saveMoodRatings(songId, pending);
      const created = r.saved.filter((s) => s.created).length;
      toast.success(`Saved ${r.saved.length} mood rating${r.saved.length > 1 ? 's' : ''}${created && created < r.saved.length ? ` (${created} new)` : ''}`);
      setDrafts({});
      await reload();
    } catch (e) { setSaveError(e); } finally { setSaving(false); }
  };
  const remove = async (moodId) => {
    setRemoving(moodId);
    try { await api.removeMoodRating(songId, moodId); toast.success('Rating removed'); await reload(); } catch (e) { toast.error(e); } finally { setRemoving(null); }
  };

  return (
    <section className="card stack mood-ratings" style={{ '--gap': '14px' }} aria-labelledby="mr-title">
      <div className="row between wrap">
        <div className="stack" style={{ '--gap': '4px' }}>
          <h3 id="mr-title">How well does it fit each mood?</h3>
          <p className="tiny muted" style={{ maxWidth: '62ch' }}>
            Rate each mood from 0 to 100 %. <b>Listeners</b> is the average of everyone's ratings; <b>AI</b> is the mood model's own
            prediction. Your ratings never change the AI's.
          </p>
        </div>
        <span className="tiny muted">{data.totals.ratings ? `${ratingCount(data.totals.ratings)} from ${data.totals.raters} listener${data.totals.raters > 1 ? 's' : ''}` : 'No mood ratings for this song yet'}</span>
      </div>

      {paused && <div className="tiny" style={{ color: 'var(--private)' }}>Mood ratings are paused during a private session, so your profile stays unchanged.</div>}

      <div className="mr-head tiny muted" aria-hidden="true"><span>Mood</span><span>Listeners</span><span>AI</span><span>Your rating</span></div>
      <div className="mr-list">
        {list.map((m) => (
          <MoodRatingRow key={m.id} mood={m} draft={drafts[m.id]} error={errors[m.id]} disabled={paused || saving}
            onChange={change} onRemove={remove} removing={removing === m.id} />
        ))}
      </div>

      {saveError && <div className="field-error" role="alert">{saveError.message}</div>}
      <div className="row between wrap">
        <button className="btn ghost sm" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show fewer moods' : `Show all ${moods.length} moods`}
        </button>
        <div className="row wrap">
          {Object.keys(drafts).length > 0 && <button className="btn ghost sm" onClick={() => { setDrafts({}); setSaveError(null); }} disabled={saving}>Discard</button>}
          <button className="btn primary sm" onClick={save} disabled={paused || saving || hasErrors || !pending.length}>
            {saving ? 'Saving…' : pending.length ? `Save ${pending.length} rating${pending.length > 1 ? 's' : ''}` : 'Save ratings'}
          </button>
        </div>
      </div>
    </section>
  );
}

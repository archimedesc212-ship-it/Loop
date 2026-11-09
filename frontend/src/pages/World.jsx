// LOOP World: this week's generated musical world, its evidence, songs and versions.
import { useState } from 'react';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';
import { usePlayer } from '../hooks/usePlayer';
import { WorldArt } from '../components/Art';
import { TrackList } from '../components/Songs';
import { SaveListButton } from '../components/Rec';
import { ErrorState, Thinking, Skeleton, Empty } from '../components/ui';
import { Play, Refresh, Undo, Heart, ThumbDown } from '../components/Icons';
import { date, dateTime, longDuration } from '../lib/format';

export default function World() {
  const { data, error, loading, reload, setData } = useApi(() => api.world(), []);
  const toast = useToast();
  const player = usePlayer();
  const [busy, setBusy] = useState(null);
  const act = async (kind) => {
    setBusy(kind);
    try {
      const r = kind === 'regen' ? await api.regenerateWorld() : await api.rollbackWorld();
      setData(r);
      toast.success(kind === 'regen' ? `New version: “${r.world.title}” (v${r.world.version})` : `Rolled back to v${r.world.version}: “${r.world.title}”`);
    } catch (e) { toast.error(e); } finally { setBusy(null); }
  };
  const feedback = async (value) => {
    const next = data.world.feedback === value ? null : value;
    setBusy('feedback');
    try {
      await api.worldFeedback(data.world.id, next);
      setData({ ...data, world: { ...data.world, feedback: next } });
      toast.success(next === 'LOVE' ? 'Noted — future worlds lean this way.' : next === 'NOT_FOR_ME' ? 'Noted — LOOP will steer away from this kind of world.' : 'Feedback removed.');
    } catch (e) { toast.error(e); } finally { setBusy(null); }
  };
  if (loading) return <div className="page stack"><Skeleton h={340} r={28} /><Thinking label="Building your world" /></div>;
  if (error && error.code === 'INCOGNITO_ACTIVE') return <div className="page"><Empty title="Your world is waiting">{error.message}</Empty></div>;
  if (error) return <div className="page"><ErrorState error={error} onRetry={reload} /></div>;
  const { world, songs, versions, history } = data;
  const s = world.signals || {};
  const canRollback = versions.some((v) => v.version < world.version && v.status === 'SUPERSEDED');

  return (
    <div className="page stack" style={{ '--gap': '28px' }}>
      <section className="hero" style={{ minHeight: 380, display: 'flex', alignItems: 'flex-end' }}>
        <div className="hero-art"><WorldArt theme={world.theme} /></div>
        <div className="stack" style={{ '--gap': '12px', maxWidth: 620 }}>
          <div className="row wrap" style={{ '--gap': '8px' }}>
            <span className="chip accent">Week of {date(world.weekStart)}</span>
            <span className="chip">{world.archetype.name}</span>
            <span className="chip">v{world.version}</span>
          </div>
          <h1 className="display" style={{ fontSize: 'clamp(2.6rem, 6vw, 4.6rem)' }}>{world.title}</h1>
          <p className="lead">{world.description}</p>
          <div className="row wrap">
            <button className="btn primary" onClick={() => player.play(songs[0], { queue: songs, origin: 'WORLD', batchId: world.batchId })} disabled={!songs.length}><Play />Enter the world</button>
            <SaveListButton list={{ batchId: world.batchId, title: world.title, songs }} defaultName={world.title} />
            <button className="btn ghost" onClick={() => act('regen')} disabled={!!busy}><Refresh />{busy === 'regen' ? 'Generating…' : 'New version'}</button>
            {canRollback && <button className="btn ghost" onClick={() => act('rollback')} disabled={!!busy}><Undo />Roll back</button>}
          </div>
          <div className="row wrap" role="group" aria-label="Your feedback on this world" style={{ '--gap': '8px' }}>
            <button className={`btn sm${world.feedback === 'LOVE' ? ' on' : ' ghost'}`} aria-pressed={world.feedback === 'LOVE'} onClick={() => feedback('LOVE')} disabled={!!busy}><Heart filled={world.feedback === 'LOVE'} />Love this world</button>
            <button className={`btn sm${world.feedback === 'NOT_FOR_ME' ? ' on' : ' ghost'}`} aria-pressed={world.feedback === 'NOT_FOR_ME'} onClick={() => feedback('NOT_FOR_ME')} disabled={!!busy}><ThumbDown />Not for me</button>
          </div>
          <p className="tiny muted">{world.songCount} songs · {longDuration(world.totalDurationSec)} · generated {dateTime(world.generatedAt)} · expires {date(world.expiresAt)}</p>
          <p className="tiny muted">A new world is made each week by the scheduler when the API runs with background jobs on; “New version” makes one now.</p>
        </div>
      </section>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card stack" style={{ '--gap': '12px' }}>
          <h3>What this world was built from</h3>
          <div className="stack small" style={{ '--gap': '8px' }}>
            {s.topMoods && s.topMoods.length > 0 && <div><span className="muted">Your strongest moods · </span>{s.topMoods.map((m) => `${m.mood} (${Math.round(m.blended * 100)})`).join(', ')}</div>}
            {s.language && <div><span className="muted">Language · </span>{s.language.name} {s.language.source === 'listening' ? `(${s.language.playsLast30d} plays in 30 days)` : '(from your settings)'}</div>}
            {s.region && <div><span className="muted">Region signal · </span>{s.region}</div>}
            {s.regionalTrendingMoods && s.regionalTrendingMoods.length > 0 && <div><span className="muted">Rising near you · </span>{s.regionalTrendingMoods.map((m) => m.mood).join(', ')}</div>}
            {s.season && <div><span className="muted">Season · </span>this archetype is in season (months {s.season.months})</div>}
            {s.previousArchetype && <div><span className="muted">Last week · </span>{s.previousArchetype.toLowerCase()} (penalised so worlds change)</div>}
            {s.feedback && s.feedback.length > 0 && <div><span className="muted">Your feedback · </span>{s.feedback.map((f) => `${f.archetype.toLowerCase()} ${f.love ? '♥'.repeat(f.love) : ''}${f.notForMe ? ' not for me' : ''}`).join(', ')}</div>}
          </div>
          {s.archetypeScores && (
            <div className="stack" style={{ '--gap': '6px', marginTop: 4 }}>
              <span className="tiny muted">Archetype scores (taste fit + season − repetition ± your feedback)</span>
              {s.archetypeScores.map((a, i) => (
                <div key={a.archetype} className="signal">
                  <span className={i === 0 ? '' : 'soft'}>{a.archetype}</span>
                  <div className="bar"><i style={{ width: `${Math.min(100, (a.score / s.archetypeScores[0].score) * 100)}%`, opacity: i === 0 ? 1 : 0.5 }} /></div>
                  <span className="num muted">{a.score.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card stack" style={{ '--gap': '10px' }}>
          <h3>Versions this week</h3>
          {versions.map((v) => (
            <div key={v.id} className="row between small">
              <span>v{v.version} · {v.title}</span>
              <span className="row" style={{ '--gap': '8px' }}><span className="muted">{dateTime(v.generatedAt)}</span><span className={`status ${v.status}`}>{v.status}</span></span>
            </div>
          ))}
          <p className="tiny muted">Every version is kept. Rolling back re-activates the previous one; nothing is deleted.</p>
          {history.length > 0 && (
            <>
              <h3 style={{ marginTop: 8 }}>Past worlds</h3>
              <div className="grid-2" style={{ gap: 10 }}>
                {history.map((h) => (
                  <div key={h.id} className="cover" style={{ height: 90, borderRadius: 12, position: 'relative' }}>
                    <WorldArt theme={h.theme} animate={false} />
                    <div style={{ position: 'absolute', inset: 'auto 10px 8px', fontSize: '0.8rem', fontWeight: 600, textShadow: '0 1px 6px #000' }}>{h.title}<div className="tiny" style={{ opacity: 0.8 }}>{date(h.weekStart)}</div></div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <section>
        <div className="section-head"><h2 className="section-title">Songs in this world</h2></div>
        <TrackList songs={songs} batchId={world.batchId} origin="WORLD" explain dismissable />
      </section>
    </div>
  );
}

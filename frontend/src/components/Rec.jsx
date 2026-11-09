// Mood picker + the shared view of a generated list (interpretation, targets, ranked songs, save).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import { usePlayer } from '../hooks/usePlayer';
import { TrackList } from './Songs';
import { MoodChip, Meter, Modal, Field } from './ui';
import { Play, Save, Arrow } from './Icons';

export const HERO_MOODS = ['Happy', 'Sad', 'Energetic', 'Calm', 'Romantic', 'Motivational', 'Nostalgic', 'Focused', 'Relaxed', 'Dreamy'];

export function MoodTiles({ moods, selected, onToggle, only }) {
  const list = only ? only.map((n) => moods.find((m) => m.name === n)).filter(Boolean) : moods;
  return (
    <div className="mood-grid" role="group" aria-label="Moods">
      {list.map((m) => {
        const on = selected.includes(m.id);
        return (
          <button key={m.id} type="button" className={`mood-tile${on ? ' on' : ''}`} style={{ '--mood': m.color }} onClick={() => onToggle(m.id)} aria-pressed={on}>
            <span className="emoji" aria-hidden="true">{m.emoji}</span>
            <span className="name">{m.name}</span>
          </button>
        );
      })}
    </div>
  );
}

export function FeelInput({ value, onChange, onSubmit, busy, placeholder = 'I’ve had a rough day and want something peaceful…' }) {
  return (
    <form className="feel-input" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label="Describe how you’re feeling" maxLength={280} />
      <button className="btn primary" disabled={busy || value.trim().length < 2}>Find music<Arrow /></button>
    </form>
  );
}

export function SaveListButton({ list, defaultName }) {
  const toast = useToast();
  const { user } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName || list.title || 'My mix');
  const [busy, setBusy] = useState(false);
  if (!list.batchId && list.smartType !== 'MOST_REPLAYED') return null;
  const save = async () => {
    setBusy(true);
    try {
      const p = list.batchId
        ? await api.saveBatch({ batchId: list.batchId, name: name.trim(), smartType: list.smartType })
        : await api.saveSmart(list.smartType, name.trim());
      toast.success(`Saved “${p.name}” · ${p.songCount} songs`);
      setOpen(false);
      nav(`/playlist/${p.id}`);
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)} disabled={user.incognito} title={user.incognito ? 'Saving is paused in a private session' : undefined}><Save />Save as playlist</button>
      {open && (
        <Modal title="Save as playlist" onClose={() => setOpen(false)}>
          <div className="stack">
            <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
            <p className="small muted">The songs are saved in their ranked order. The list keeps a link to the recommendation it came from.</p>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn primary" onClick={save} disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save playlist'}</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

/** "How LOOP read that": parsed phrases, chosen moods and the target sound. */
export function Interpretation({ list }) {
  const it = list.interpretation;
  if (!it) return null;
  const parse = it.parse;
  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <div className="card stack" style={{ '--gap': '12px' }}>
        <h3>How LOOP read that</h3>
        {parse && parse.matches.length > 0 ? (
          <div className="stack" style={{ '--gap': '8px' }}>
            {parse.matches.map((m, i) => (
              <div key={i} className="row wrap small" style={{ '--gap': '8px' }}>
                <span className="chip" style={m.negated ? { textDecoration: 'line-through' } : undefined}>“{m.phrase}”</span>
                <span className="muted">→</span>
                {m.readAs ? <span className="soft">{m.readAs}</span> : (
                  <>{m.moods.map((x) => <span key={x} className="soft">{x}</span>)}{m.context && <span className="chip accent">{m.context}</span>}{m.boosted && <span className="muted">(stronger)</span>}</>
                )}
              </div>
            ))}
          </div>
        ) : parse && parse.source === 'AI'
          ? <p className="small soft">LOOP’s own word list didn’t recognise that, so the optional AI helper suggested these moods. Only moods that exist in LOOP are accepted.</p>
          : <p className="small soft">You picked these moods directly{list.context ? ` for ${list.context.name.toLowerCase()}` : ''}.</p>}
        <div className="row wrap" style={{ '--gap': '6px' }}>
          {it.moods.map((m) => <MoodChip key={m.id} name={m.name} emoji={m.emoji} color={m.color} weight={m.weight} />)}
          {list.context && <span className="chip accent">{list.context.emoji} {list.context.name}</span>}
        </div>
      </div>
      <div className="card stack" style={{ '--gap': '10px' }}>
        <h3>The sound it is looking for</h3>
        {it.summary.map((s) => (s.score === null
          ? <div key={s.label} className="meter"><span className="soft">{s.label}</span><span className="small">{s.value}</span><span /></div>
          : <Meter key={s.label} label={s.label} value={s.score} display={s.value} />))}
      </div>
    </div>
  );
}

export function RecHeader({ list, kicker }) {
  const player = usePlayer();
  const origin = { MOOD: 'MOOD', TEXT: 'MOOD', CONTEXT: 'CONTEXT', WORLD: 'WORLD', SMART_PLAYLIST: 'SMART_PLAYLIST' }[list.strategy] || 'HOME';
  return (
    <div className="row between wrap" style={{ alignItems: 'flex-end', gap: 16 }}>
      <div className="stack" style={{ '--gap': '6px' }}>
        {kicker && <div className="soft small">{kicker}</div>}
        <h1 className="display">{list.title}</h1>
        {list.subtitle && <p className="soft">{list.subtitle}</p>}
        <p className="tiny muted">{list.songs.length} songs{list.model ? ` · ranked by ${list.model}` : ''}{list.incognito ? ' · private session' : ''}</p>
      </div>
      <div className="row wrap">
        {list.songs.length > 0 && <button className="btn primary" onClick={() => player.play(list.songs[0], { queue: list.songs, origin, batchId: list.batchId })}><Play />Play all</button>}
        <SaveListButton list={list} />
      </div>
    </div>
  );
}

export function RecList({ list, explain = true }) {
  const origin = { MOOD: 'MOOD', TEXT: 'MOOD', CONTEXT: 'CONTEXT', WORLD: 'WORLD', SMART_PLAYLIST: 'SMART_PLAYLIST' }[list.strategy] || 'HOME';
  return <TrackList songs={list.songs} batchId={list.batchId} origin={origin} explain={explain && list.batchId != null} dismissable={list.batchId != null} />;
}

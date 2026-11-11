// Song card, track list with "Why this song?", like / rate / add-to-playlist.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cover } from './Art';
import { Heart, Play, Pause, Plus, Info, Star, X, ThumbDown, List } from './Icons';
import { MoodChip } from './ui';
import { usePlayer, isPlayable } from '../hooks/usePlayer';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { duration, score } from '../lib/format';

const moodColor = {};
export const registerMoodColors = (moods) => moods.forEach((m) => { moodColor[m.name] = m.color; });
export const colorOf = (name) => moodColor[name];

/** Honest playback label: metadata-only songs say so; the demo sketch is labelled. */
export function PlaybackBadge({ song, verbose = false }) {
  const pb = song.playback;
  if (!pb) return null;
  if (!pb.playable) return <span className="chip badge-meta" title="No permitted audio source is available for this song. Its details are shown, but it cannot be played.">Metadata only</span>;
  if (verbose && pb.demo) return <span className="chip badge-demo" title="Playback is a demo sketch synthesised from the song’s analysed features — not the recording.">Demo sketch</span>;
  if (verbose && pb.type === 'PREVIEW') return <span className="chip">Preview</span>;
  if (pb.type === 'YOUTUBE_LOOKUP') return <span className="chip" title="Playback opens the official YouTube embedded player. Availability varies by track and region.">YouTube lookup</span>;
  if (verbose && pb.type === 'USER_LOCAL') return <span className="chip">Licensed file</span>;
  return null;
}

/** "Not for me": hides the song from future recommendations (undo from the toast or Settings). */
export function DismissButton({ song, batchId, onDismissed }) {
  const toast = useToast();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  if (user?.incognito) return null;   // paused in private sessions
  const dismiss = async (e) => {
    e.stopPropagation();
    setBusy(true);
    try {
      await api.dismiss(song.id, batchId);
      onDismissed?.(song);
      toast.info(`“${song.title}” won’t be recommended again. Undo it in Settings › Hidden songs.`);
    } catch (err) { toast.error(err); } finally { setBusy(false); }
  };
  return (
    <button className="icon-btn" onClick={dismiss} disabled={busy} aria-label={`Not for me: stop recommending ${song.title}`} title="Not for me">
      <ThumbDown />
    </button>
  );
}

export function PlayNextButton({ song }) {
  const player = usePlayer();
  if (!isPlayable(song) || !player.current) return null;
  return (
    <button className="icon-btn" onClick={(e) => { e.stopPropagation(); player.playNext(song); }} aria-label={`Play ${song.title} next`} title="Play next">
      <List />
    </button>
  );
}

export function LikeButton({ song, onChange }) {
  const toast = useToast();
  const { user } = useAuth();
  const [liked, setLiked] = useState(!!song.liked);
  useEffect(() => setLiked(!!song.liked), [song.id, song.liked]);
  const toggle = async (e) => {
    e.stopPropagation();
    const next = !liked;
    setLiked(next);                                   // optimistic
    try {
      await api.like(song.id, next);
      onChange?.(next);
    } catch (err) {
      setLiked(!next);
      toast.error(err);
    }
  };
  return (
    <button className={`icon-btn${liked ? ' on' : ''}`} onClick={toggle} aria-pressed={liked}
      aria-label={liked ? `Unlike ${song.title}` : `Like ${song.title}`} title={user?.incognito ? 'Paused in a private session' : undefined}>
      <Heart filled={liked} />
    </button>
  );
}

export function Stars({ song, size = 18, onRated }) {
  const toast = useToast();
  const [value, setValue] = useState(song.myRating || 0);
  const [hover, setHover] = useState(0);
  useEffect(() => setValue(song.myRating || 0), [song.id, song.myRating]);
  const rate = async (v) => {
    const prev = value;
    setValue(v);
    try {
      const r = await api.rate(song.id, v);
      toast.success(`Rated ${v}★ — your ${r.previous ? 'rating was updated' : 'taste profile was refreshed'}`);
      onRated?.(v);
    } catch (e) { setValue(prev); toast.error(e); }
  };
  return (
    <div className="row" style={{ '--gap': '2px' }} onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((v) => (
        <button key={v} className={`icon-btn${(hover || value) >= v ? ' on' : ''}`} style={{ width: size + 12, height: size + 12 }}
          onMouseEnter={() => setHover(v)} onClick={(e) => { e.stopPropagation(); rate(v); }} role="radio" aria-checked={value === v}
          aria-label={`${v} star${v > 1 ? 's' : ''}`}>
          <Star filled={(hover || value) >= v} width={size} height={size} />
        </button>
      ))}
    </div>
  );
}

export function AddToPlaylist({ song }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    api.playlists().then(setLists).catch((e) => { toast.error(e); setOpen(false); });
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, toast]);
  const add = async (p) => {
    try {
      const r = await api.addToPlaylist(p.id, song.id);
      toast.success(`Added to ${p.name} · ${r.songCount} songs`);
      setOpen(false);
    } catch (e) { toast.error(e); }
  };
  const createAndAdd = async () => {
    const name = window.prompt('New playlist name');
    if (!name) return;
    try {
      await api.createPlaylist({ name: name.slice(0, 80), songIds: [song.id] });
      toast.success(`Created “${name}” with this song`);
      setOpen(false);
    } catch (e) { toast.error(e); }
  };
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="icon-btn" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} aria-label={`Add ${song.title} to a playlist`} aria-expanded={open}>
        <Plus />
      </button>
      {open && (
        <div className="menu" style={{ right: 0, bottom: 40 }} onClick={(e) => e.stopPropagation()}>
          <button onClick={createAndAdd}><Plus width={16} height={16} /> New playlist…</button>
          {!lists && <div className="small muted" style={{ padding: 10 }}>Loading…</div>}
          {lists && lists.filter((p) => p.kind === 'MANUAL' || p.kind === 'SAVED_MIX').map((p) => (
            <button key={p.id} onClick={() => add(p)}>{p.name}<span className="muted tiny" style={{ marginLeft: 'auto' }}>{p.songCount}</span></button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SongCard({ song, queue, origin = 'HOME', batchId, reason }) {
  const player = usePlayer();
  const playing = player.isPlaying(song.id);
  const playable = isPlayable(song);
  const onPlay = () => (player.isCurrent(song.id) ? player.toggle() : player.play(song, { queue, origin, batchId }));
  return (
    <div className={`song-card${playing ? ' playing' : ''}${playable ? '' : ' unplayable'}`}>
      <Link to={`/song/${song.id}`} aria-label={`${song.title} details`}><Cover colors={song.cover} seed={song.album ? song.album.id * 31 + song.id : song.id} /></Link>
      {playable && (
        <button className="play-btn hover-play" onClick={onPlay} aria-label={playing ? `Pause ${song.title}` : `Play ${song.title}`}>
          {playing ? <Pause /> : <Play />}
        </button>
      )}
      <div style={{ minWidth: 0 }}>
        <div className="title" title={song.title}>{song.title}{song.explicit && <span className="chip" style={{ height: 18, marginLeft: 6, fontSize: '0.66rem' }}>E</span>}</div>
        {(!playable || song.playback?.type === 'YOUTUBE_LOOKUP') && <PlaybackBadge song={song} />}
        <div className="meta">
        {song.artist?.id
          ? <Link to={`/artist/${song.artist.id}`}>{song.artist.name || 'Unknown artist'}</Link>
          : (song.artist?.name || 'Unknown artist')}
        {' · '}{song.genre?.name || song.language?.name || 'Unknown language'}
      </div>
      </div>
      {reason ? <div className="small soft" style={{ minHeight: 40 }}>{reason}</div> : (
        <div className="row" style={{ '--gap': '6px', overflow: 'hidden' }}>
          {(Array.isArray(song.moods) ? song.moods : [])
            .map((m) => (typeof m === 'string' ? m : m?.name))
            .filter(Boolean)
            .slice(0, 2)
            .map((m) => <MoodChip key={m} name={m} color={colorOf(m)} />)}
        </div>
      )}
      <div className="card-actions">
        <span className="tiny muted num">{duration(song.durationSec)}</span>
        <div className="row" style={{ '--gap': '0px' }}>
          <LikeButton song={song} />
          <AddToPlaylist song={song} />
        </div>
      </div>
    </div>
  );
}

function WhyPanel({ song }) {
  const signals = (song.breakdown && song.breakdown.signals) || [];
  const confidence = song.confidence;
  return (
    <div className="why">
      <div className="row between wrap" style={{ marginBottom: 10 }}>
        <strong>Why this song?</strong>
        <span className="tiny muted">Score {score(song.score)} / 100 · every reason below comes from stored signals</span>
      </div>
      {confidence && (
        <div className="card stack" style={{ '--gap': '5px', marginBottom: 12, padding: 12 }}>
          <div className="row between wrap"><b className="small">Match evidence</b><span className="chip">{confidence.label}</span></div>
          <p className="tiny soft">{confidence.level === 'NEW_USER_FALLBACK'
            ? 'This result is based mainly on your requested mood, sound and catalogue signals. LOOP does not yet have enough listening behaviour to personalise this match.'
            : confidence.level === 'LIMITED_DATA'
              ? 'Some personal listening evidence is available, but the match is supported by only a small number of independent signals.'
              : confidence.level === 'PARTIAL_MATCH'
                ? 'Several independent signals support this result, including at least one signal learned from your listening behaviour.'
                : 'Many independent signals support this result, including signals learned from your listening behaviour.'}</p>
          {confidence.supportingSignals?.length > 0 && <p className="tiny muted">Signals: {confidence.supportingSignals.join(' · ')}</p>}
        </div>
      )}
      {song.reasons && song.reasons.length > 0 ? (
        <ul style={{ marginBottom: 14 }}>{song.reasons.map((r) => <li key={r.code}>{r.text}</li>)}</ul>
      ) : <p className="small muted" style={{ marginBottom: 12 }}>Ranked on overall fit; no single signal stood out.</p>}
      <div className="stack" style={{ '--gap': '7px' }}>
        {signals.filter((s) => s.score !== null).map((s) => (
          <div className="signal" key={s.key}>
            <span className="soft">{s.label} <span className="muted">×{s.weight}</span></span>
            <div className="bar"><i style={{ width: `${Math.round(s.score * 100)}%` }} /></div>
            <span className="num muted">{Math.round(s.score * 100)}</span>
          </div>
        ))}
        {song.breakdown && song.breakdown.repetitionPenalty > 0 && (
          <div className="signal"><span className="soft">Repetition penalty</span>
            <div className="bar"><i style={{ width: `${Math.min(100, song.breakdown.repetitionPenalty * 400)}%`, background: 'var(--bad)' }} /></div>
            <span className="num muted">−{Math.round(song.breakdown.repetitionPenalty * 100)}</span></div>
        )}
      </div>
    </div>
  );
}

/** Ranked list. Shows score + "why" when the songs came from the recommender. */
export function TrackList({ songs: all, origin = 'HOME', batchId, showRank = true, explain = false, onRemove, extra, dismissable = false }) {
  const player = usePlayer();
  const [open, setOpen] = useState(null);
  const [hidden, setHidden] = useState(() => new Set());
  const songs = (all || []).filter((s) => !hidden.has(s.id));
  if (!songs.length) return null;
  return (
    <div className="tracks">
      {songs.map((s, i) => {
        const playing = player.isPlaying(s.id);
        const current = player.isCurrent(s.id);
        const playable = isPlayable(s);
        const onPlay = () => (current ? player.toggle() : player.play(s, { queue: songs, origin, batchId }));
        return (
          <div key={`${s.id}-${i}`} style={{ display: 'contents' }}>
            <div className={`track${current ? ' playing' : ''}${playable ? '' : ' unplayable'}`}>
              <span className="idx">
                {playing ? <span className="eq" aria-label="Playing"><i /><i /><i /></span> : (showRank ? s.rank || s.position || i + 1 : '')}
              </span>
              <button onClick={onPlay} style={{ border: 'none', padding: 0, background: 'none', position: 'relative' }} disabled={!playable}
                aria-label={!playable ? `${s.title} — metadata only, cannot be played` : playing ? `Pause ${s.title}` : `Play ${s.title}`}>
                <Cover colors={s.cover} seed={s.album ? s.album.id * 31 + s.id : s.id} />
              </button>
              <div style={{ minWidth: 0 }}>
                <Link to={`/song/${s.id}`} className="t-title" style={{ display: 'block' }}>{s.title}{s.explicit && <span className="chip" style={{ height: 18, marginLeft: 6, fontSize: '0.66rem' }}>E</span>}</Link>
                <div className="t-sub">
                  {s.artist?.id
                    ? <Link to={`/artist/${s.artist.id}`}>{s.artist.name || 'Unknown artist'}</Link>
                    : (s.artist?.name || 'Unknown artist')}
                  {' · '}
                  {s.language?.id
                    ? <Link to={`/language/${s.language.id}`}>{s.language.name || 'Unknown language'}</Link>
                    : (s.language?.name || 'Unknown language')}
                  {s.genre?.name ? ` · ${s.genre.name}` : ''}
                  {(!playable || s.playback?.type === 'YOUTUBE_LOOKUP') && <PlaybackBadge song={s} />}
                </div>
              </div>
              <div className="t-tags">
                {(Array.isArray(s.moods) ? s.moods : [])
                  .map((m) => (typeof m === 'string' ? m : m?.name))
                  .filter(Boolean)
                  .slice(0, 3)
                  .map((m) => <MoodChip key={m} name={m} color={colorOf(m)} />)}
              </div>
              <div className="t-actions">
                {explain && s.score !== undefined && <span className="score-pill" title="Recommendation score">{score(s.score)}</span>}
                {explain && (
                  <button className={`icon-btn${open === i ? ' on' : ''}`} onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} aria-label="Why this song?" title="Why this song?">
                    <Info />
                  </button>
                )}
                <LikeButton song={s} />
                <AddToPlaylist song={s} />
                <PlayNextButton song={s} />
                {dismissable && <DismissButton song={s} batchId={batchId} onDismissed={(x) => setHidden((h) => new Set(h).add(x.id))} />}
                {onRemove && <button className="icon-btn" onClick={() => onRemove(s)} aria-label="Remove from playlist" title="Remove"><X /></button>}
                {extra && extra(s)}
              </div>
              <span className="t-time">{duration(s.durationSec)}</span>
            </div>
            {explain && open === i && <WhyPanel song={s} />}
          </div>
        );
      })}
    </div>
  );
}

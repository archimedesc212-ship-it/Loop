import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import { usePlayer, isPlayable } from '../hooks/usePlayer';
import { Cover } from '../components/Art';
import { TrackList } from '../components/Songs';
import { ErrorState, ListSkeleton, Empty, Modal, Field, PageHead } from '../components/ui';
import { Play, Plus, X } from '../components/Icons';
import { ago, plural } from '../lib/format';
import { analysePlaylistHealth } from '../lib/playlistHealth';

function Mosaic({ covers, id }) {
  const list = (typeof covers === 'string' ? JSON.parse(covers) : covers) || [];
  if (!list.length) return <Cover colors={['#262D46', '#F2B544']} seed={id} />;
  return (
    <div className="cover" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', width: '100%', aspectRatio: 1, borderRadius: 12 }}>
      {[0, 1, 2, 3].map((i) => <Cover key={i} colors={list[i % list.length]} seed={id * 7 + i} className="" />)}
    </div>
  );
}

export default function Library() {
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [tab, setTab] = useState('playlists');
  const lists = useApi(() => api.playlists(), []);
  const smart = useApi(() => api.smartTypes(), []);
  const likes = useApi(() => (tab === 'liked' ? api.likes() : Promise.resolve(null)), [tab]);
  const history = useApi(() => (tab === 'history' ? api.history(50) : Promise.resolve(null)), [tab]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const create = async () => {
    try {
      const p = await api.createPlaylist({ name: name.trim() });
      toast.success(`Created “${p.name}”`);
      nav(`/playlist/${p.id}`);
    } catch (e) { toast.error(e); }
  };

  return (
    <div className="page">
      <PageHead title="Library" actions={<button className="btn" onClick={() => setCreating(true)} disabled={user.incognito}><Plus />New playlist</button>}>
        <div className="toggle-group" role="tablist">
          {[['playlists', 'Playlists'], ['smart', 'Smart playlists'], ['liked', 'Liked'], ['history', 'History']].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
      </PageHead>

      {tab === 'playlists' && (
        <>
          {lists.loading && <ListSkeleton />}
          {lists.error && <ErrorState error={lists.error} onRetry={lists.reload} />}
          {lists.data && lists.data.length === 0 && <Empty title="No playlists yet" action={<button className="btn primary sm" onClick={() => setCreating(true)}>Create one</button>}>Save any mix, or build a playlist song by song with the + button.</Empty>}
          {lists.data && lists.data.length > 0 && (
            <div className="shelf" style={{ gridAutoFlow: 'row', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', overflow: 'visible' }}>
              {lists.data.map((p) => (
                <Link key={p.id} to={`/playlist/${p.id}`} className="song-card">
                  <Mosaic covers={p.covers} id={p.id} />
                  <div><div className="title">{p.name}</div><div className="meta">{plural(p.songCount, 'song')} · {p.kind === 'MANUAL' ? 'playlist' : p.kind.toLowerCase().replace('_', ' ')}</div></div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'smart' && smart.data && (
        <div className="stack" style={{ '--gap': '14px' }}>
          <p className="soft" style={{ maxWidth: 680 }}>Smart lists are selected from the real track metadata and audio features in your music archive.</p>
          <div className="grid-4">
            {smart.data.map((s) => (
              <Link key={s.type} to={`/mix/smart/${s.type}`} className="card stack" style={{ '--gap': '4px' }}>
                <strong>{s.name}</strong><span className="small muted">{s.blurb}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {tab === 'liked' && (likes.loading ? <ListSkeleton /> : likes.error ? <ErrorState error={likes.error} onRetry={likes.reload} />
        : likes.data && (likes.data.length ? <TrackList songs={likes.data} origin="LIBRARY" /> : <Empty title="No liked songs">Tap the heart on any song.</Empty>))}

      {tab === 'history' && (history.loading ? <ListSkeleton /> : history.error ? <ErrorState error={history.error} onRetry={history.reload} />
        : history.data && (history.data.length ? (
          <TrackList songs={history.data} origin="LIBRARY" showRank={false}
            extra={(s) => <span className="tiny muted" style={{ minWidth: 112, textAlign: 'right' }}>{s.completed ? 'finished' : s.skipped ? 'skipped' : `${Math.round(s.completionPct)}%`}{s.replay ? ' · replay' : ''} · {ago(s.playedAt)}</span>} />
        ) : <Empty title="Listening history is unavailable">The uploaded files contain catalogue metadata, not playback events or audio streams.</Empty>))}

      {creating && (
        <Modal title="New playlist" onClose={() => setCreating(false)}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); create(); }}>
            <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
            <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn ghost" onClick={() => setCreating(false)}>Cancel</button><button className="btn primary" disabled={!name.trim()}>Create</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export function PlaylistPage() {
  const { id } = useParams();
  const { data: p, error, loading, reload, setData } = useApi(() => api.playlist(id), [id]);
  const toast = useToast();
  const player = usePlayer();
  const { user } = useAuth();
  const nav = useNavigate();
  const [cleaning, setCleaning] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  if (loading) return <ListSkeleton n={8} />;
  if (error) return <div className="page"><ErrorState error={error} onRetry={reload} /></div>;
  const remove = async (s) => {
    try {
      await api.removeFromPlaylist(p.id, s.id);
      setData({ ...p, songs: p.songs.filter((x) => x.id !== s.id), songCount: p.songCount - 1, totalDurationSec: p.totalDurationSec === null ? null : p.totalDurationSec - (s.durationSec || 0) });
      toast.info(`Removed “${s.title}”`);
    } catch (e) { toast.error(e); }
  };
  const del = async () => {
    if (!window.confirm(`Delete “${p.name}”? This cannot be undone.`)) return;
    try { await api.deletePlaylist(p.id); toast.success('Playlist deleted'); nav('/library'); } catch (e) { toast.error(e); }
  };
  const reorder = async (song, delta) => {
    const next = [...p.songs];
    const from = next.findIndex((item) => item.id === song.id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= next.length) return;
    [next[from], next[to]] = [next[to], next[from]];
    try {
      const updated = await api.reorderPlaylist(p.id, next.map((item) => item.id));
      setData(updated);
      toast.success('Playlist order updated.');
    } catch (e) { toast.error(e); }
  };
  const reorderable = !user.incognito && ['MANUAL', 'SAVED_MIX'].includes(p.kind);
  const health = analysePlaylistHealth(p.songs);
  const rebuildSource = async () => {
    if (!p.sourceBatchId || rebuilding || user.incognito) return;
    setRebuilding(true);
    try {
      const result = await api.rebuildBatch(p.sourceBatchId);
      toast.success('A fresh version of this mix is ready');
      nav(`/mix/batch/${result.batchId}`);
    } catch (e) { toast.error(e); }
    finally { setRebuilding(false); }
  };
  const cleanDuplicates = async () => {
    if (!reorderable || !health.duplicates.length || cleaning) return;
    const removeIds = health.duplicates.flatMap((group) => group.slice(1).map((song) => song.id));
    if (!window.confirm(`Remove ${removeIds.length} duplicate entr${removeIds.length === 1 ? 'y' : 'ies'}? The first occurrence is kept. Version labels are retained when they differ.`)) return;
    setCleaning(true);
    try {
      for (const songId of removeIds) await api.removeFromPlaylist(p.id, songId);
      const removed = new Set(removeIds);
      const songs = p.songs.filter((song) => !removed.has(song.id));
      const duration = p.totalDurationSec === null ? null : Math.max(0, p.totalDurationSec - p.songs.filter((song) => removed.has(song.id)).reduce((sum, song) => sum + (song.durationSec || 0), 0));
      setData({ ...p, songs, songCount: songs.length, totalDurationSec: duration });
      toast.success(`Removed ${removeIds.length} duplicate entr${removeIds.length === 1 ? 'y' : 'ies'}`);
    } catch (e) { await reload(); toast.error(e); }
    finally { setCleaning(false); }
  };
  return (
    <div className="page stack" style={{ '--gap': '22px' }}>
      <PageHead kicker={p.kind === 'MANUAL' ? 'Playlist' : p.kind === 'SMART' ? 'Smart playlist' : p.kind === 'WORLD' ? 'Saved LOOP World' : 'Saved mix'} title={p.name}
        actions={<>
          {p.songs.some(isPlayable) && <button className="btn primary" onClick={() => player.play(p.songs.find(isPlayable), { queue: p.songs, origin: 'PLAYLIST' })}><Play />Play available audio</button>}
          {p.sourceBatchId && <Link className="btn" to={`/mix/batch/${p.sourceBatchId}`}>Original mix</Link>}
          {p.sourceBatchId && <button className="btn" onClick={rebuildSource} disabled={rebuilding || user.incognito}>{rebuilding ? 'Rebuilding…' : 'Rebuild mix'}</button>}
          <button className="btn ghost danger" onClick={del}><X />Delete</button>
        </>}>
        {p.description && <p className="soft">{p.description}</p>}
        <p className="small muted">{plural(p.songCount, 'song')} · track duration is not included in the supplied dataset</p>
      </PageHead>
      <section className="card stack playlist-health" style={{ '--gap': '10px' }} aria-labelledby="playlist-health-title">
        <div className="row between wrap">
          <div className="stack" style={{ '--gap': '2px' }}><h3 id="playlist-health-title">Playlist health</h3><span className="small muted">A transparent metadata-based checklist, not a prediction of listening quality.</span></div>
          <div className="playlist-health-score"><strong>{health.score}</strong><span className="tiny muted">/100 · {health.label}</span></div>
        </div>
        <div className="playlist-health-track" role="progressbar" aria-label="Playlist health score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={health.score}><span style={{ width: `${health.score}%` }} /></div>
        {health.issues.length ? <ul className="small soft playlist-health-issues">{health.issues.map((issue) => <li key={issue.code}>{issue.message}</li>)}</ul> : <p className="small soft">No playlist quality flags were found in the available metadata.</p>}
        {health.duplicates.length > 0 && <div className="row wrap"><button className="btn ghost sm" disabled={!reorderable || cleaning} onClick={cleanDuplicates}>{cleaning ? 'Cleaning…' : `Clean ${health.counts.duplicateExtras} duplicate entr${health.counts.duplicateExtras === 1 ? 'y' : 'ies'}`}</button>{!reorderable && <span className="tiny muted">Only your editable playlists can be cleaned.</span>}</div>}
      </section>
      {p.songs.length ? <TrackList songs={p.songs} origin="PLAYLIST" onRemove={p.kind === 'MANUAL' || p.kind === 'SAVED_MIX' ? remove : undefined}
        extra={reorderable ? (song) => { const index = p.songs.findIndex((item) => item.id === song.id); return <div className="row" style={{ '--gap': '2px' }}><button className="icon-btn" onClick={() => reorder(song, -1)} disabled={index <= 0} aria-label={`Move ${song.title} up`} title="Move up">↑</button><button className="icon-btn" onClick={() => reorder(song, 1)} disabled={index >= p.songs.length - 1} aria-label={`Move ${song.title} down`} title="Move down">↓</button></div>; } : undefined} />
        : <Empty title="This playlist is empty">Use the + button on any song to add it here.</Empty>}
    </div>
  );
}

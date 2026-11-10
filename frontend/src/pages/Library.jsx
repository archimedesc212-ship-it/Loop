import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
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

function Mosaic({ covers, id }) {
  const list = (typeof covers === 'string' ? JSON.parse(covers) : covers) || [];
  if (!list.length) return <Cover colors={['#242424', '#1ED760']} seed={id} />;
  return (
    <div className="cover" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', width: '100%', aspectRatio: 1, borderRadius: 12 }}>
      {[0, 1, 2, 3].map((index) => <Cover key={index} colors={list[index % list.length]} seed={id * 7 + index} className="" />)}
    </div>
  );
}

export default function Library() {
  const { user } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState(location.state?.tab || 'playlists');
  const lists = useApi(() => api.playlists(), []);
  const likes = useApi(() => (tab === 'liked' ? api.likes() : Promise.resolve(null)), [tab]);
  const history = useApi(() => (tab === 'history' ? api.history(50) : Promise.resolve(null)), [tab]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const create = async () => {
    try {
      const playlist = await api.createPlaylist({ name: name.trim() });
      toast.success(`Created “${playlist.name}”`);
      setCreating(false);
      setName('');
      navigate(`/playlist/${playlist.id}`);
    } catch (error) { toast.error(error); }
  };

  return (
    <div className="page">
      <PageHead title="Your Library" actions={<button className="btn primary" onClick={() => setCreating(true)} disabled={user.incognito}><Plus />New playlist</button>}>
        <div className="toggle-group" role="tablist" aria-label="Library sections">
          {[
            ['playlists', 'Playlists'],
            ['liked', 'Liked songs'],
            ['history', 'Recently played'],
          ].map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>{label}</button>
          ))}
        </div>
      </PageHead>

      {tab === 'playlists' && <>
        {lists.loading && <ListSkeleton />}
        {lists.error && <ErrorState error={lists.error} onRetry={lists.reload} />}
        {lists.data && lists.data.length === 0 && <Empty title="No playlists yet" action={<button className="btn primary sm" onClick={() => setCreating(true)}>Create a playlist</button>}>Save songs you like and organise them into your own playlists.</Empty>}
        {lists.data?.length > 0 && <div className="shelf" style={{ gridAutoFlow: 'row', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', overflow: 'visible' }}>
          {lists.data.map((playlist) => (
            <Link key={playlist.id} to={`/playlist/${playlist.id}`} className="song-card">
              <Mosaic covers={playlist.covers} id={playlist.id} />
              <div><div className="title">{playlist.name}</div><div className="meta">{plural(playlist.songCount, 'song')}</div></div>
            </Link>
          ))}
        </div>}
      </>}

      {tab === 'liked' && (likes.loading ? <ListSkeleton /> : likes.error ? <ErrorState error={likes.error} onRetry={likes.reload} />
        : likes.data && (likes.data.length ? <TrackList songs={likes.data} origin="LIBRARY" /> : <Empty title="No liked songs yet">Tap the heart on any song to save it here.</Empty>))}

      {tab === 'history' && (history.loading ? <ListSkeleton /> : history.error ? <ErrorState error={history.error} onRetry={history.reload} />
        : history.data && (history.data.length ? <TrackList songs={history.data} origin="LIBRARY" showRank={false}
          extra={(song) => <span className="tiny muted" style={{ minWidth: 112, textAlign: 'right' }}>{song.completed ? 'Finished' : song.skipped ? 'Skipped' : `${Math.round(song.completionPct)}%`} · {ago(song.playedAt)}</span>} />
          : <Empty title="No listening history yet">Songs you play will appear here when listening history is enabled.</Empty>))}

      {creating && <Modal title="Create a playlist" onClose={() => setCreating(false)}>
        <form className="stack" onSubmit={(event) => { event.preventDefault(); create(); }}>
          <Field label="Playlist name"><input autoFocus className="input" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="My favourite songs" /></Field>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn ghost" onClick={() => setCreating(false)}>Cancel</button>
            <button className="btn primary" disabled={!name.trim()}>Create playlist</button>
          </div>
        </form>
      </Modal>}
    </div>
  );
}

export function PlaylistPage() {
  const { id } = useParams();
  const { data: playlist, error, loading, reload, setData } = useApi(() => api.playlist(id), [id]);
  const toast = useToast();
  const player = usePlayer();
  const navigate = useNavigate();

  if (loading) return <ListSkeleton n={8} />;
  if (error) return <div className="page"><ErrorState error={error} onRetry={reload} /></div>;

  const remove = async (song) => {
    try {
      await api.removeFromPlaylist(playlist.id, song.id);
      setData({ ...playlist, songs: playlist.songs.filter((item) => item.id !== song.id), songCount: Math.max(0, playlist.songCount - 1) });
      toast.info(`Removed “${song.title}”`);
    } catch (requestError) { toast.error(requestError); }
  };

  const deletePlaylist = async () => {
    if (!window.confirm(`Delete “${playlist.name}”? This cannot be undone.`)) return;
    try {
      await api.deletePlaylist(playlist.id);
      toast.success('Playlist deleted');
      navigate('/library');
    } catch (requestError) { toast.error(requestError); }
  };

  const editable = ['MANUAL', 'SAVED_MIX'].includes(playlist.kind);
  return (
    <div className="page stack" style={{ '--gap': '22px' }}>
      <PageHead kicker="Your Library" title={playlist.name}
        actions={<>
          {playlist.songs.some(isPlayable) && <button className="btn primary" onClick={() => player.play(playlist.songs.find(isPlayable), { queue: playlist.songs, origin: 'PLAYLIST' })}><Play />Play playlist</button>}
          {editable && <button className="btn ghost danger" onClick={deletePlaylist}><X />Delete playlist</button>}
        </>}>
        {playlist.description && <p className="soft">{playlist.description}</p>}
        <p className="small muted">{plural(playlist.songCount, 'song')}</p>
      </PageHead>
      {playlist.songs.length
        ? <TrackList songs={playlist.songs} origin="PLAYLIST" onRemove={editable ? remove : undefined} />
        : <Empty title="This playlist is empty">Use the add button on any song to put it in this playlist.</Empty>}
    </div>
  );
}

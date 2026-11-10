// What a private session remembers (its temporary memory), and how to end it.
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { usePlayer } from '../hooks/usePlayer';
import { PageHead, Empty, ErrorState, Skeleton } from '../components/ui';
import { EyeOff } from '../components/Icons';
import { ago } from '../lib/format';

export default function PrivateSession() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const player = usePlayer();
  const { data, error, loading, reload } = useApi(() => api.incognito(), [user.incognito]);
  const toggle = async () => {
    try {
      await player.reset();
      if (data && data.active) {
        const r = await api.endIncognito();
        toast.success(`Ended — deleted ${r.purged.events} plays and ${r.purged.lists} mixes from this session`);
      } else {
        await api.startIncognito();
        toast.info('Private session on');
      }
      await refresh();
    } catch (e) { toast.error(e); }
  };
  return (
    <div className="page stack" style={{ '--gap': '22px', maxWidth: 900 }}>
      <PageHead kicker="Private session" title={data && data.active ? 'Listening privately' : 'Private sessions'}
        actions={<button className="btn" onClick={toggle} style={data && data.active ? { color: 'var(--private)' } : undefined}><EyeOff />{data && data.active ? 'End private session' : 'Start private session'}</button>}>
        <p className="lead">This archive view contains metadata rather than audio streams, so it does not collect listening history. A private session pauses mood ratings in this browser while you explore the catalogue.</p>
      </PageHead>
      {loading && <Skeleton h={200} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && !data.active && <Empty title="No private session is running">Start one from here or the Private button at the top. End it whenever you like; no playback history is collected in this archive view.</Empty>}
      {data && data.active && (
        <>
          <div className="row wrap small soft" style={{ '--gap': '18px' }}>
            <span>Started {ago(data.startedAt)}</span><span>Ends in {Math.max(0, Math.round(data.secondsLeft / 60))} min</span><span>{data.events} plays in temporary memory</span>
          </div>
          <div className="grid-3" style={{ alignItems: 'start' }}>
            {data.memory.map((d) => {
              const toward = d.items.filter((x) => x.score > 0);
              const away = d.items.filter((x) => x.score < 0);
              const top = Math.max(...toward.map((x) => x.score), 1);
              return (
                <div key={d.dimension} className="card stack" style={{ '--gap': '8px' }}>
                  <h3 style={{ fontSize: '0.95rem' }}>Session {d.dimension.toLowerCase()}s</h3>
                  {!d.items.length && <p className="small muted">Play something to build it.</p>}
                  {toward.length > 0 && <p className="tiny muted">Leaning towards</p>}
                  {toward.map((x) => (
                    <div key={x.ref_id} className="stack" style={{ '--gap': '3px' }} title={`session score ${x.score} from ${x.events} play${x.events === 1 ? '' : 's'}`}>
                      <span className="small">{x.name}</span>
                      <div className="bar"><i style={{ width: `${(x.score / top) * 100}%` }} /></div>
                    </div>
                  ))}
                  {away.length > 0 && <p className="tiny muted">Skipping: {away.map((x) => x.name).join(', ')}</p>}
                </div>
              );
            })}
          </div>
          <div className="card stack" style={{ '--gap': '8px' }}>
            <h3 style={{ fontSize: '0.95rem' }}>Played in this session</h3>
            {data.recentSongs.length ? data.recentSongs.map((s, i) => (
              <div key={i} className="row between small"><Link className="link" to={`/song/${s.song_id}`}>{s.title}</Link><span className="muted">{s.artist_name} · {s.completed ? 'finished' : s.skipped ? 'skipped' : `${s.listened_sec}s`}</span></div>
            )) : <p className="small muted">Nothing yet.</p>}
          </div>
        </>
      )}
    </div>
  );
}

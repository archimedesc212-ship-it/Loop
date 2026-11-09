import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import { Interpretation, RecHeader, RecList } from '../components/Rec';
import { TrackList } from '../components/Songs';
import { ErrorState, Thinking, ListSkeleton, Empty } from '../components/ui';

const LOAD = {
  daily: () => api.recDaily(25),
  similar: (arg) => api.recSimilar(arg, 20),
  regional: (arg) => api.recRegional(arg, 20),
  discovery: () => api.recDiscovery(20),
  recovery: () => api.recRecovery(),
  context: (arg) => api.recContext(arg, 20),
  smart: (arg) => api.smart(arg, 20),
  batch: (arg) => api.batch(arg),
};
const KICKER = { daily: 'Daily Mix', similar: 'Because you liked', regional: 'Regional discovery', discovery: 'Discovery mode',
  recovery: 'Mood recovery', context: 'Mode', smart: 'Smart playlist', batch: 'Saved mix' };

export default function Mix() {
  const { kind, arg } = useParams();
  const loader = LOAD[kind];
  const { data, error, loading, reload } = useApi(() => (loader ? loader(arg) : Promise.reject(new Error('Unknown mix'))), [kind, arg]);
  if (loading) return <div className="page stack"><Thinking /><ListSkeleton n={8} /></div>;
  if (error) {
    return (
      <div className="page stack" style={{ maxWidth: 640 }}>
        <ErrorState error={error} onRetry={reload} />
        {error.code === 'NO_LANGUAGE' && <Link to="/settings" className="btn primary sm" style={{ alignSelf: 'flex-start' }}>Choose languages</Link>}
      </div>
    );
  }
  if (!data) return null;
  if (data.empty) return <div className="page"><Empty title="Nothing to base this on yet">{data.message}</Empty></div>;

  if (kind === 'recovery') {
    return (
      <div className="page stack" style={{ '--gap': '26px' }}>
        <div className="stack" style={{ '--gap': '8px' }}>
          <div className="soft small">Mood recovery</div>
          <h1 className="display">{data.title}</h1>
          <p className="lead">{data.subtitle}. Three short stages, each scored separately, moving from low energy and low positivity towards bright.</p>
        </div>
        {data.stages.map((st, i) => (
          <section key={st.batchId} className="panel stack" style={{ '--gap': '14px' }}>
            <div className="row between wrap">
              <div><div className="small muted">Stage {i + 1} of {data.stages.length}</div><h2 className="section-title">{st.title}</h2></div>
              <div className="row wrap small soft" style={{ '--gap': '14px' }}>{st.interpretation.summary.slice(0, 2).map((s) => <span key={s.label}>{s.label}: <b>{s.value}</b></span>)}</div>
            </div>
            <TrackList songs={st.songs} batchId={st.batchId} origin="MOOD" explain dismissable />
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="page stack" style={{ '--gap': '24px' }}>
      <RecHeader list={data} kicker={KICKER[kind]} />
      {data.seed && <p className="small soft">Seed: <Link className="link" to={`/song/${data.seed.id}`}>{data.seed.title}</Link> by {data.seed.artist.name}</p>}
      {data.interpretation && <Interpretation list={data} />}
      {data.songs.length === 0
        ? <Empty title="No songs matched">Try another mode, or turn off the content filter in Settings.</Empty>
        : <RecList list={data} />}
    </div>
  );
}

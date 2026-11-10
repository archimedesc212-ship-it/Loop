// LOOP's public music archive, generated from the uploaded CEDs music dataset.
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import { WorldArt } from '../components/Art';
import { TrackList } from '../components/Songs';
import { ErrorState, Thinking, Skeleton } from '../components/ui';

export default function World() {
  const { data, error, loading, reload } = useApi(() => api.world(), []);
  if (loading) return <div className="page stack"><Skeleton h={300} r={28} /><Thinking label="Opening the music archive" /></div>;
  if (error) return <div className="page"><ErrorState error={error} onRetry={reload} /></div>;

  const world = data?.world || {};
  const songs = Array.isArray(data?.songs) ? data.songs : [];
  return (
    <div className="page stack" style={{ '--gap': '24px' }}>
      <section className="hero" style={{ minHeight: 340, display: 'flex', alignItems: 'flex-end' }}>
        <div className="hero-art"><WorldArt theme={world.theme} /></div>
        <div className="stack" style={{ '--gap': '12px', maxWidth: 680 }}>
          <span className="chip accent" style={{ alignSelf: 'flex-start' }}>LOOP MUSIC ARCHIVE</span>
          <h1 className="display" style={{ fontSize: 'clamp(2.6rem, 6vw, 4.6rem)' }}>{world.title || 'Music across 1950–2019'}</h1>
          <p className="lead">{world.description || 'Real track metadata from the dataset you supplied.'}</p>
          <div className="row wrap small soft">
            <span>{Number(world.songCount || 28372).toLocaleString('en-IN')} track records</span>
            <span>1950–2019</span>
            <span>7 genres</span>
            <span>5,426 artists</span>
          </div>
        </div>
      </section>

      <div className="grid-3">
        <div className="card stack" style={{ '--gap': '5px' }}>
          <span className="tiny muted">SOURCE FIELDS</span>
          <strong>Artist · title · year · genre</strong>
          <span className="small muted">Plus topic labels and audio features.</span>
        </div>
        <div className="card stack" style={{ '--gap': '5px' }}>
          <span className="tiny muted">MOOD MATCHING</span>
          <strong>Dataset-based estimates</strong>
          <span className="small muted">Derived from topic labels and audio features, not lyrics.</span>
        </div>
        <div className="card stack" style={{ '--gap': '5px' }}>
          <span className="tiny muted">RECORDINGS</span>
          <strong>Metadata only</strong>
          <span className="small muted">The uploaded files do not contain audio or track durations.</span>
        </div>
      </div>

      <section className="stack" style={{ '--gap': '12px' }}>
        <div className="section-head">
          <div>
            <h2 className="section-title">Selected records</h2>
            <p className="small muted">A feature-balanced selection from the 28,372 real catalogue entries.</p>
          </div>
        </div>
        {songs.length ? <TrackList songs={songs} origin="WORLD" showRank={false} /> : <p className="small muted">No catalogue records are available.</p>}
      </section>

      <div className="card stack" style={{ '--gap': '8px' }}>
        <h3>Dataset attribution</h3>
        <p className="small soft">Music Dataset: 1950 to 2019 · Luan Moura, Emanuel Fontelles, Vinicius Sampaio and Mardônio França · CC BY 4.0.</p>
        <div className="row wrap small">
          <a className="link" href="https://www.kaggle.com/datasets/saurabhshahane/music-dataset-1950-to-2019" target="_blank" rel="noreferrer">Kaggle dataset</a>
          <a className="link" href="https://doi.org/10.17632/3t9vbwxgr5.3" target="_blank" rel="noreferrer">Mendeley Data source</a>
        </div>
        <p className="tiny muted">Lyrics are deliberately excluded. Language labels, album and film metadata, original recordings, and durations were not included in the supplied files, so LOOP does not invent them.</p>
      </div>
    </div>
  );
}

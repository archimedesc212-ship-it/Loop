// Dataset-based selections for a mood. The supplied CSV has topic and audio
// features, but no community ranking table or trained model predictions.
import { useState } from 'react';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import { TrackList } from './Songs';
import { ErrorState, ListSkeleton, Empty } from './ui';

export default function TopRatedByMood({ moods }) {
  const [moodId, setMoodId] = useState(moods[0]?.id || '');
  const mood = moods.find((item) => item.id === Number(moodId));
  const results = useApi(
    () => mood ? api.topRatedForMood(mood.id, { limit: 20 }) : Promise.resolve(null),
    [moodId],
    { skip: !mood },
  );
  return (
    <section className="card stack" style={{ '--gap': '16px' }} aria-labelledby="archive-mood-title">
      <div className="stack" style={{ '--gap': '4px' }}>
        <h2 id="archive-mood-title" className="section-title" style={{ margin: 0 }}>Explore the archive by mood</h2>
        <p className="small soft" style={{ maxWidth: '68ch' }}>
          Selections are matched from dataset topic labels and audio features. They are not listener rankings or AI predictions.
        </p>
      </div>
      <label className="field" style={{ maxWidth: 280 }}>
        <span>Mood</span>
        <select className="select" value={moodId} onChange={(event) => setMoodId(event.target.value)}>
          {moods.map((item) => <option key={item.id} value={item.id}>{item.emoji} {item.name}</option>)}
        </select>
      </label>
      {results.loading && <ListSkeleton n={4} />}
      {results.error && <ErrorState error={results.error} onRetry={results.reload} />}
      {results.data && (results.data.songs.length
        ? <TrackList songs={results.data.songs} origin="MOOD" />
        : <Empty title="No matching archive records">Try another mood. Mood labels are estimates derived from the supplied topic and feature columns.</Empty>)}
    </section>
  );
}

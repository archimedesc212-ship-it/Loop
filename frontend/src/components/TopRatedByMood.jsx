// Songs ranked by how well LISTENERS say they fit one mood (song_mood_ratings).
// "Average" ranks by the plain average; "Adjusted" ranks by a Bayesian average that
// pulls songs with few ratings towards the mood's overall mean. The real average and
// rating count are always shown; the adjusted number is labelled as a ranking score.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import { ErrorState, ListSkeleton, Empty } from './ui';
import { formatPct, formatAi, ratingCount } from '../lib/moodRating';

const MIN_OPTIONS = [1, 2, 3, 5, 10];

export default function TopRatedByMood({ moods }) {
  const [moodId, setMoodId] = useState(moods[0]?.id || null);
  const [rank, setRank] = useState('average');
  const [minRatings, setMinRatings] = useState(1);
  const [showUnrated, setShowUnrated] = useState(false);
  useEffect(() => { if (!moodId && moods.length) setMoodId(moods[0].id); }, [moods, moodId]);
  const res = useApi(() => api.topRatedForMood(moodId, { rank, minRatings, limit: 20, includeUnrated: showUnrated ? 'true' : undefined }),
    [moodId, rank, minRatings, showUnrated], { skip: !moodId });
  const d = res.data;
  const mood = moods.find((m) => m.id === moodId);

  return (
    <section className="card stack" style={{ '--gap': '16px' }} aria-labelledby="trm-title">
      <div className="stack" style={{ '--gap': '4px' }}>
        <h2 id="trm-title" className="section-title" style={{ margin: 0 }}>Rated by listeners</h2>
        <p className="small soft" style={{ maxWidth: '68ch' }}>Songs ranked by how well listeners say they fit a mood, from their 0–100 % ratings on each song page. This is listener feedback, not the AI's prediction.</p>
      </div>
      <div className="row wrap" style={{ '--gap': '12px', alignItems: 'flex-end' }}>
        <label className="field" style={{ minWidth: 200 }}>
          <span>Mood</span>
          <select className="select" value={moodId || ''} onChange={(e) => { setMoodId(Number(e.target.value)); setShowUnrated(false); }}>
            {moods.map((m) => <option key={m.id} value={m.id}>{m.emoji} {m.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>At least</span>
          <select className="select" value={minRatings} onChange={(e) => setMinRatings(Number(e.target.value))}>
            {MIN_OPTIONS.map((n) => <option key={n} value={n}>{ratingCount(n)}</option>)}
          </select>
        </label>
        <div className="field">
          <span>Rank by</span>
          <div className="toggle-group" role="group" aria-label="Rank by">
            <button className={rank === 'average' ? 'on' : ''} aria-pressed={rank === 'average'} onClick={() => setRank('average')}>Average</button>
            <button className={rank === 'adjusted' ? 'on' : ''} aria-pressed={rank === 'adjusted'} onClick={() => setRank('adjusted')}>Adjusted for few ratings</button>
          </div>
        </div>
      </div>
      {rank === 'adjusted' && d?.prior && (
        <p className="tiny muted">Adjusted score = (5 × {d.prior.mean === null ? 'mood mean' : formatPct(d.prior.mean)} + sum of ratings) ÷ (5 + number of ratings). It keeps one perfect rating from outranking many consistent ones. It is a ranking aid, not a rating.</p>
      )}

      {res.loading && <ListSkeleton n={4} />}
      {res.error && <ErrorState error={res.error} onRetry={res.reload} />}
      {!res.loading && d && (
        <>
          {d.songs.length === 0 ? (
            <Empty title={`No ${mood ? mood.name.toLowerCase() : ''} ratings yet`}>
              {d.belowMinimumCount > 0
                ? `${d.belowMinimumCount} song${d.belowMinimumCount > 1 ? 's have' : ' has'} ratings, but fewer than ${minRatings}. Lower the minimum to see them.`
                : 'Nobody has rated a song for this mood yet. Open any song and rate how well it fits.'}
            </Empty>
          ) : (
            <ol className="trm-list">
              {d.songs.map((s, i) => (
                <li key={s.id} className="trm-item">
                  <span className="num muted trm-rank">{(d.page - 1) * d.limit + i + 1}</span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <Link className="link" to={`/song/${s.id}`}><b>{s.title}</b></Link>
                    <div className="tiny muted">{s.artist.name}</div>
                  </div>
                  <div className="trm-score">
                    <div className="mr-bar" style={{ '--mood': mood?.color }} aria-hidden="true"><i style={{ width: `${s.moodRating.average}%` }} /></div>
                    <span className="num">{formatPct(s.moodRating.average)}</span>
                    <span className="tiny muted">avg · {ratingCount(s.moodRating.count)}</span>
                  </div>
                  {rank === 'adjusted' && <span className="score-pill tiny" title="Ranking score, not a user rating">score {formatPct(s.moodRating.adjustedScore)}</span>}
                  <span className="tiny muted trm-ai" title="The mood model's prediction">AI {formatAi(s.moodRating.aiConfidence)}</span>
                </li>
              ))}
            </ol>
          )}
          <div className="row wrap between">
            <span className="tiny muted">
              {d.total} rated · {d.belowMinimumCount ? `${d.belowMinimumCount} below the minimum · ` : ''}{d.unratedCount} not rated for this mood yet
            </span>
            {d.unratedCount > 0 && (
              <button className="btn ghost sm" onClick={() => setShowUnrated(!showUnrated)}>{showUnrated ? 'Hide unrated songs' : 'Show unrated songs'}</button>
            )}
          </div>
          {showUnrated && d.unrated && (
            <div className="stack" style={{ '--gap': '6px' }}>
              <div className="tiny muted">Not rated by listeners yet, ordered by the AI's prediction for this mood. Rate them on the song page.</div>
              <ul className="trm-list">
                {d.unrated.map((s) => (
                  <li key={s.id} className="trm-item">
                    <div className="grow" style={{ minWidth: 0 }}><Link className="link" to={`/song/${s.id}`}>{s.title}</Link><div className="tiny muted">{s.artist.name}</div></div>
                    <span className="tiny muted">No ratings</span>
                    <span className="tiny muted trm-ai">AI {formatAi(s.moodRating.aiConfidence)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

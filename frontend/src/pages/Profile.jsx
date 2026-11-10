// Listening profile. Archive-only mode does not claim playback or listening statistics.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { Stat, ErrorState, Skeleton, Empty, PageHead } from '../components/ui';
import { Columns, HBars, StackedShare, Heatmap } from '../components/Charts';
import { date, duration, hour, n, pct, toDate } from '../lib/format';

function Panel({ title, sub, children, right }) {
  return (
    <section className="panel stack" style={{ '--gap': '14px' }}>
      <div className="row between wrap"><div><h3>{title}</h3>{sub && <p className="small muted" style={{ marginTop: 2 }}>{sub}</p>}</div>{right}</div>
      {children}
    </section>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const [period, setPeriod] = useState('weekly');
  const profile = useApi(() => api.profile(30), []);
  const activity = useApi(() => api.activity(), []);
  const journey = useApi(() => api.journey(period), [period]);
  const prefs = useApi(() => api.preferences(), []);
  const skips = useApi(() => api.skipPatterns(30), []);

  if (profile.loading) return <div className="page grid-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} h={104} r={14} />)}</div>;
  if (profile.error) return <div className="page"><ErrorState error={profile.error} onRetry={profile.reload} /></div>;
  const h = profile.data.headline;
  if (!h || !h.totalPlays) {
    return <div className="page"><PageHead title="Your listening profile" /><Empty title="Listening stats are not available in this archive">The uploaded dataset contains track metadata and audio features, but no playback events or audio streams. LOOP keeps listening statistics empty rather than inventing play counts.</Empty></div>;
  }
  const t = profile.data.recentTrend;
  const fmtBucket = (b) => (period === 'monthly' ? toDate(b).toLocaleDateString('en-IN', { month: 'short' }) : date(b));

  return (
    <div className="page stack" style={{ '--gap': '22px' }}>
      <PageHead kicker={`${user.displayName} · last 30 days and all-time`} title="Your listening profile" actions={<Link className="btn ghost sm" to="/mood-diary">Private Mood Diary ↗</Link>}>
        <p className="soft small">Moods here describe the music you played, not how you felt.</p>
      </PageHead>

      <div className="grid-4">
        <Stat label="Minutes listened" value={n(h.minutes)} foot={t && t.changePct !== null ? `${t.changePct >= 0 ? '+' : ''}${t.changePct}% vs previous 7 days` : `${n(t ? t.minutesLast7 : 0)} min this week`} />
        <Stat label="Songs played" value={n(h.totalPlays)} foot={`${n(h.uniqueSongs)} different songs`} />
        <Stat label="Listening streak" value={`${profile.data.streak.current} day${profile.data.streak.current === 1 ? '' : 's'}`} foot={`Longest ${profile.data.streak.longest} days · ${h.activeDays} active days`} />
        <Stat label="Peak hour" value={hour(h.peakHour)} foot={`Completion ${pct(h.completionRate)} · skips ${pct(h.skipRate)}`} />
        <Stat text label="Top genre" value={h.favoriteGenre || '–'} />
        <Stat text label="Top artist" value={h.favoriteArtist || '–'} />
        <Stat text label="Favourite mood" value={h.dominantMood || '–'} foot="Most-played mood of finished songs" />
        <Stat text label="Average sound" value={`${Math.round(h.avgTempo || 0)} BPM`} foot={`Energy ${Math.round((h.avgEnergy || 0) * 100)}/100 · songs ${duration(h.avgSongDurationSec)}`} />
      </div>

      <div className="grid-2">
        <Stat text label="Most replayed (30 days)" value={profile.data.mostReplayed ? <Link className="link" to={`/song/${profile.data.mostReplayed.song_id}`}>{profile.data.mostReplayed.title}</Link> : '–'}
          foot={profile.data.mostReplayed ? `${profile.data.mostReplayed.artist_name} · ${profile.data.mostReplayed.n} replays` : 'No replays yet'} />
        <Stat text label="Most skipped (30 days)" value={profile.data.mostSkipped ? <Link className="link" to={`/song/${profile.data.mostSkipped.song_id}`}>{profile.data.mostSkipped.title}</Link> : '–'}
          foot={profile.data.mostSkipped ? `${profile.data.mostSkipped.artist_name} · ${profile.data.mostSkipped.n} skips` : 'Nothing skipped'} />
      </div>

      <Panel title="Skip pattern intelligence" sub="Your listening behaviour over the last 30 days. A skip is not automatically a dislike.">
        {skips.loading && <Skeleton h={170} />}
        {skips.error && <ErrorState error={skips.error} onRetry={skips.reload} />}
        {skips.data && (
          <>
            <div className="grid-4">
              <Stat label="Plays analysed" value={n(skips.data.summary.plays)} />
              <Stat label="Skipped" value={n(skips.data.summary.skips)} />
              <Stat label="Skip rate" value={pct(skips.data.summary.skipRate)} />
              <Stat label="Average completion" value={pct(skips.data.summary.avgCompletion)} />
            </div>
            <div className="grid-2" style={{ alignItems: 'start' }}>
              <div className="stack" style={{ '--gap': '9px' }}>
                <h3 style={{ fontSize: '0.95rem' }}>Genres with highest skip rate</h3>
                {skips.data.genres.length ? <HBars data={skips.data.genres.map((x) => ({ ...x, name: `${x.name} (${x.skips}/${x.plays})` }))} value="skipRate" unit="%" /> : <p className="small muted">Not enough repeated genre plays yet.</p>}
              </div>
              <div className="stack" style={{ '--gap': '9px' }}>
                <h3 style={{ fontSize: '0.95rem' }}>Artists with highest skip rate</h3>
                {skips.data.artists.length ? <HBars data={skips.data.artists.map((x) => ({ ...x, name: `${x.name} (${x.skips}/${x.plays})` }))} value="skipRate" unit="%" /> : <p className="small muted">Not enough repeated artist plays yet.</p>}
              </div>
              <div className="stack" style={{ '--gap': '9px' }}>
                <h3 style={{ fontSize: '0.95rem' }}>Music moods</h3>
                {skips.data.moods.length ? <HBars data={skips.data.moods.map((x) => ({ ...x, name: `${x.name} (${x.skips}/${x.plays})` }))} value="skipRate" unit="%" /> : <p className="small muted">Mood labels are not available for enough plays.</p>}
              </div>
              <div className="stack" style={{ '--gap': '9px' }}>
                <h3 style={{ fontSize: '0.95rem' }}>Listening contexts</h3>
                {skips.data.contexts.length ? <HBars data={skips.data.contexts.map((x) => ({ ...x, name: `${x.emoji} ${x.name} (${x.skips}/${x.plays})` }))} value="skipRate" unit="%" /> : <p className="small muted">No context-tagged listening yet.</p>}
              </div>
              <div className="stack" style={{ '--gap': '9px' }}>
                <h3 style={{ fontSize: '0.95rem' }}>Time of day</h3>
                {skips.data.hours.length ? <HBars data={skips.data.hours.map((x) => ({ ...x, name: `${x.name} (${x.skips}/${x.plays})` }))} value="skipRate" unit="%" /> : <p className="small muted">Not enough repeated plays in a time window yet.</p>}
              </div>
            </div>
            {skips.data.songs.length > 0 && <div className="stack" style={{ '--gap': '7px' }}>
              <h3 style={{ fontSize: '0.95rem' }}>Most skipped songs</h3>
              {skips.data.songs.slice(0, 5).map((song) => <div className="row between small" key={song.songId}>
                <span><Link className="link" to={`/song/${song.songId}`}>{song.title}</Link> <span className="muted">· {song.artist}</span></span>
                <span className="num muted">{song.skips}/{song.plays} · {song.skipRate}%</span>
              </div>)}
            </div>}
            <p className="tiny muted">{skips.data.note}</p>
          </>
        )}
      </Panel>

      {activity.data && (
        <>
          <Panel title="Weekly listening" sub="Minutes per day for the last 30 days, with the 7-day moving average (SQL window function)">
            <Columns data={activity.data.daily} x="day" y="minutes" line="moving_avg_7d" unit="min" xLabel={date} label="Minutes listened per day" />
          </Panel>
          <div className="grid-2" style={{ alignItems: 'start' }}>
            <Panel title="Genre distribution" sub="Share of finished or partly played songs">
              <HBars data={activity.data.genres} value="share" unit="%" max={Math.max(...activity.data.genres.map((g) => Number(g.share)))} />
            </Panel>
            <Panel title="When you listen" sub="Plays by weekday and hour, last 60 days">
              <Heatmap cells={activity.data.heatmap} />
            </Panel>
          </div>
          <div className="grid-2" style={{ alignItems: 'start' }}>
            <Panel title="Languages">
              <HBars data={activity.data.languages} />
            </Panel>
            <Panel title="Contexts" sub="What you said you were doing when you started a session">
              {activity.data.contexts.length ? <HBars data={activity.data.contexts.map((c) => ({ ...c, name: `${c.emoji} ${c.name}` }))} value="minutes" unit="min" /> : <p className="small muted">Start a mix from a mode (Focus, Workout…) to see contexts here.</p>}
            </Panel>
          </div>
        </>
      )}

      <Panel title="Music Mood Journey" sub="How the moods of the music you play move over time"
        right={<div className="toggle-group">{['daily', 'weekly', 'monthly'].map((p) => <button key={p} className={period === p ? 'on' : ''} onClick={() => setPeriod(p)}>{p[0].toUpperCase() + p.slice(1)}</button>)}</div>}>
        {journey.loading && <Skeleton h={220} />}
        {journey.error && <ErrorState error={journey.error} onRetry={journey.reload} />}
        {journey.data && (
          <>
            {journey.data.distribution.length ? <StackedShare rows={journey.data.distribution} bucketLabel={fmtBucket} /> : <p className="small muted">No plays in this period.</p>}
            <div className="grid-2" style={{ alignItems: 'start' }}>
              <div className="stack" style={{ '--gap': '8px' }}>
                <h3 style={{ fontSize: '0.95rem' }}>Most common transitions</h3>
                <p className="tiny muted">Consecutive songs in one session whose mood changed (LAG over the session).</p>
                {journey.data.transitions.slice(0, 6).map((x) => (
                  <div key={x.from_mood + x.to_mood} className="row between small"><span>{x.from_mood} → {x.to_mood}</span><span className="muted num">{x.n}×</span></div>
                ))}
              </div>
              <div className="stack" style={{ '--gap': '8px' }}>
                <h3 style={{ fontSize: '0.95rem' }}>This week vs last week</h3>
                {journey.data.trends.length ? journey.data.trends.slice(0, 6).map((x) => (
                  <div key={x.mood} className="row between small"><span>{x.mood}</span>
                    <span className="num">{x.share_pct}% <span className={x.share_change > 0 ? '' : 'muted'}>({x.share_change > 0 ? '+' : ''}{x.share_change})</span></span></div>
                )) : <p className="small muted">Not enough plays this week yet.</p>}
                {journey.data.sessionArcs.length > 0 && <p className="tiny soft" style={{ marginTop: 6 }}>Sessions most often start {journey.data.sessionArcs[0].first_mood.toLowerCase()} and end {journey.data.sessionArcs[0].last_mood.toLowerCase()} ({journey.data.sessionArcs[0].sessions} sessions).</p>}
              </div>
            </div>
          </>
        )}
      </Panel>

      {prefs.data && (
        <Panel title="How LOOP models your taste" sub={`${prefs.data.model ? `${prefs.data.model.name} ${prefs.data.model.version}` : ''} · short-term half-life 7 days, long-term 90 days, recomputed after every play`}>
          <div className="row wrap small" style={{ '--gap': '14px' }}>
            <span>Based on behaviour: <b>{prefs.data.evidence.behaviourShare}%</b></span>
            <span>Based on your onboarding answers: <b>{prefs.data.evidence.onboardingShare}%</b></span>
            <span className="muted">({prefs.data.evidence.completedPlays} finished plays; {prefs.data.evidence.neededForFullConfidence} are enough for LOOP to rely fully on behaviour)</span>
          </div>
          <div className="grid-3" style={{ alignItems: 'start' }}>
            {[['Genres', prefs.data.genres], ['Artists', prefs.data.artists], ['Moods', prefs.data.moods.slice(0, 10)]].map(([title, rows]) => (
              <div key={title} className="stack" style={{ '--gap': '8px' }}>
                <h3 style={{ fontSize: '0.95rem' }}>{title}</h3>
                {rows.slice(0, 8).map((r) => (
                  <div key={r.name} className="stack" style={{ '--gap': '3px' }} title={`short-term ${Number(r.shortTerm).toFixed(2)} · long-term ${Number(r.longTerm).toFixed(2)} · onboarding ${r.onboarding}`}>
                    <div className="row between small"><span>{r.emoji ? `${r.emoji} ` : ''}{r.name}</span><span className="num muted">{Math.round(r.score * 100)}</span></div>
                    <div className="bar"><i style={{ width: `${r.score * 100}%` }} /></div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {profile.data.longTerm.length > 1 && (
            <p className="small soft">Long-term trend: your average energy went from {Math.round(profile.data.longTerm[0].avg_energy * 100)} in {profile.data.longTerm[0].month} to {Math.round(profile.data.longTerm[profile.data.longTerm.length - 1].avg_energy * 100)} in {profile.data.longTerm[profile.data.longTerm.length - 1].month}.</p>
          )}
        </Panel>
      )}
    </div>
  );
}

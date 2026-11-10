import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import { Stat, ErrorState, Skeleton, PageHead } from '../../components/ui';
import { Columns, HBars } from '../../components/Charts';
import { date, n } from '../../lib/format';
import { CatalogAdmin } from './CatalogAdmin';
import { ReviewAdmin } from './PipelineAdmin';
import { UsersAdmin } from './SystemAdmin';
import { ArtistReviewAdmin } from './ArtistReviewAdmin';

const TABS = [
  ['', 'Overview', 'health.view'],
  ['catalog', 'Catalogue', 'catalog.write'],
  ['review', 'Review queue', 'pipeline.view'],
  ['users', 'Users', 'users.manage'],
  ['artists', 'Artists', 'artist.review'],
];

function Overview() {
  const o = useApi(() => api.admin.overview(), []);
  const s = useApi(() => api.admin.stats(), []);
  if (o.loading) return <div className="grid-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} h={100} />)}</div>;
  if (o.error) return <ErrorState error={o.error} onRetry={o.reload} />;
  const d = o.data;
  return (
    <div className="stack" style={{ '--gap': '18px' }}>
      <div className="grid-4">
        <Stat label="Playable songs" value={n(d.active_songs)} foot={`${d.pending_songs} waiting for analysis · ${d.hidden_songs} hidden`} />
        <Stat label="Artists / albums" value={`${d.artists} / ${d.albums}`} />
        <Stat label="Plays, last 7 days" value={n(d.plays_7d)} foot={`${d.listeners_7d} listeners`} />
        <Stat label="Needs attention" value={d.pending_reviews} foot={`review items · ${d.failed_jobs} failed jobs · ${d.private_sessions} private sessions`} />
      </div>
      {s.data && (
        <>
          <section className="panel stack">
            <h3>Plays per day</h3>
            <Columns data={s.data.daily} x="day" y="plays" unit="plays" xLabel={date} label="Plays per day, last 30 days" />
          </section>
          <div className="grid-2" style={{ alignItems: 'start' }}>
            <section className="panel stack"><h3>Top songs, 30 days</h3>
              <div className="table-wrap"><table className="data"><thead><tr><th>Song</th><th>Plays</th><th>Listeners</th><th>Done</th><th>Skip</th></tr></thead>
                <tbody>{s.data.topSongs.map((t) => <tr key={t.id}><td>{t.title}<div className="tiny muted">{t.artist}</div></td><td className="num">{t.plays}</td><td className="num">{t.listeners}</td><td className="num">{t.completionPct}%</td><td className="num">{t.skipPct}%</td></tr>)}</tbody></table></div>
            </section>
            <section className="panel stack"><h3>Mood of what people play</h3><HBars data={s.data.moods} label="mood" value="share" unit="%" />
              <h3 style={{ marginTop: 10 }}>Where plays start</h3><HBars data={s.data.origins} label="origin" /></section>
          </div>
        </>
      )}
    </div>
  );
}

export default function Admin() {
  const { can, user } = useAuth();
  const tabs = TABS.filter(([, , perm]) => can(perm));
  if (!tabs.length) return <ErrorState error={{ message: 'Your role does not include admin access.' }} />;
  return (
    <div className="page">
      <PageHead kicker={`${user.roleName} console`} title="Admin" />
      <nav className="subnav" aria-label="Admin sections">
        {tabs.map(([to, label]) => <NavLink key={to} to={to ? `/admin/${to}` : '/admin'} end={!to}>{label}</NavLink>)}
      </nav>
      <Routes>
        <Route index element={tabs[0][0] === '' ? <Overview /> : <Navigate to={tabs[0][0]} replace />} />
        <Route path="catalog" element={<CatalogAdmin />} />
        <Route path="review" element={<ReviewAdmin />} />
        <Route path="users" element={<UsersAdmin />} />
        <Route path="artists" element={<ArtistReviewAdmin />} />
        <Route path="*" element={<Navigate to={tabs[0][0] ? `/admin/${tabs[0][0]}` : '/admin'} replace />} />
      </Routes>
    </div>
  );
}

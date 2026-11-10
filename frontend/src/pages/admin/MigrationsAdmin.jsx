import { useApi } from '../../hooks/useApi';
import { api } from '../../services/api';
import { ErrorState, Stat, ListSkeleton } from '../../components/ui';

export function MigrationsAdmin() {
  const history = useApi(() => api.admin.migrations(), []);
  if (history.loading) return <ListSkeleton n={5} />;
  if (history.error) return <ErrorState error={history.error} onRetry={history.reload} />;
  const d = history.data;
  return (
    <div className="stack" style={{ '--gap': '16px' }}>
      <div className="grid-4">
        <Stat label="Current schema" value={d.currentVersion || 'Missing'} foot={`Expected ${d.expectedVersion}`} />
        <Stat label="Applied migrations" value={d.applied.length} />
        <Stat label="Pending migrations" value={d.pending.length} />
        <Stat label="Checksum problems" value={d.problems.length} />
      </div>
      <section className="panel stack">
        <div className="row between wrap"><h3>Migration readiness</h3><span className={`pill ${d.ready ? 'success' : 'warning'}`}>{d.ready ? 'In sync' : 'Action required'}</span></div>
        {!d.baseline && <p className="small danger">The baseline record (0000) is missing. Run the documented database setup before applying migrations.</p>}
        {d.problems.map((problem) => <p key={problem.version} className="small danger"><strong>{problem.version} · {problem.file}</strong> — {problem.message}</p>)}
        {d.pending.length > 0 && <p className="small soft">Pending migrations are listed below. Apply them with the operator command <code>npm run db:migrate</code> after taking the required database backup. This screen never executes DDL.</p>}
        {d.ready && <p className="small soft">The database records every checked-in migration through the expected version and all applied checksums match.</p>}
      </section>
      <section className="panel stack">
        <h3>Applied history</h3>
        {d.applied.length ? <div className="table-wrap"><table className="data"><thead><tr><th>Version</th><th>Name</th><th>Applied at</th><th>Duration</th><th>SHA-256</th></tr></thead><tbody>
          {d.applied.map((row) => <tr key={row.version}><td className="num">{row.version}</td><td>{row.name}</td><td>{row.appliedAt ? new Date(row.appliedAt).toLocaleString() : '—'}</td><td className="num">{row.executionMs ?? 0} ms</td><td><code title={row.checksum || ''}>{row.checksum ? `${row.checksum.slice(0, 16)}…` : 'baseline'}</code></td></tr>)}
        </tbody></table></div> : <p className="small muted">No applied migration records were returned.</p>}
      </section>
      {d.pending.length > 0 && <section className="panel stack"><h3>Pending source files</h3><div className="table-wrap"><table className="data"><thead><tr><th>Version</th><th>Name</th><th>File</th><th>SHA-256</th></tr></thead><tbody>
        {d.pending.map((row) => <tr key={row.version}><td className="num">{row.version}</td><td>{row.name}</td><td><code>{row.file}</code></td><td><code title={row.checksum}>{row.checksum.slice(0, 16)}…</code></td></tr>)}
      </tbody></table></div></section>}
      <p className="tiny muted">Read-only status view. It compares schema_migrations against the migration files shipped with this code version. It does not inspect every live table, trigger or view for drift and it cannot replace a database restore rehearsal.</p>
    </div>
  );
}

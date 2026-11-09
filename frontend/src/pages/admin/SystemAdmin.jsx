import { useState } from 'react';
import { api } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../hooks/useAuth';
import { ErrorState, ListSkeleton, Stat, Thinking } from '../../components/ui';
import { Refresh } from '../../components/Icons';
import { dateTime, n } from '../../lib/format';

const parse = (x) => (typeof x === 'string' ? JSON.parse(x) : x);

export function HealthAdmin() {
  const { data, error, loading, reload } = useApi(() => api.admin.health(), []);
  const [showIdx, setShowIdx] = useState(false);
  if (loading) return <Thinking label="Checking the database" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const bad = data.integrity.filter((c) => !c.ok && c.severity === 'error').length;
  return (
    <div className="stack" style={{ '--gap': '18px' }}>
      <div className="grid-4">
        <Stat label="MySQL" value={data.server.version.split('-')[0]} foot={`schema “${data.server.database}”`} />
        <Stat label="Size" value={`${(data.server.sizeKb / 1024).toFixed(1)} MB`} foot={`${data.server.tables} tables · ${data.indexes.length} indexes`} />
        <Stat label="Integrity checks" value={bad ? `${bad} failing` : 'All pass'} foot={`${data.integrity.length} rules a constraint cannot express`} />
        <Stat label="Live sessions" value={n(data.sessions.open_listening_sessions)} foot={`${data.sessions.active_private_sessions} private · ${data.sessions.expired_private_sessions} expired awaiting cleanup`} />
      </div>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="panel stack">
          <div className="row between"><h3>Integrity</h3><button className="btn sm ghost" onClick={reload}><Refresh />Re-check</button></div>
          {data.integrity.map((c) => (
            <div key={c.label} className="row between small" style={{ '--gap': '12px' }}>
              <span>{c.label}</span>
              <span className={`status ${c.ok ? 'ok' : c.severity === 'warn' ? 'WARN' : 'ERROR'}`}>{c.ok ? 'OK' : `${c.violations} ${c.severity === 'warn' ? 'pending' : 'rows'}`}</span>
            </div>
          ))}
        </section>
        <section className="panel stack">
          <h3>Pipeline & review</h3>
          <div className="row wrap small" style={{ '--gap': '14px' }}>
            <span>Review queue: <b>{data.reviewQueue.total}</b> ({data.reviewQueue.duplicates} duplicates, {data.reviewQueue.suspicious} suspicious, {data.reviewQueue.failed} failed)</span>
          </div>
          <div className="table-wrap"><table className="data"><thead><tr><th>Job type</th><th>Status</th><th>Count</th><th>Latest</th></tr></thead>
            <tbody>{data.jobs.map((j, i) => <tr key={i}><td className="small">{j.type}</td><td><span className={`status ${j.status}`}>{j.status}</span></td><td className="num">{j.n}</td><td className="small">{dateTime(j.lastAt)}</td></tr>)}</tbody></table></div>
          {data.failedJobs.length > 0 && <div className="small" style={{ color: 'var(--bad)' }}>{data.failedJobs.map((f) => `#${f.id} ${f.type}: ${f.error}`).join(' · ')}</div>}
        </section>
      </div>
      <section className="panel stack">
        <h3>Slowest statement shapes</h3>
        {!data.slowQueries.available ? <p className="small muted">{data.slowQueries.note}</p> : (
          <div className="table-wrap"><table className="data"><thead><tr><th>Statement (normalised digest)</th><th>Calls</th><th>Avg ms</th><th>Max ms</th><th>Rows examined</th><th>No index</th></tr></thead>
            <tbody>{data.slowQueries.rows.map((r, i) => <tr key={i}><td className="mono tiny" style={{ maxWidth: 520 }}>{r.statement}</td><td className="num">{n(r.calls)}</td><td className="num">{r.avgMs}</td><td className="num">{r.maxMs}</td><td className="num">{n(r.rowsExamined)}</td><td className="num">{n(r.noIndexUsed)}</td></tr>)}</tbody></table></div>
        )}
      </section>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="panel stack">
          <h3>Tables</h3>
          <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}><table className="data"><thead><tr><th>Table</th><th>Rows</th><th>Data + index</th></tr></thead>
            <tbody>{data.tables.map((t) => <tr key={t.name}><td className="mono small">{t.name}</td><td className="num">{n(t.rows)}</td><td className="num small">{t.sizeKb} KB</td></tr>)}</tbody></table></div>
        </section>
        <section className="panel stack">
          <h3>Recent audit events</h3>
          {data.recentAudit.map((a) => <div key={a.id} className="row between small"><span><b>{a.action}</b> {a.entityType} {a.entityId}</span><span className="muted">{a.actor || 'system'} · {dateTime(a.createdAt)}</span></div>)}
        </section>
      </div>
      <section className="panel stack">
        <div className="row between"><h3>Indexes</h3><button className="btn sm ghost" onClick={() => setShowIdx(!showIdx)}>{showIdx ? 'Hide' : `Show all ${data.indexes.length}`}</button></div>
        {showIdx && (
          <div className="table-wrap" style={{ maxHeight: 460, overflowY: 'auto' }}><table className="data"><thead><tr><th>Table</th><th>Index</th><th>Columns</th><th>Type</th><th>Cardinality</th></tr></thead>
            <tbody>{data.indexes.map((x) => <tr key={x.tableName + x.indexName}><td className="mono small">{x.tableName}</td><td className="mono small">{x.indexName}{x.isUnique ? ' ·unique' : ''}</td><td className="small">{x.columns}</td><td className="small">{x.type}</td><td className="num">{n(x.cardinality)}</td></tr>)}</tbody></table></div>
        )}
      </section>
    </div>
  );
}

export function PerformanceAdmin() {
  const { data, error, loading, reload } = useApi(() => api.admin.performance(), []);
  const [open, setOpen] = useState(null);
  if (loading) return <Thinking label="Running EXPLAIN ANALYZE" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const plan = (e) => e.plan.map((p) => `${p.table}: ${p.type}${p.key ? ` via ${p.key}` : ' (no index)'} · ~${p.rows} rows`).join(' | ');
  return (
    <div className="stack" style={{ '--gap': '16px' }}>
      <p className="soft" style={{ maxWidth: 760 }}>Each query is explained twice: as MUSE runs it, and with its index ignored (IGNORE INDEX) or rewritten so no index can help. The rows examined and the measured time (EXPLAIN ANALYZE) show what the index buys.</p>
      {data.map((q) => {
        const speedup = q.withoutIndex && q.withIndex.actualMs && q.withoutIndex.actualMs ? q.withoutIndex.actualMs / q.withIndex.actualMs : null;
        return (
          <section key={q.id} className="panel stack" style={{ '--gap': '10px' }}>
            <div className="row between wrap"><h3>{q.title}</h3>{speedup && <span className="chip accent">{speedup.toFixed(1)}× faster · {q.withIndex.rowsExamined} vs {q.withoutIndex.rowsExamined} rows</span>}</div>
            <p className="small soft">{q.why}</p>
            <div className="small"><span className="muted">Index:</span> <code>{q.index}</code></div>
            <pre className="plan">{q.sql}</pre>
            <div className="grid-2">
              <div className="card stack" style={{ '--gap': '6px' }}><span className="tiny muted">With the index</span><span className="small">{plan(q.withIndex)}</span><span className="small num">{q.withIndex.actualMs !== null ? `${q.withIndex.actualMs} ms measured` : ''}</span></div>
              {q.withoutIndex && <div className="card stack" style={{ '--gap': '6px' }}><span className="tiny muted">{q.withoutLabel}</span><span className="small">{plan(q.withoutIndex)}</span><span className="small num">{q.withoutIndex.actualMs !== null ? `${q.withoutIndex.actualMs} ms measured` : ''}</span></div>}
            </div>
            <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(open === q.id ? null : q.id)}>{open === q.id ? 'Hide' : 'Show'} EXPLAIN ANALYZE trees</button>
            {open === q.id && <div className="grid-2"><pre className="plan">{q.withIndex.analyze}</pre>{q.withoutIndex && <pre className="plan">{q.withoutIndex.analyze}</pre>}</div>}
          </section>
        );
      })}
    </div>
  );
}

export function ModelsAdmin() {
  const toast = useToast();
  const { can } = useAuth();
  const { data, error, loading, reload, setData } = useApi(() => api.admin.models(), []);
  const [draft, setDraft] = useState({});
  if (loading) return <ListSkeleton />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const kinds = [...new Set(data.map((m) => m.kind))];
  const save = async (m, p) => {
    const key = `${m.id}:${p.code}`;
    try { setData(await api.admin.setParam(m.id, p.code, Number(draft[key]))); setDraft((d) => ({ ...d, [key]: undefined })); toast.success(`${p.code} = ${draft[key]} (audited; used by the next list)`); } catch (e) { toast.error(e); }
  };
  const activate = async (m) => {
    if (!window.confirm(`Make ${m.name} ${m.version} the active ${m.kind.toLowerCase()} model? The previous version and its outputs are kept.`)) return;
    try { setData(await api.admin.activateModel(m.id)); toast.success(`${m.name} ${m.version} is now active`); } catch (e) { toast.error(e); }
  };
  return (
    <div className="stack" style={{ '--gap': '16px' }}>
      <p className="soft" style={{ maxWidth: 760 }}>Every model is versioned. Weights and thresholds live in <code>model_parameters</code>, are range-checked by the database and audited on change. The recommender reads them on every list, so a change takes effect immediately.</p>
      {kinds.map((k) => (
        <section key={k} className="panel stack">
          <h3>{k.replace('_', ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())}</h3>
          {data.filter((m) => m.kind === k).map((m) => (
            <div key={m.id} className="card stack" style={{ '--gap': '10px' }}>
              <div className="row between wrap">
                <div><strong>{m.name} {m.version}</strong> {m.isActive && <span className="status ok">active</span>}<div className="small muted">{m.description}</div></div>
                {!m.isActive && can('models.tune') && <button className="btn sm" onClick={() => activate(m)}>Activate</button>}
              </div>
              {m.params.length > 0 && (
                <div className="table-wrap"><table className="data"><thead><tr><th>Parameter</th><th>Value</th><th>Range</th><th>Meaning</th></tr></thead>
                  <tbody>{m.params.map((p) => {
                    const key = `${m.id}:${p.code}`;
                    const v = draft[key] ?? p.value;
                    return (
                      <tr key={p.code}>
                        <td className="mono small">{p.code}</td>
                        <td>{can('models.tune') ? (
                          <div className="row" style={{ '--gap': '6px' }}>
                            <input className="input" style={{ width: 96, minHeight: 32, padding: '4px 8px' }} type="number" step="0.01" min={p.min} max={p.max} value={v} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
                            {draft[key] !== undefined && Number(draft[key]) !== Number(p.value) && <button className="btn sm primary" onClick={() => save(m, p)}>Save</button>}
                          </div>) : <span className="num">{p.value}</span>}</td>
                        <td className="num small muted">{p.min}–{p.max}</td>
                        <td className="small soft">{p.description}</td>
                      </tr>
                    );
                  })}</tbody></table></div>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

export function UsersAdmin() {
  const toast = useToast();
  const { user: me } = useAuth();
  const [q, setQ] = useState('');
  const { data, error, loading, reload } = useApi(() => api.admin.users(q), [q]);
  const update = async (u, body) => {
    try { await api.admin.updateUser(u.id, body); toast.success(`Updated @${u.username} (audited)`); reload(); } catch (e) { toast.error(e); }
  };
  return (
    <div className="stack" style={{ '--gap': '14px' }}>
      <input className="input" style={{ maxWidth: 320 }} placeholder="Search users" value={q} onChange={(e) => setQ(e.target.value)} />
      {loading && <ListSkeleton />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <div className="table-wrap"><table className="data">
          <thead><tr><th>User</th><th>Role</th><th>Plays</th><th>Minutes</th><th>Top genre</th><th>Main mood</th><th>Last sign-in</th><th>Active</th></tr></thead>
          <tbody>{data.map((u) => (
            <tr key={u.id}>
              <td><strong>{u.displayName}</strong><div className="tiny muted">@{u.username} · {u.email}{u.locked ? ' · locked' : ''}</div></td>
              <td><select className="select" style={{ minHeight: 32, padding: '4px 8px' }} value={u.role} disabled={u.id === me.id} onChange={(e) => update(u, { role: e.target.value })}><option>LISTENER</option><option>CURATOR</option><option>ADMIN</option></select></td>
              <td className="num">{n(u.plays)}</td><td className="num">{n(u.minutes)}</td>
              <td className="small">{u.favoriteGenre || '—'}</td><td className="small">{u.dominantMood || '—'}</td>
              <td className="small">{dateTime(u.lastLoginAt)}</td>
              <td><label className="check"><input type="checkbox" checked={!!u.isActive} disabled={u.id === me.id} onChange={(e) => update(u, { isActive: e.target.checked })} /></label></td>
            </tr>
          ))}</tbody></table></div>
      )}
    </div>
  );
}

export function AuditAdmin() {
  const [type, setType] = useState('');
  const { data, error, loading, reload } = useApi(() => api.admin.audit({ entityType: type || undefined, limit: 100 }), [type]);
  return (
    <div className="stack" style={{ '--gap': '14px' }}>
      <div className="row wrap">
        <select className="select" style={{ width: 220 }} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All entities</option>{['song', 'artist', 'album', 'mood', 'mood_keyword', 'user', 'model', 'model_parameter', 'review', 'music_source'].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="small muted">Append-only: the application account has no UPDATE or DELETE privilege on this table.</span>
      </div>
      {loading && <ListSkeleton />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <div className="table-wrap"><table className="data">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Entity</th><th>Before</th><th>After</th></tr></thead>
          <tbody>{data.map((a) => (
            <tr key={a.id}>
              <td className="small">{dateTime(a.createdAt)}</td><td className="small">{a.actor || 'system'}</td><td><b className="small">{a.action}</b></td>
              <td className="small mono">{a.entityType} {a.entityId}</td>
              <td className="tiny mono" style={{ maxWidth: 260 }}>{a.oldValues ? JSON.stringify(parse(a.oldValues)) : '—'}</td>
              <td className="tiny mono" style={{ maxWidth: 260 }}>{a.newValues ? JSON.stringify(parse(a.newValues)) : '—'}</td>
            </tr>
          ))}</tbody></table></div>
      )}
    </div>
  );
}

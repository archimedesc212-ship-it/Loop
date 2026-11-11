import { useState } from 'react';
import { api } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../hooks/useAuth';
import { ErrorState, ListSkeleton, Modal, Empty, Field } from '../../components/ui';
import { Refresh } from '../../components/Icons';
import { dateTime } from '../../lib/format';

const parse = (x) => (typeof x === 'string' ? JSON.parse(x) : x);

function JobLog({ id, onClose }) {
  const { data, error, loading } = useApi(() => api.admin.job(id), [id]);
  return (
    <Modal title={`Job ${id}`} onClose={onClose} width={860}>
      {loading && <ListSkeleton n={4} />}
      {error && <ErrorState error={error} />}
      {data && (
        <div className="stack">
          <dl className="kv">
            <dt>Type</dt><dd>{data.job.job_type}</dd>
            <dt>Status</dt><dd><span className={`status ${data.job.status}`}>{data.job.status}</span> · attempt {data.job.retry_count + (data.job.status === 'COMPLETED' ? 1 : 0)} of {data.job.max_retries + 1}</dd>
            <dt>Idempotency key</dt><dd className="mono">{data.job.idempotency_key}</dd>
            <dt>Processing version</dt><dd>{data.job.processing_version}</dd>
            <dt>Started / finished</dt><dd>{dateTime(data.job.started_at)} → {dateTime(data.job.completed_at)}</dd>
            {data.job.stats && <><dt>Result</dt><dd className="mono">{JSON.stringify(parse(data.job.stats))}</dd></>}
            {data.job.last_error && <><dt>Last error</dt><dd style={{ color: 'var(--bad)' }}>{data.job.last_error}</dd></>}
          </dl>
          {data.children.length > 0 && <div className="row wrap small">{data.children.map((c) => <span key={c.id} className="chip">#{c.id} {c.type} <span className={`status ${c.status}`}>{c.status}</span></span>)}</div>}
          <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}><table className="data">
            <thead><tr><th>Level</th><th>Stage</th><th>Message</th></tr></thead>
            <tbody>{data.logs.map((l) => <tr key={l.id}><td><span className={`status ${l.level}`}>{l.level}</span></td><td className="mono">{l.stage}</td><td className="small">{l.message}</td></tr>)}</tbody>
          </table></div>
        </div>
      )}
    </Modal>
  );
}

export function PipelineAdmin() {
  const toast = useToast();
  const { can } = useAuth();
  const sources = useApi(() => api.admin.sources(), []);
  const jobs = useApi(() => api.admin.jobs(), []);
  const feeds = useApi(() => api.admin.feeds(), []);
  const [busy, setBusy] = useState(null);
  const [open, setOpen] = useState(null);
  const run = async (kind, fn) => {
    setBusy(kind);
    try {
      const r = await fn();
      toast[r.status === 'FAILED' ? 'error' : 'success'](`Job ${r.jobId}: ${r.status}${r.summary ? ` — ${r.summary}` : ''}`);
      jobs.reload(); sources.reload();
    } catch (e) { toast.error(e); } finally { setBusy(null); }
  };
  const toggleSource = async (s) => {
    try { await api.admin.updateSource(s.code, { enabled: !s.enabled }); toast.success(`${s.name} ${s.enabled ? 'disabled' : 'enabled'} (audited)`); sources.reload(); } catch (e) { toast.error(e); }
  };
  return (
    <div className="stack" style={{ '--gap': '18px' }}>
      <section className="panel stack">
        <div className="row between wrap"><h3>Run the pipeline</h3><span className="tiny muted">SOURCE → DISCOVERY → VALIDATION → DUPLICATE DETECTION → CANONICALISATION → STORAGE → AUDIO & MOOD ANALYSIS → TRENDS → WORLDS</span></div>
        <div className="row wrap">
          {feeds.data && feeds.data.map((f) => (
            <button key={f} className="btn" disabled={!can('pipeline.run') || !!busy} onClick={() => run(f, () => api.admin.ingest({ sourceCode: 'MUSE_CATALOG_FEED', file: f }))}>{busy === f ? 'Ingesting…' : `Ingest ${f}`}</button>
          ))}
          <button className="btn" disabled={!can('pipeline.run') || !!busy} onClick={() => run('mb', () => api.admin.ingest({ sourceCode: 'MUSICBRAINZ', force: true }))}>{busy === 'mb' ? 'Running…' : 'Ingest from MusicBrainz (with fallback)'}</button>
          <button className="btn" disabled={!can('pipeline.run') || !!busy} onClick={() => run('trends', () => api.admin.trends())}>{busy === 'trends' ? 'Computing…' : 'Trend snapshot'}</button>
          <button className="btn primary" disabled={!can('pipeline.run') || !!busy} onClick={() => run('weekly', () => api.admin.weekly(true))}>{busy === 'weekly' ? 'Running weekly update…' : 'Run weekly intelligence update'}</button>
        </div>
        <p className="small muted">Runs are idempotent: the same feed in the same week is recognised by its idempotency key and payload hash, so nothing is ingested twice. Unreachable sources fall back to the next approved source, then to the cached catalogue — never reported as live.</p>
      </section>

      <section className="panel stack">
        <h3>Sources and rights</h3>
        {sources.error && <ErrorState error={sources.error} onRetry={sources.reload} />}
        {sources.data && (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Source</th><th>Provides</th><th>Licence</th><th>Fallback</th><th>Records</th><th>Quality</th><th>Last success</th><th /></tr></thead>
            <tbody>{sources.data.map((s) => (
              <tr key={s.code}>
                <td><strong>{s.name}</strong><div className="tiny muted">{s.type.toLowerCase().replace('_', ' ')} · {s.access.toLowerCase().replace('_', ' ')} · priority {s.priority}</div></td>
                <td className="small">{String(s.rights).toLowerCase().replace(/_/g, ' ').replace(/,/g, ', ')}</td>
                <td className="small">{s.license}{s.requiresAttribution ? <div className="tiny muted">{s.attribution}</div> : null}</td>
                <td className="small">{s.fallback || '—'}</td>
                <td className="num">{s.records || 0}<div className="tiny muted">{s.failed ? `${s.failed} failed` : ''}{s.inReview ? ` ${s.inReview} in review` : ''}</div></td>
                <td className="num">{s.avgQuality ? `${Math.round(s.avgQuality * 100)}%` : '—'}</td>
                <td className="small">{dateTime(s.lastSuccessAt)}</td>
                <td>{can('pipeline.run') && <button className="btn sm ghost" onClick={() => toggleSource(s)}>{s.enabled ? 'Disable' : 'Enable'}</button>}{!s.enabled && <span className="status SKIPPED">off</span>}</td>
              </tr>
            ))}</tbody></table></div>
        )}
      </section>

      <section className="panel stack">
        <div className="row between"><h3>Jobs</h3><button className="btn sm ghost" onClick={jobs.reload}><Refresh />Refresh</button></div>
        {jobs.error && <ErrorState error={jobs.error} onRetry={jobs.reload} />}
        {jobs.data && (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>#</th><th>Type</th><th>Status</th><th>Source</th><th>Result</th><th>Retries</th><th>Started</th><th>Took</th><th /></tr></thead>
            <tbody>{jobs.data.map((j) => {
              const st = parse(j.stats);
              return (
                <tr key={j.id}>
                  <td className="num muted">{j.id}{j.parentId ? <div className="tiny">↳ {j.parentId}</div> : null}</td>
                  <td className="small">{j.type}</td>
                  <td><span className={`status ${j.status}`}>{j.status}</span></td>
                  <td className="small">{j.source || '—'}</td>
                  <td className="tiny mono" style={{ maxWidth: 280 }}>{j.error ? <span style={{ color: 'var(--bad)' }}>{j.error}</span> : st ? JSON.stringify(st).slice(0, 120) : '—'}</td>
                  <td className="num">{j.retries}/{j.maxRetries}</td>
                  <td className="small">{dateTime(j.startedAt)}</td>
                  <td className="num small">{j.durationSec !== null ? `${j.durationSec}s` : '—'}</td>
                  <td><button className="btn sm ghost" onClick={() => setOpen(j.id)}>Log</button></td>
                </tr>
              );
            })}</tbody></table></div>
        )}
      </section>
      {open && <JobLog id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

const TYPE_LABEL = { POSSIBLE_DUPLICATE: 'Possible duplicate', SUSPICIOUS_METADATA: 'Suspicious metadata', FAILED_INGESTION: 'Failed ingestion', SOURCE_CONFLICT: 'Source conflict' };
const ACTIONS = {
  POSSIBLE_DUPLICATE: ['MERGE', 'APPROVE', 'REJECT', 'IGNORE', 'REPROCESS'],
  SUSPICIOUS_METADATA: ['APPROVE', 'REJECT', 'IGNORE', 'REPROCESS'],
  FAILED_INGESTION: ['REPROCESS', 'REJECT', 'IGNORE'],
  SOURCE_CONFLICT: ['APPROVE', 'MERGE', 'REJECT', 'IGNORE'],
};
const ACTION_LABEL = { MERGE: 'Same song — link', APPROVE: 'Approve as new', REJECT: 'Reject', IGNORE: 'Ignore', REPROCESS: 'Fix & reprocess' };
const PATCHABLE = ['title', 'artist', 'duration_sec', 'isrc', 'language', 'genre', 'release_year'];

function ReprocessForm({ item, onDone, onClose }) {
  const toast = useToast();
  const [patch, setPatch] = useState({});
  const [note, setNote] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== '').map(([k, v]) => [k, ['duration_sec', 'release_year'].includes(k) ? Number(v) : v]));
    try {
      const r = await api.admin.decide(item.id, { action: 'REPROCESS', note: note || undefined, patch: Object.keys(clean).length ? clean : undefined });
      toast.success(r.message); onDone();
    } catch (e2) { toast.error(e2); }
  };
  return (
    <Modal title={`Fix & reprocess ${item.externalId}`} onClose={onClose} width={620}>
      <form className="stack" onSubmit={submit}>
        <p className="small soft">Correct any field, then the record runs through validation, duplicate detection and storage again as a new logged job.</p>
        {item.details.errors && <div className="small" style={{ color: 'var(--bad)' }}>{item.details.errors.join('; ')}</div>}
        <div className="grid-2">
          {PATCHABLE.map((k) => (
            <Field key={k} label={k.replace('_', ' ')} hint={item.payload && item.payload[k] !== undefined ? `now: ${item.payload[k]}` : undefined}>
              <input className="input" value={patch[k] ?? ''} onChange={(e) => setPatch({ ...patch, [k]: e.target.value })} />
            </Field>
          ))}
        </div>
        <Field label="Note for the audit log"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary">Reprocess</button></div>
      </form>
    </Modal>
  );
}

export function ReviewAdmin() {
  const toast = useToast();
  const { can } = useAuth();
  const [status, setStatus] = useState('PENDING');
  const { data, error, loading, reload } = useApi(() => api.admin.reviews(status), [status]);
  const [fix, setFix] = useState(null);
  const decide = async (item, action) => {
    if (action === 'REPROCESS') { setFix(item); return; }
    const note = window.prompt(`${ACTION_LABEL[action]} — optional note for the audit log`) ?? null;
    if (note === null) return;
    try { const r = await api.admin.decide(item.id, { action, note: note || undefined }); toast.success(r.message); reload(); } catch (e) { toast.error(e); }
  };
  return (
    <div className="stack" style={{ '--gap': '16px' }}>
      <div className="row between wrap">
        <p className="soft" style={{ maxWidth: 640 }}>Ambiguous duplicates, contradictory metadata and failed records are never resolved silently. Every decision is written to the audit log.</p>
        <div className="toggle-group">{['PENDING', 'ALL'].map((s) => <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{s === 'PENDING' ? 'Pending' : 'All'}</button>)}</div>
      </div>
      {loading && <ListSkeleton />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.length === 0 && <Empty title="Nothing to review">Run an ingestion from Pipeline; anything doubtful lands here.</Empty>}
      {data && data.map((item) => (
        <div key={item.id} className="panel stack" style={{ '--gap': '10px' }}>
          <div className="row between wrap">
            <div className="row wrap" style={{ '--gap': '8px' }}><span className={`status ${item.status}`}>{item.status}</span><strong>{TYPE_LABEL[item.type]}</strong><span className="tiny muted">#{item.id} · {item.source} · {item.externalId} · job {item.jobId}</span></div>
            <span className="tiny muted">{dateTime(item.createdAt)}</span>
          </div>
          {item.type === 'POSSIBLE_DUPLICATE' && item.details.incoming && (
            <div className="grid-2">
              <div className="card"><div className="tiny muted">Incoming record</div><strong>{item.details.incoming.title}</strong><div className="small soft">{item.details.incoming.artist} · {item.details.incoming.duration_sec}s</div></div>
              <div className="card"><div className="tiny muted">Existing song #{item.candidateSongId}</div><strong>{item.candidateTitle}</strong><div className="small soft">{item.candidateArtist} · {item.candidateDuration}s</div></div>
              <div className="small soft">Title similarity {Math.round(item.details.titleSimilarity * 100)}% · duration differs by {item.details.durationDiff}s</div>
            </div>
          )}
          {item.details.errors && <div className="small" style={{ color: 'var(--bad)' }}>{item.details.errors.join('; ')}</div>}
          {item.details.issues && <div className="small" style={{ color: 'var(--warn)' }}>{item.details.issues.join('; ')}</div>}
          {item.payload && item.type !== 'POSSIBLE_DUPLICATE' && <div className="small soft">“{item.payload.title}” · {item.payload.artist} · {item.payload.duration_sec ?? "no duration"}{item.payload.duration_sec ? "s" : ""} · {item.payload.language || 'instrumental'} · {item.payload.genre || 'no genre'}</div>}
          {item.status === 'PENDING' ? (
            can('review.decide') && <div className="row wrap">{ACTIONS[item.type].map((a) => <button key={a} className={`btn sm${a === ACTIONS[item.type][0] ? ' primary' : ''}`} onClick={() => decide(item, a)}>{ACTION_LABEL[a]}</button>)}</div>
          ) : <div className="small muted">Decided by {item.decidedBy || '—'} {dateTime(item.decidedAt)}{item.note ? ` · “${item.note}”` : ''}</div>}
        </div>
      ))}
      {fix && <ReprocessForm item={fix} onClose={() => setFix(null)} onDone={() => { setFix(null); reload(); }} />}
    </div>
  );
}

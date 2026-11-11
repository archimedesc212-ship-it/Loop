import { useState } from 'react';
import { api } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../hooks/useToast';
import { ErrorState, ListSkeleton } from '../../components/ui';

const territoryText = (value) => {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.join(', ') : value; }
    catch { return value; }
  }
  return 'Not declared';
};

export function ArtistReviewAdmin() {
  const [tab, setTab] = useState('applications');
  const apps = useApi(() => api.admin.artistApplications('PENDING'), []);
  const uploads = useApi(() => api.admin.artistUploads('ALL'), []);
  const reports = useApi(() => api.admin.artistRightsReports('ALL'), []);
  const toast = useToast();
  const reload = () => Promise.all([apps.reload(), uploads.reload(), reports.reload()]);
  const act = async (fn, target, message) => {
    try { await fn(target); toast.success(message); await reload(); }
    catch (err) { toast.error(err); }
  };
  const tabs = [
    ['applications', 'Artist applications', apps.data?.length ?? '—'],
    ['uploads', 'Uploads & publication', uploads.data?.length ?? '—'],
    ['reports', 'Rights reports', reports.data?.length ?? '—'],
  ];

  return (
    <div className="stack" style={{ '--gap': '16px' }}>
      <section className="card stack small">
        <strong>Secure upload pipeline</strong>
        <p className="soft">Files stay outside the public web root. A moderator or worker must run ClamAV and ffprobe before the track enters human review. Approval creates a hidden catalogue record; publication is a separate action.</p>
        <p className="muted">Review composition and master rights separately, including territories, licence dates and supporting evidence. A rights checkbox alone is not proof of ownership.</p>
      </section>
      <nav className="subnav" aria-label="Artist moderation tabs">
        {tabs.map(([key, label, count]) => <button type="button" key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label} <span className="tiny muted">{count}</span></button>)}
      </nav>

      {tab === 'applications' && <section className="panel stack">
        <h3>Artist applications</h3>
        {apps.loading && <ListSkeleton n={3} />}{apps.error && <ErrorState error={apps.error} onRetry={apps.reload} />}
        {apps.data?.length === 0 && <p className="small muted">No artist applications are waiting.</p>}
        {apps.data?.map((a) => <article className="card stack" key={a.id}>
          <div className="row between"><div><strong>{a.stageName}</strong><div className="tiny muted">{a.artistType} · {a.countryCode} · @{a.username} · {a.email}</div></div><span className="status-pill pending">PENDING</span></div>
          {a.bio && <p className="small soft">{a.bio}</p>}
          <div className="row wrap tiny">{a.websiteUrl && <a className="link" href={a.websiteUrl} target="_blank" rel="noreferrer">Official website</a>}{a.proofUrl && <a className="link" href={a.proofUrl} target="_blank" rel="noreferrer">Verification reference</a>}</div>
          <div className="row"><button className="btn primary sm" onClick={() => act((id) => api.admin.decideArtistApplication(id, { action: 'APPROVE' }), a.id, 'Artist application approved.')}>Approve</button><button className="btn ghost sm" onClick={() => act((id) => api.admin.decideArtistApplication(id, { action: 'REJECT', note: 'Unable to verify this artist identity from the submitted references.' }), a.id, 'Application rejected.')}>Reject</button></div>
        </article>)}
      </section>}

      {tab === 'uploads' && <section className="panel stack">
        <h3>Uploads and publication</h3>
        <p className="small muted">Quarantined files are private and cannot be played. The only path to publication is a clean malware/media scan, moderator approval, then a separate publish action.</p>
        {uploads.loading && <ListSkeleton n={3} />}{uploads.error && <ErrorState error={uploads.error} onRetry={uploads.reload} />}
        {uploads.data?.length === 0 && <p className="small muted">No artist uploads have been submitted.</p>}
        {uploads.data?.map((u) => <article className="card stack" key={u.id}>
          <div className="row between"><div><strong>{u.title}</strong><div className="tiny muted">{u.artistName} · @{u.username} · {u.durationSec ? `${u.durationSec}s verified` : 'Duration not verified'} · {u.mimeType || 'Format pending'}</div></div><span className={`status-pill ${String(u.status).toLowerCase()}`}>{u.status}</span></div>
          <div className="grid-2 small"><div><span className="muted">Scan: </span>{u.scanStatus || 'NOT_SCANNED'}</div><div><span className="muted">Composition: </span>{u.compositionRights}</div><div><span className="muted">Recording: </span>{u.recordingRights}</div><div><span className="muted">Territories: </span>{territoryText(u.territories)}</div><div><span className="muted">Royalty declaration: </span>{u.royaltySharePct}% {u.royaltyCurrency}</div><div><span className="muted">Licence dates: </span>{u.licenceStart || '—'} to {u.licenceEnd || '—'}</div></div>
          {u.evidenceRef && <a className="link small" href={u.evidenceRef} target="_blank" rel="noreferrer">Open rights evidence</a>}
          {u.reviewNote && <p className="small muted">Moderator note: {u.reviewNote}</p>}
          <div className="row wrap">
            {u.status === 'QUARANTINED' && <button className="btn primary sm" onClick={() => act((id) => api.admin.scanArtistUpload(id), u.id, 'Scan completed. Review the updated scan result.')}>Run malware & media scan</button>}
            {u.status === 'PENDING_REVIEW' && u.scanStatus === 'CLEAN' && <>
              <button className="btn primary sm" onClick={() => act((id) => api.admin.decideArtistUpload(id, { action: 'APPROVE', note: 'Rights evidence and metadata reviewed.' }), u.id, 'Upload approved but not published.')}>Approve metadata & rights</button>
              <button className="btn ghost sm" onClick={() => act((id) => api.admin.decideArtistUpload(id, { action: 'REJECT', note: 'Rights or metadata review did not pass.' }), u.id, 'Upload rejected.')}>Reject</button>
            </>}
            {u.status === 'APPROVED' && <button className="btn primary sm" onClick={() => act((id) => api.admin.publishArtistUpload(id), u.id, 'Track published and made playable.')}>Publish track</button>}
            {u.status === 'PROCESSING' && <span className="small muted">A scanner has claimed this upload.</span>}
            {u.status === 'PUBLISHED' && <span className="small muted">Live in the LOOP catalogue · Song #{u.songId || '—'}</span>}
            {u.status === 'QUARANTINED' && u.scanStatus === 'ERROR' && <span className="small muted">Scanner error: {u.scanDetail || 'Configure ClamAV and ffprobe, then retry.'}</span>}
          </div>
        </article>)}
      </section>}

      {tab === 'reports' && <section className="panel stack">
        <h3>Rights and safety reports</h3>
        {reports.loading && <ListSkeleton n={2} />}{reports.error && <ErrorState error={reports.error} onRetry={reports.reload} />}
        {reports.data?.length === 0 && <p className="small muted">No open reports.</p>}
        {reports.data?.map((r) => <article className="card stack" key={r.id}>
          <div className="row between"><strong>{r.reportType}: {r.title}</strong><span className="status-pill pending">{r.status}</span></div>
          <p className="small soft">{r.details}</p><div className="tiny muted">{r.artistName} · reported by @{r.reporter}</div>
          {r.evidenceRef && <a className="link small" href={r.evidenceRef} target="_blank" rel="noreferrer">Open report evidence</a>}
          {!['RESOLVED', 'DISMISSED'].includes(r.status) && <div className="row wrap">
            {r.status === 'OPEN' && <button className="btn sm" onClick={() => act((id) => api.admin.resolveArtistRightsReport(id, { status: 'UNDER_REVIEW', note: 'Assigned for review.' }), r.id, 'Report assigned for review.')}>Under review</button>}
            <button className="btn primary sm" onClick={() => act((id) => api.admin.resolveArtistRightsReport(id, { status: 'RESOLVED', note: 'Rights report resolved. Copyright reports trigger takedown.' }), r.id, 'Report resolved.')}>Resolve / takedown</button>
            <button className="btn ghost sm" onClick={() => act((id) => api.admin.resolveArtistRightsReport(id, { status: 'DISMISSED', note: 'Report dismissed after review.' }), r.id, 'Report dismissed.')}>Dismiss</button>
          </div>}
        </article>)}
      </section>}
    </div>
  );
}

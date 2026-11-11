import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, isDemoMode } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useApi } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';
import { Field, PageHead, ErrorState, Skeleton } from '../components/ui';

export default function ArtistApply() {
  const { user } = useAuth();
  const isGuest = !!user?.email?.endsWith('@guest.loop.invalid');
  const profile = useApi(() => api.artist.profile(), [], { skip: isDemoMode || isGuest });
  const toast = useToast();
  const [form, setForm] = useState({ stageName: '', artistType: 'SOLO', countryCode: 'IN', bio: '', websiteUrl: '', proofUrl: '' });
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const change = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      await api.artist.apply({ ...form, websiteUrl: form.websiteUrl || undefined, proofUrl: form.proofUrl || undefined, bio: form.bio || undefined });
      setSubmitted(true); await profile.reload(); toast.success('Artist application sent for review.');
    } catch (err) { toast.error(err); } finally { setBusy(false); }
  };

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <PageHead kicker="LOOP for creators" title="Become an artist" />
      <section className="panel stack">
        <h3>How artist access works</h3>
        <p className="soft small">Apply with a public artist identity and links that help LOOP moderators verify it. Artist access is granted only after manual review. Uploading a recording requires a separate rights declaration, a malware/media scan and a second human review.</p>
        {isDemoMode ? (
          <div className="card stack"><strong>Server-backed mode required</strong><p className="small muted">This preview is using the local catalogue demo. Artist applications and file uploads need the Express API and MySQL database. Set <code>VITE_DEMO_MODE=false</code> after configuring the backend and applying database migration 0008.</p></div>
        ) : isGuest ? (
          <div className="card stack"><strong>Sign in or create an account first</strong><p className="small muted">Artist applications must be connected to a lasting LOOP account. Guest listening sessions cannot apply for artist access.</p><div className="row wrap"><Link className="btn primary" to="/register">Create account</Link><Link className="btn ghost" to="/login">Sign in</Link></div></div>
        ) : (
          <>
            {profile.loading && <Skeleton h={90} />}
            {profile.error && <ErrorState error={profile.error} onRetry={profile.reload} />}
            {profile.data?.artists?.length > 0 && <div className="card stack"><strong>Artist access is already active</strong><Link className="btn primary" to="/artist/studio">Open Artist Studio</Link></div>}
            {profile.data?.applications?.map((a) => (
              <div className="card row between" key={a.id}>
                <div><strong>{a.stageName}</strong><div className="tiny muted">Submitted {new Date(a.submittedAt).toLocaleDateString()}</div>{a.reviewNote && <p className="small muted">{a.reviewNote}</p>}</div>
                <span className={`status-pill ${a.status.toLowerCase()}`}>{a.status}</span>
              </div>
            ))}
            {!submitted && !profile.data?.applications?.some((a) => a.status === 'PENDING') && !profile.data?.artists?.length && (
              <form className="stack" onSubmit={submit}>
                <div className="grid-2">
                  <Field label="Artist / stage name"><input className="input" required maxLength={100} value={form.stageName} onChange={(e) => change('stageName', e.target.value)} /></Field>
                  <Field label="Artist type"><select className="select" value={form.artistType} onChange={(e) => change('artistType', e.target.value)}><option value="SOLO">Solo artist</option><option value="GROUP">Group / band</option><option value="COMPOSER">Composer</option><option value="ORCHESTRA">Orchestra</option></select></Field>
                </div>
                <Field label="Country code" hint="Two-letter ISO country code, for example IN, US or GB."><input className="input" required minLength={2} maxLength={2} value={form.countryCode} onChange={(e) => change('countryCode', e.target.value.toUpperCase())} /></Field>
                <Field label="Short artist biography"><textarea className="input" rows={4} maxLength={400} value={form.bio} onChange={(e) => change('bio', e.target.value)} /></Field>
                <Field label="Official website" hint="Optional HTTPS link to an official artist page."><input className="input" type="url" placeholder="https://" value={form.websiteUrl} onChange={(e) => change('websiteUrl', e.target.value)} /></Field>
                <Field label="Verification reference" hint="Optional public profile, label page or other evidence for moderator review. Do not upload identity documents here."><input className="input" type="url" placeholder="https://" value={form.proofUrl} onChange={(e) => change('proofUrl', e.target.value)} /></Field>
                <div className="row"><button className="btn primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit artist application'}</button></div>
              </form>
            )}
            {submitted && <p className="small soft">Your application is in the review queue. You can return here to see its status.</p>}
          </>
        )}
      </section>
    </div>
  );
}

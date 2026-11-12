import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, isDemoMode } from '../services/api';
import { useApi } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';
import { Field, PageHead, ErrorState, Skeleton } from '../components/ui';

const initial = { title: '', versionLabel: '', genreId: '', languageId: '', durationSec: 180, releaseYear: new Date().getFullYear(), explicit: false,
  compositionRights: 'OWNED', recordingRights: 'OWNED', rightsEvidenceRef: '', territories: 'WORLDWIDE', licenceStart: '', licenceEnd: '', royaltySharePct: '0', royaltyCurrency: 'INR' };
const stateLabel = (status) => ({ UPLOADING: 'Waiting for file', QUARANTINED: 'Private quarantine', PROCESSING: 'Security scan', PENDING_REVIEW: 'Awaiting moderator', APPROVED: 'Approved · not public', PUBLISHED: 'Published', REJECTED: 'Rejected', TAKEN_DOWN: 'Taken down', PROCESSING_FAILED: 'Processing failed' }[status] || status);

export default function ArtistStudio() {
  const profile = useApi(() => api.artist.profile(), [], { skip: isDemoMode });
  const genres = useApi(() => api.genres(), [], { skip: isDemoMode });
  const languages = useApi(() => api.languages(), [], { skip: isDemoMode });
  const toast = useToast();
  const [form, setForm] = useState(initial);
  const [artistId, setArtistId] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const change = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  useEffect(() => { if (!artistId && profile.data?.artists?.length) setArtistId(String(profile.data.artists[0].id)); }, [artistId, profile.data]);

  const submit = async (e) => {
    e.preventDefault();
    if (!file) { toast.error('Choose an audio file first.'); return; }
    if (file.size > (profile.data?.maxUploadBytes || 50 * 1024 * 1024)) { toast.error('The selected file exceeds the upload limit.'); return; }
    const territories = form.territories.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
    setBusy(true);
    try {
      const intent = await api.artist.createUpload({
        artistId: Number(artistId), title: form.title, versionLabel: form.versionLabel, genreId: Number(form.genreId),
        languageId: form.languageId ? Number(form.languageId) : undefined, durationSec: Number(form.durationSec),
        releaseYear: Number(form.releaseYear), explicit: form.explicit, fileSize: file.size,
        mimeType: file.type || 'application/octet-stream', compositionRights: form.compositionRights,
        recordingRights: form.recordingRights, rightsEvidenceRef: form.rightsEvidenceRef || undefined,
        territories: territories.length ? territories : ['WORLDWIDE'],
        licenceStart: form.licenceStart || undefined, licenceEnd: form.licenceEnd || undefined,
        royaltySharePct: Number(form.royaltySharePct || 0), royaltyCurrency: form.royaltyCurrency, rightsAccepted: true,
      });
      await api.artist.uploadFile(intent.id, file);
      toast.success('Audio received into private quarantine. It is not public or playable yet.');
      setFile(null); setForm(initial); await profile.reload();
      const input = document.getElementById('artist-audio-file'); if (input) input.value = '';
    } catch (err) { toast.error(err); await profile.reload(); } finally { setBusy(false); }
  };
  const withdraw = async (id) => {
    try { await api.artist.withdraw(id); toast.success('Track withdrawn; playback is blocked.'); await profile.reload(); }
    catch (err) { toast.error(err); }
  };

  return (
    <div className="page" style={{ maxWidth: 1040 }}>
      <PageHead kicker="Independent artists" title="Artist Studio" />
      {isDemoMode ? <div className="panel stack"><strong>Server-backed mode required</strong><p className="small muted">Artist Studio uses authenticated API endpoints and private server storage. Switch off local demo mode with <code>VITE_DEMO_MODE=false</code>, configure MySQL, ClamAV and ffprobe, then apply migration 0008.</p></div> : (
        <>
          {profile.loading && <Skeleton h={130} />}
          {profile.error && <ErrorState error={profile.error} onRetry={profile.reload} />}
          {profile.data && <>
            <section className="panel stack">
              <div className="row between"><div><h3>Your artist profiles</h3><p className="tiny muted">Only profiles linked to your signed-in account can upload.</p></div><Link className="link small" to="/artist/apply">Application status</Link></div>
              <div className="row wrap">{profile.data.artists.map((artist) => <button type="button" key={artist.id} className={`pick${artistId === String(artist.id) ? ' on' : ''}`} onClick={() => setArtistId(String(artist.id))}>{artist.name}</button>)}</div>
            </section>
            <section className="panel stack section">
              <h3>Upload a track</h3>
              <p className="small soft">Upload your track and add a few details. It will stay private until security checks and moderator review are complete.</p>
              <form className="stack" onSubmit={submit}>
                <div className="grid-2">
                  <Field label="Track title"><input className="input" required maxLength={150} value={form.title} onChange={(e) => change('title', e.target.value)} /></Field>
                  <Field label="Genre"><select className="select" required value={form.genreId} onChange={(e) => change('genreId', e.target.value)}><option value="">Choose genre</option>{(genres.data || []).map((genre) => <option key={genre.id} value={genre.id}>{genre.name}</option>)}</select></Field>
                  <Field label="Language"><select className="select" value={form.languageId} onChange={(e) => change('languageId', e.target.value)}><option value="">Unknown / instrumental</option>{(languages.data || []).map((language) => <option key={language.id} value={language.id}>{language.name}</option>)}</select></Field>
                  <Field label="Release year"><input className="input" type="number" min="1900" max="2100" required value={form.releaseYear} onChange={(e) => change('releaseYear', e.target.value)} /></Field>
                </div>
                <label className="row small"><input type="checkbox" checked={form.explicit} onChange={(e) => change('explicit', e.target.checked)} /> Contains explicit content</label>
                <Field label="Audio file" hint="MP3, M4A, WAV, FLAC, OGG or AAC. Maximum 50 MB. Your file stays private until security checks and moderator review are complete.">
                  <input id="artist-audio-file" className="input" type="file" accept="audio/mpeg,audio/mp4,audio/wav,audio/x-wav,audio/flac,audio/ogg,audio/aac,.mp3,.m4a,.wav,.flac,.ogg,.aac" required onChange={(e) => setFile(e.target.files?.[0] || null)} />
                </Field>
                <div className="grid-2">
                  <Field label="Composition rights">
                    <select className="select" value={form.compositionRights} onChange={(e) => change('compositionRights', e.target.value)}>
                      <option value="OWNED">I own / control it</option><option value="LICENSED">I have a licence</option><option value="PUBLIC_DOMAIN">Public domain</option>
                    </select>
                  </Field>
                  <Field label="Recording / master rights">
                    <select className="select" value={form.recordingRights} onChange={(e) => change('recordingRights', e.target.value)}>
                      <option value="OWNED">I own / control it</option><option value="LICENSED">I have a licence</option><option value="PUBLIC_DOMAIN">Public domain</option>
                    </select>
                  </Field>
                </div>
                {(form.compositionRights === 'LICENSED' || form.recordingRights === 'LICENSED') && <Field label="Licence evidence URL" hint="Required when either rights type is licensed.">
                  <input className="input" type="url" required placeholder="https://" value={form.rightsEvidenceRef} onChange={(e) => change('rightsEvidenceRef', e.target.value)} />
                </Field>}
                <Field label="Territories" hint="Enter WORLDWIDE or comma-separated ISO country codes, for example IN, US.">
                  <input className="input" value={form.territories} onChange={(e) => change('territories', e.target.value)} />
                </Field>
                <div className="card stack small">
                  <strong>Rights confirmation</strong>
                  <p className="soft">Only submit music you have permission to distribute in the selected territories. LOOP checks each file and a moderator reviews it before it can become public.</p>
                  <label className="row"><input type="checkbox" required /> I confirm the rights declarations above are accurate.</label>
                </div>
                <div className="row"><button className="btn primary" disabled={busy || !artistId || !file}>{busy ? 'Uploading securely…' : 'Submit track for review'}</button></div>
              </form>
            </section>
            <section className="panel stack section">
              <h3>Track submissions</h3>
              {profile.data.uploads.length === 0 ? <p className="small muted">No submissions yet.</p> : <div className="stack">{profile.data.uploads.map((upload) => (
                <div className="row between card" key={upload.id}>
                  <div className="grow"><strong>{upload.title}</strong><div className="tiny muted">{upload.artistId ? (Array.isArray(profile.data.artists) ? profile.data.artists : []).find((a) => a.id === upload.artistId)?.name : 'Artist'} · {upload.scanStatus} {upload.durationSec ? `· ${upload.durationSec}s` : ''}</div>{upload.reviewNote && <p className="tiny muted">{upload.reviewNote}</p>}{upload.scanDetail && <p className="tiny muted">{upload.scanDetail}</p>}</div>
                  <div className="row wrap"><span className={`status-pill ${upload.status.toLowerCase()}`}>{stateLabel(upload.status)}</span>{!['REJECTED', 'TAKEN_DOWN'].includes(upload.status) && <button className="btn ghost sm" onClick={() => withdraw(upload.id)}>Withdraw</button>}</div>
                </div>
              ))}</div>}
            </section>
          </>}
        </>
      )}
    </div>
  );
}

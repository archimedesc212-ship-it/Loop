import { useState } from 'react';
import { api } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../hooks/useAuth';
import { ErrorState, ListSkeleton, Modal, Field, MoodChip } from '../../components/ui';
import { Plus } from '../../components/Icons';
import { duration } from '../../lib/format';

const fieldErr = (err, k) => (err && err.details && err.details[k]) || null;

function SongForm({ refs, initial, onSaved, onClose }) {
  const toast = useToast();
  const editing = !!initial;
  const [f, setF] = useState(initial ? {
    title: initial.title, artistId: initial.artist.id, albumId: initial.albumId || '', genreId: initial.genreId || '', durationSec: initial.durationSec,
    releaseYear: initial.releaseYear, languageId: initial.language.id || '', isrc: initial.isrc || '', explicit: initial.explicit,
    contentRating: initial.contentRating, popularity: initial.popularity, status: initial.status,
  } : { title: '', artistId: '', albumId: '', genreId: '', durationSec: 210, releaseYear: new Date().getFullYear(), languageId: '', isrc: '',
    explicit: false, contentRating: 'ALL', popularity: 50, withFeatures: true,
    features: { energy: 0.5, valence: 0.6, danceability: 0.5, acousticness: 0.4, instrumentalness: 0.1, speechiness: 0.05, tempo_bpm: 100 } });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, num) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : num ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    const body = {
      title: f.title, albumId: f.albumId || undefined, genreId: f.genreId || undefined, durationSec: f.durationSec, releaseYear: f.releaseYear,
      languageId: f.languageId || undefined, isrc: f.isrc || undefined, explicit: f.explicit, contentRating: f.contentRating, popularity: f.popularity,
    };
    try {
      const r = editing
        ? await api.admin.updateSong(initial.id, { ...body, status: f.status })
        : await api.admin.createSong({ ...body, artistId: f.artistId, features: f.withFeatures ? f.features : undefined });
      toast.success(editing ? 'Song updated (audited)' : `Created “${r.title}” — ${r.status === 'ACTIVE' ? `analysed, moods ${r.moods.join(', ')}` : 'waiting for analysis'}`);
      onSaved(r);
    } catch (e2) { setErr(e2); toast.error(e2); } finally { setBusy(false); }
  };
  return (
    <Modal title={editing ? `Edit “${initial.title}”` : 'Add song'} onClose={onClose} width={680}>
      <form className="stack" onSubmit={submit}>
        <Field label="Title" error={fieldErr(err, 'title')}><input className="input" value={f.title} onChange={set('title')} required maxLength={150} /></Field>
        <div className="grid-2">
          {!editing && <Field label="Artist" error={fieldErr(err, 'artistId')}><select className="select" value={f.artistId} onChange={set('artistId', true)} required><option value="">Choose…</option>{refs.artists.map((a) => <option key={a.id} value={a.id}>{a.name}{a.disambiguation ? ` (${a.disambiguation})` : ''}</option>)}</select></Field>}
          <Field label="Primary genre" error={fieldErr(err, 'genreId')}><select className="select" value={f.genreId} onChange={set('genreId', true)} required={!editing}><option value="">Choose…</option>{refs.genres.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
          <Field label="Album"><select className="select" value={f.albumId} onChange={set('albumId', true)}><option value="">Single (no album)</option>{refs.albums.map((a) => <option key={a.id} value={a.id}>{a.title}{a.artist ? ` · ${a.artist}` : ''}</option>)}</select></Field>
          <Field label="Language"><select className="select" value={f.languageId} onChange={set('languageId', true)}><option value="">Instrumental</option>{refs.languages.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
          <Field label="Duration (seconds)" error={fieldErr(err, 'durationSec')}><input className="input" type="number" value={f.durationSec} onChange={set('durationSec', true)} /></Field>
          <Field label="Release year" error={fieldErr(err, 'releaseYear')}><input className="input" type="number" value={f.releaseYear} onChange={set('releaseYear', true)} /></Field>
          <Field label="ISRC" error={fieldErr(err, 'isrc')} hint="Optional, e.g. INABC2600001"><input className="input" value={f.isrc} onChange={(e) => setF({ ...f, isrc: e.target.value.toUpperCase() })} maxLength={12} /></Field>
          <Field label="Popularity (0–100)"><input className="input" type="number" value={f.popularity} onChange={set('popularity', true)} /></Field>
          <Field label="Content rating"><select className="select" value={f.contentRating} onChange={set('contentRating')}><option>ALL</option><option>TEEN</option><option>MATURE</option></select></Field>
          {editing && <Field label="Status"><select className="select" value={f.status} onChange={set('status')}><option value="ACTIVE">Active</option><option value="HIDDEN">Hidden</option></select></Field>}
        </div>
        <label className="check small"><input type="checkbox" checked={f.explicit} onChange={set('explicit')} />Explicit (content rating becomes at least TEEN)</label>
        {!editing && (
          <div className="card stack" style={{ '--gap': '10px' }}>
            <label className="check small"><input type="checkbox" checked={f.withFeatures} onChange={set('withFeatures')} />I have an approved audio analysis for this song</label>
            {f.withFeatures && (
              <div className="grid-3">
                {Object.keys(f.features).map((k) => (
                  <Field key={k} label={k.replace('_bpm', ' (BPM)')}>
                    <input className="input" type="number" step={k === 'tempo_bpm' ? 1 : 0.01} min={k === 'tempo_bpm' ? 40 : 0} max={k === 'tempo_bpm' ? 220 : 1}
                      value={f.features[k]} onChange={(e) => setF({ ...f, features: { ...f.features, [k]: Number(e.target.value) } })} />
                  </Field>
                ))}
              </div>
            )}
            <p className="tiny muted">With an analysis the song is scored into moods by the active mood model and becomes playable. Without one it waits as PENDING_ANALYSIS.</p>
          </div>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add song'}</button></div>
      </form>
    </Modal>
  );
}

function MoodEditor({ song, refs, onChange }) {
  const toast = useToast();
  const [moodId, setMoodId] = useState('');
  const [conf, setConf] = useState(0.8);
  const act = async (action, id) => {
    try {
      const r = action === 'CLEAR' ? await api.admin.clearCuration(song.id, id) : await api.admin.curate(song.id, id, { action, confidence: action === 'ADD' ? conf : undefined });
      onChange(r);
      toast.success(action === 'CLEAR' ? 'Curation cleared; rules re-applied' : `Mood ${action === 'ADD' ? 'added' : 'removed'} — survives re-analysis`);
    } catch (e) { toast.error(e); }
  };
  return (
    <div className="stack" style={{ '--gap': '10px' }}>
      <div className="row wrap" style={{ '--gap': '6px' }}>
        {song.moodsDetailed.map((m) => (
          <span key={m.id} className="row" style={{ '--gap': '2px' }}>
            <MoodChip name={m.name} emoji={m.emoji} weight={m.confidence} />
            <button className="btn ghost sm" onClick={() => act('REMOVE', m.id)} aria-label={`Remove ${m.name}`}>×</button>
          </span>
        ))}
      </div>
      {song.curations.length > 0 && (
        <div className="small soft">Curator decisions: {song.curations.map((c) => (
          <span key={c.id} className="chip" style={{ marginRight: 6 }}>{c.action === 'ADD' ? '+' : '−'} {c.name}<button className="btn ghost sm" style={{ height: 20, padding: '0 4px' }} onClick={() => act('CLEAR', c.id)}>undo</button></span>
        ))}</div>
      )}
      <div className="row wrap">
        <select className="select" style={{ width: 200 }} value={moodId} onChange={(e) => setMoodId(Number(e.target.value))}><option value="">Add a mood…</option>{refs.moods.map((m) => <option key={m.id} value={m.id}>{m.emoji} {m.name}</option>)}</select>
        <input className="input" type="number" min="0.05" max="1" step="0.05" value={conf} onChange={(e) => setConf(Number(e.target.value))} style={{ width: 90 }} aria-label="Confidence" />
        <button className="btn sm" disabled={!moodId} onClick={() => act('ADD', moodId)}><Plus />Map mood</button>
      </div>
    </div>
  );
}

export function CatalogAdmin() {
  const toast = useToast();
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const list = useApi(() => api.admin.songs({ q, status: status || undefined, page, pageSize: 20 }), [q, status, page]);
  const refs = useApi(() => api.admin.references(), []);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [moods, setMoods] = useState(null);
  const [merge, setMerge] = useState({ duplicateSongId: '', canonicalSongId: '' });

  const openEdit = async (id) => { try { setEditing(await api.admin.song(id)); } catch (e) { toast.error(e); } };
  const openMoods = async (id) => { try { setMoods(await api.admin.song(id)); } catch (e) { toast.error(e); } };
  const del = async (s) => {
    if (!window.confirm(`Delete “${s.title}”? Songs with plays or provenance are hidden instead, so history stays intact.`)) return;
    try { const r = await api.admin.deleteSong(s.id); toast.info(r.message); list.reload(); } catch (e) { toast.error(e); }
  };
  const doMerge = async (e) => {
    e.preventDefault();
    if (!window.confirm(`Merge song ${merge.duplicateSongId} into ${merge.canonicalSongId}? Plays, ratings, likes, playlists and provenance move to the canonical song.`)) return;
    try { await api.admin.merge({ duplicateSongId: Number(merge.duplicateSongId), canonicalSongId: Number(merge.canonicalSongId) }); toast.success('Merged (sp_merge_songs, one transaction)'); list.reload(); } catch (e2) { toast.error(e2); }
  };

  return (
    <div className="stack" style={{ '--gap': '16px' }}>
      <div className="row wrap between">
        <div className="row wrap">
          <input className="input" style={{ width: 260 }} placeholder="Search title or artist" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          <select className="select" style={{ width: 190 }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option><option>ACTIVE</option><option>PENDING_ANALYSIS</option><option>HIDDEN</option><option>MERGED</option>
          </select>
        </div>
        <button className="btn primary" onClick={() => setAdding(true)} disabled={!refs.data}><Plus />Add song</button>
      </div>
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.loading && !list.data && <ListSkeleton />}
      {list.data && (
        <>
          <div className="table-wrap"><table className="data">
            <thead><tr><th>#</th><th>Song</th><th>Language · genre</th><th>Moods (active model)</th><th>Plays</th><th>Status</th><th /></tr></thead>
            <tbody>{list.data.songs.map((s) => (
              <tr key={s.id}>
                <td className="num muted">{s.id}</td>
                <td><strong>{s.title}</strong><div className="tiny muted">{s.artist.name} · {duration(s.durationSec)}{s.isrc ? ` · ${s.isrc}` : ''}</div></td>
                <td>{s.language.name}<div className="tiny muted">{s.genre ? s.genre.name : '—'}</div></td>
                <td className="small">{s.moods.join(', ') || <span className="muted">—</span>}</td>
                <td className="num">{s.plays}</td>
                <td><span className={`status ${s.status}`}>{s.status}</span></td>
                <td><div className="row" style={{ '--gap': '4px' }}>
                  <button className="btn sm ghost" onClick={() => openEdit(s.id)}>Edit</button>
                  <button className="btn sm ghost" onClick={() => openMoods(s.id)}>Moods</button>
                  <button className="btn sm ghost danger" onClick={() => del(s)}>Delete</button>
                </div></td>
              </tr>
            ))}</tbody></table></div>
          <div className="row between small"><span className="muted">{list.data.total} songs</span>
            <div className="row"><button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button className="btn sm" disabled={page * 20 >= list.data.total} onClick={() => setPage(page + 1)}>Next</button></div></div>
        </>
      )}
      {can('catalog.merge') && (
        <form className="card row wrap" onSubmit={doMerge}>
          <strong>Merge duplicate songs</strong>
          <input className="input" style={{ width: 150 }} type="number" placeholder="Duplicate ID" value={merge.duplicateSongId} onChange={(e) => setMerge({ ...merge, duplicateSongId: e.target.value })} />
          <span className="muted">into</span>
          <input className="input" style={{ width: 150 }} type="number" placeholder="Canonical ID" value={merge.canonicalSongId} onChange={(e) => setMerge({ ...merge, canonicalSongId: e.target.value })} />
          <button className="btn sm" disabled={!merge.duplicateSongId || !merge.canonicalSongId}>Merge</button>
        </form>
      )}
      {adding && refs.data && <SongForm refs={refs.data} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); list.reload(); }} />}
      {editing && refs.data && <SongForm refs={refs.data} initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); }} />}
      {moods && refs.data && (
        <Modal title={`Moods of “${moods.title}”`} onClose={() => { setMoods(null); list.reload(); }} width={620}>
          <MoodEditor song={moods} refs={refs.data} onChange={setMoods} />
        </Modal>
      )}
    </div>
  );
}

export function ContentAdmin() {
  const toast = useToast();
  const refs = useApi(() => api.admin.references(), []);
  const [artist, setArtist] = useState({ name: '', disambiguation: '', type: 'SOLO', regionCode: '', languageId: '', formedYear: '', aliases: '' });
  const [album, setAlbum] = useState({ title: '', albumType: 'ALBUM', releaseYear: new Date().getFullYear(), languageId: '', coverColor1: '#181818', coverColor2: '#A78BFA', artistId: '' });
  const [mood, setMood] = useState({ name: '', emoji: '🙂', colorHex: '#7CC6B5', description: '', categoryId: 2, energy: 0.4, valence: 0.6, danceability: 0.4, acousticness: 0.5, instrumentalness: 0.3, tempoMin: 70, tempoMax: 110 });
  const [kw, setKw] = useState({ phrase: '', moodId: '', weight: 0.9 });
  const [errs, setErrs] = useState({});
  const run = async (key, fn, msg) => {
    setErrs((e) => ({ ...e, [key]: null }));
    try { const r = await fn(); toast.success(msg(r)); refs.reload(); return r; } catch (e) { setErrs((x) => ({ ...x, [key]: e })); toast.error(e); return null; }
  };
  if (!refs.data) return refs.error ? <ErrorState error={refs.error} onRetry={refs.reload} /> : <ListSkeleton />;
  const R = refs.data;
  const E = (k, f) => fieldErr(errs[k], f);
  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <form className="panel stack" onSubmit={(e) => { e.preventDefault(); run('artist', () => api.admin.createArtist({ ...artist, regionCode: artist.regionCode || undefined, languageId: artist.languageId ? Number(artist.languageId) : undefined, formedYear: artist.formedYear ? Number(artist.formedYear) : undefined, aliases: artist.aliases.split(',').map((x) => x.trim()).filter(Boolean) }), (r) => `Artist “${r.name}” added`); }}>
        <h3>Add artist</h3>
        <Field label="Name" error={E('artist', 'name')}><input className="input" value={artist.name} onChange={(e) => setArtist({ ...artist, name: e.target.value })} /></Field>
        <Field label="Disambiguation" hint="Only needed when another artist has the same name"><input className="input" value={artist.disambiguation} onChange={(e) => setArtist({ ...artist, disambiguation: e.target.value })} /></Field>
        <div className="grid-2">
          <Field label="Type"><select className="select" value={artist.type} onChange={(e) => setArtist({ ...artist, type: e.target.value })}><option>SOLO</option><option>GROUP</option><option>COMPOSER</option><option>ORCHESTRA</option></select></Field>
          <Field label="Formed / debut year" error={E('artist', 'formedYear')}><input className="input" type="number" value={artist.formedYear} onChange={(e) => setArtist({ ...artist, formedYear: e.target.value })} /></Field>
          <Field label="Region"><select className="select" value={artist.regionCode} onChange={(e) => setArtist({ ...artist, regionCode: e.target.value })}><option value="">—</option>{R.regions.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}</select></Field>
          <Field label="Main language"><select className="select" value={artist.languageId} onChange={(e) => setArtist({ ...artist, languageId: e.target.value })}><option value="">—</option>{R.languages.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
        </div>
        <Field label="Other spellings (comma-separated)" hint="Used by search and duplicate detection"><input className="input" value={artist.aliases} onChange={(e) => setArtist({ ...artist, aliases: e.target.value })} /></Field>
        <button className="btn primary" disabled={!artist.name.trim()}>Add artist</button>
      </form>

      <form className="panel stack" onSubmit={(e) => { e.preventDefault(); run('album', () => api.admin.createAlbum({ ...album, languageId: album.languageId ? Number(album.languageId) : undefined, artistIds: album.artistId ? [Number(album.artistId)] : [] }), (r) => `Album “${r.title}” added`); }}>
        <h3>Add album</h3>
        <Field label="Title" error={E('album', 'title')}><input className="input" value={album.title} onChange={(e) => setAlbum({ ...album, title: e.target.value })} /></Field>
        <div className="grid-2">
          <Field label="Artist" error={E('album', 'artistIds')}><select className="select" value={album.artistId} onChange={(e) => setAlbum({ ...album, artistId: e.target.value })}><option value="">Choose…</option>{R.artists.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          <Field label="Type"><select className="select" value={album.albumType} onChange={(e) => setAlbum({ ...album, albumType: e.target.value })}><option>ALBUM</option><option>EP</option><option>SINGLE</option><option>COMPILATION</option></select></Field>
          <Field label="Year" error={E('album', 'releaseYear')}><input className="input" type="number" value={album.releaseYear} onChange={(e) => setAlbum({ ...album, releaseYear: Number(e.target.value) })} /></Field>
          <Field label="Language"><select className="select" value={album.languageId} onChange={(e) => setAlbum({ ...album, languageId: e.target.value })}><option value="">—</option>{R.languages.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
          <Field label="Cover colour 1" error={E('album', 'coverColor1')}><input className="input" type="color" value={album.coverColor1} onChange={(e) => setAlbum({ ...album, coverColor1: e.target.value.toUpperCase() })} /></Field>
          <Field label="Cover colour 2" error={E('album', 'coverColor2')}><input className="input" type="color" value={album.coverColor2} onChange={(e) => setAlbum({ ...album, coverColor2: e.target.value.toUpperCase() })} /></Field>
        </div>
        <button className="btn primary" disabled={!album.title.trim() || !album.artistId}>Add album</button>
      </form>

      <form className="panel stack" onSubmit={(e) => { e.preventDefault(); run('mood', () => api.admin.createMood({ ...mood, categoryId: Number(mood.categoryId), reanalyze: true }), (r) => `Mood “${r.name}” created; ${r.songsTagged} songs tagged by the active model`); }}>
        <h3>Create mood</h3>
        <div className="grid-3">
          <Field label="Name" error={E('mood', 'name')}><input className="input" value={mood.name} onChange={(e) => setMood({ ...mood, name: e.target.value })} /></Field>
          <Field label="Emoji"><input className="input" value={mood.emoji} onChange={(e) => setMood({ ...mood, emoji: e.target.value })} /></Field>
          <Field label="Colour"><input className="input" type="color" value={mood.colorHex} onChange={(e) => setMood({ ...mood, colorHex: e.target.value.toUpperCase() })} /></Field>
        </div>
        <Field label="Description" error={E('mood', 'description')}><input className="input" value={mood.description} onChange={(e) => setMood({ ...mood, description: e.target.value })} /></Field>
        <Field label="Quadrant"><select className="select" value={mood.categoryId} onChange={(e) => setMood({ ...mood, categoryId: e.target.value })}>{R.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <div className="grid-3">
          {['energy', 'valence', 'danceability', 'acousticness', 'instrumentalness'].map((k) => (
            <Field key={k} label={`Target ${k}`}><input className="input" type="number" min="0" max="1" step="0.05" value={mood[k]} onChange={(e) => setMood({ ...mood, [k]: Number(e.target.value) })} /></Field>
          ))}
          <Field label="Tempo min"><input className="input" type="number" value={mood.tempoMin} onChange={(e) => setMood({ ...mood, tempoMin: Number(e.target.value) })} /></Field>
          <Field label="Tempo max" error={errs.mood && errs.mood.code === 'CONSTRAINT_VIOLATION' ? errs.mood.message : null}><input className="input" type="number" value={mood.tempoMax} onChange={(e) => setMood({ ...mood, tempoMax: Number(e.target.value) })} /></Field>
        </div>
        <p className="tiny muted">After saving, the active mood model re-scores every song so the new mood is immediately usable.</p>
        <button className="btn primary" disabled={!mood.name.trim() || mood.description.length < 4}>Create mood</button>
      </form>

      <form className="panel stack" onSubmit={(e) => { e.preventDefault(); run('kw', () => api.admin.addKeyword({ phrase: kw.phrase.trim(), moodId: Number(kw.moodId), weight: kw.weight }), (r) => `“${r.phrase}” now maps to that mood`); }}>
        <h3>Teach the mood parser a phrase</h3>
        <p className="small soft">The “describe how you feel” box is driven by this vocabulary table, not by code.</p>
        <Field label="Phrase" error={E('kw', 'phrase')}><input className="input" value={kw.phrase} onChange={(e) => setKw({ ...kw, phrase: e.target.value })} placeholder="e.g. long drive home" /></Field>
        <div className="grid-2">
          <Field label="Mood"><select className="select" value={kw.moodId} onChange={(e) => setKw({ ...kw, moodId: e.target.value })}><option value="">Choose…</option>{R.moods.map((m) => <option key={m.id} value={m.id}>{m.emoji} {m.name}</option>)}</select></Field>
          <Field label="Weight (0–1)"><input className="input" type="number" min="0.05" max="1" step="0.05" value={kw.weight} onChange={(e) => setKw({ ...kw, weight: Number(e.target.value) })} /></Field>
        </div>
        <button className="btn primary" disabled={kw.phrase.trim().length < 2 || !kw.moodId}>Add phrase</button>
      </form>
    </div>
  );
}

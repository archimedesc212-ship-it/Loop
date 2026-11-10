import { Link, useParams } from 'react-router-dom';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import { usePlayer, isPlayable } from '../hooks/usePlayer';
import { Cover } from '../components/Art';
import { TrackList, LikeButton, Stars, AddToPlaylist, PlaybackBadge, colorOf } from '../components/Songs';
import { ErrorState, Skeleton, Meter, MoodChip, Stat, Empty } from '../components/ui';
import { Play, Pause, Film } from '../components/Icons';
import { duration, dateTime, n } from '../lib/format';
import MoodRatings from '../components/MoodRatings';
import { useAuth } from '../hooks/useAuth';

function Loading() {
  return <div className="page row" style={{ '--gap': '24px', alignItems: 'flex-start' }}><Skeleton h={220} w={220} r={18} /><div className="grow stack"><Skeleton h={40} w="60%" /><Skeleton h={18} w="40%" /></div></div>;
}

export function SongPage() {
  const { id } = useParams();
  const { data: s, error, loading, reload } = useApi(() => api.song(id), [id]);
  const player = usePlayer();
  const { user } = useAuth();
  if (loading) return <Loading />;
  if (error) return <div className="page"><ErrorState error={error} onRetry={reload} /></div>;
  if (!s) return <div className="page"><Empty title="Song not found">This song is not available in the current catalogue.</Empty></div>;
  const credits = Array.isArray(s.credits) ? s.credits : [];
  const genres = Array.isArray(s.genres) ? s.genres : [];
  const moodsDetailed = Array.isArray(s.moodsDetailed) ? s.moodsDetailed : [];
  const segments = Array.isArray(s.segments) ? s.segments : [];
  const analyses = Array.isArray(s.analyses) ? s.analyses : [];
  const provenance = Array.isArray(s.provenance) ? s.provenance : [];
  const mergedDuplicates = Array.isArray(s.mergedDuplicates) ? s.mergedDuplicates : [];
  const playing = player.isPlaying(s.id);
  const f = s.features;
  return (
    <div className="page stack" style={{ '--gap': '28px' }}>
      <div className="row wrap" style={{ '--gap': '28px', alignItems: 'flex-end' }}>
        <Cover colors={s.cover} seed={s.album ? s.album.id * 31 + s.id : s.id} size={220} className="" />
        <div className="stack grow" style={{ '--gap': '10px', minWidth: 260 }}>
          <div className="soft small">Archive record · {s.releaseYear}</div>
          <h1 className="display">{s.title}{s.version ? <span className="soft"> ({s.version})</span> : null}</h1>
          <div className="soft"><Link className="link" to={`/artist/${s.artist.id}`}>{s.artist.name}</Link>
            {credits.filter((c) => c.role === 'FEATURED').map((c) => <span key={c.id}> feat. <Link className="link" to={`/artist/${c.id}`}>{c.name}</Link></span>)}
            {' · '}{s.language?.id ? <Link className="link" to={`/language/${s.language.id}`}>{s.language.name}</Link> : 'Language unknown'} · {genres.map((g) => g.name).join(', ')} · {duration(s.durationSec)}</div>
          <div className="row wrap" style={{ '--gap': '6px' }}>{moodsDetailed.map((m) => <MoodChip key={m.id} name={m.name} emoji={m.emoji} color={m.color} weight={m.confidence} />)}</div>
          <div className="row wrap">
            {isPlayable(s)
              ? <button className="btn primary" onClick={() => (player.isCurrent(s.id) ? player.toggle() : player.play(s, { origin: 'LIBRARY' }))}>{playing ? <Pause /> : <Play />}{playing ? 'Pause' : 'Play'}</button>
              : <button className="btn primary" disabled title="No permitted audio source is available for this song">Not playable</button>}
            <PlaybackBadge song={s} verbose />
            <Link className="btn" to={`/mix/similar/${s.id}`}>Similar sound</Link>
            {s.recordingSearchUrl && <a className="btn" href={s.recordingSearchUrl} target="_blank" rel="noreferrer">Find recording</a>}
            <LikeButton song={s} /><AddToPlaylist song={s} />
            <Stars song={s} />
          </div>
        </div>
      </div>

      {s.stats && (
        <div className="grid-4">
          <Stat label="Plays on LOOP" value={n(s.stats.plays)} foot={`${n(s.stats.listeners)} listeners`} />
          <Stat label="Completion" value={s.stats.plays ? `${Math.round((s.stats.completes / s.stats.plays) * 100)}%` : '–'} foot={`${n(s.stats.skips)} skips · ${n(s.stats.replays)} replays`} />
          <Stat label="Average rating" value={s.stats.avgRating ? `${s.stats.avgRating}★` : '–'} foot={`${n(s.stats.ratingCount)} ratings`} />
          <Stat label="Likes" value={n(s.stats.likes)} foot={`Popularity ${s.popularity}/100`} />
        </div>
      )}

      <MoodRatings songId={s.id} privateSession={!!user?.incognito} />

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {f && (
          <div className="card stack" style={{ '--gap': '10px' }}>
            <div className="row between"><h3>Dataset audio features</h3><span className="tiny muted">Source metadata</span></div>
            <Meter label="Energy" value={f.energy} /><Meter label="Valence" value={f.valence} /><Meter label="Danceability" value={f.danceability} />
            <Meter label="Acousticness" value={f.acousticness} /><Meter label="Instrumentalness" value={f.instrumentalness} /><Meter label="Loudness index" value={f.loudnessIndex} />
            <p className="tiny muted">The source does not include BPM, musical key or track duration.</p>
          </div>
        )}
        <div className="card stack" style={{ '--gap': '12px' }}>
          <h3>Mood journey inside the song</h3>
          {segments.length ? (
            <>
              <div className="timeline" role="img" aria-label="Mood segments over the song">
                {segments.map((g) => <div key={g.idx} style={{ flex: g.end - g.start, background: g.color }} title={`${duration(g.start)}–${duration(g.end)} ${g.mood}`}>{g.end - g.start > 40 ? g.mood : ''}</div>)}
              </div>
              <div className="stack small" style={{ '--gap': '4px' }}>
                {segments.map((g) => <div key={g.idx} className="row between"><span>{g.emoji} {g.mood}</span><span className="muted num">{duration(g.start)}–{duration(g.end)} · energy {Math.round(g.energy * 100)}</span></div>)}
              </div>
            </>
          ) : <p className="small muted">No segment analysis for this song yet.</p>}
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card stack" style={{ '--gap': '10px' }}>
          <h3>Source record</h3>
          <p className="small soft">Music Dataset: 1950 to 2019 · CC BY 4.0</p>
          <p className="small soft">Topic label: <b>{s.topic}</b></p>
          {Array.isArray(s.topicScores) && s.topicScores.length > 0 && <p className="tiny muted">Other topic signals: {s.topicScores.map((item) => item.topic).join(', ')}</p>}
          <p className="tiny muted">The upload contains metadata and audio features only. It does not contain the original recording, lyrics, BPM, key, duration, language, album or film details.</p>
        </div>
        <div className="card stack" style={{ '--gap': '10px' }}>
          <h3>Where this data came from</h3>
          {provenance.map((p) => (
            <dl key={p.external_id + p.source} className="kv">
              <dt>Source</dt><dd>{p.source_name} <span className="muted">({p.license_name})</span></dd>
              <dt>External ID</dt><dd className="mono">{p.external_id}</dd>
              <dt>Match</dt><dd>{p.match_method ? p.match_method.toLowerCase().replace('_', ' ') : '–'}{p.match_confidence ? ` · ${Math.round(p.match_confidence * 100)}%` : ''}</dd>
              <dt>Rights</dt><dd>{p.rights_status.toLowerCase().replace('_', ' ')}</dd>
              <dt>Quality</dt><dd>{p.quality_score !== null ? `${Math.round(p.quality_score * 100)}%` : '–'}</dd>
              <dt>Verified</dt><dd>{dateTime(p.last_verified_at)}</dd>
            </dl>
          ))}
          {mergedDuplicates.length > 0 && <p className="small soft">Merged duplicates: {mergedDuplicates.map((d) => d.title).join(', ')}</p>}
          <p className="tiny muted">Find recording opens a YouTube search for the artist and title. It does not confirm that a result is the same recording or provide a licensed audio stream.</p>
          {s.videoLinks && s.videoLinks.length > 0 && (
            <div className="stack" style={{ '--gap': '6px' }}>
              <h3>Watch elsewhere</h3>
              {s.videoLinks.map((v) => (
                <a key={v.videoId} className="link small" href={v.url} target="_blank" rel="noopener noreferrer">{v.title || 'Video'} (opens YouTube)</a>
              ))}
              <p className="tiny muted">Links found with the YouTube Data API. LOOP links out and never downloads video or audio.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ArtistPage() {
  const { id } = useParams();
  const { data: a, error, loading, reload } = useApi(() => api.artist(id), [id]);
  const { data: artwork } = useApi(() => api.artistArtwork(id), [id]);
  const player = usePlayer();
  if (loading) return <Loading />;
  if (error) return <div className="page"><ErrorState error={error} onRetry={reload} /></div>;
  const songs = Array.isArray(a?.songs) ? a.songs : [];
  const aliases = Array.isArray(a?.aliases) ? a.aliases : [];
    return (
    <div className="page stack" style={{ '--gap': '24px' }}>
      {(artwork?.banner || artwork?.fanart || artwork?.thumbnail) && (
        <div
          className="artist-artwork-banner"
          role="img"
          aria-label={`${a.name} artist artwork`}
          style={{
            minHeight: 176,
            borderRadius: 18,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'flex-end',
            padding: 22,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundImage: `linear-gradient(90deg, rgba(10,12,18,.82), rgba(10,12,18,.12)), url("${artwork.banner || artwork.fanart || artwork.thumbnail}")`,
          }}
        >
          {artwork.logo && <img src={artwork.logo} alt={`${a.name} logo`} style={{ maxWidth: 'min(360px, 80%)', maxHeight: 90, objectFit: 'contain' }} />}
        </div>
      )}
      <div className="stack" style={{ '--gap': '8px' }}>
        <div className="soft small">{a.type.toLowerCase()} · {[a.language, a.region].filter(Boolean).join(' · ')}{a.formedYear ? ` · since ${a.formedYear}` : ''}</div>
        <h1 className="display">{a.name}</h1>
        {a.bio && <p className="lead">{a.bio}</p>}
        {aliases.length > 0 && <p className="small muted">Also written as {aliases.map((x) => x.alias).join(', ')}</p>}
        <div className="row wrap">
          {songs.some(isPlayable) && <button className="btn primary" onClick={() => player.play(songs.find(isPlayable), { queue: songs, origin: 'LIBRARY' })}><Play />Play</button>}
          <span className="small soft">{songs.length.toLocaleString('en-IN')} matching records in the dataset</span>
        </div>
      </div>
      <TrackList songs={songs} origin="LIBRARY" />
      {artwork?.attribution && <a className="tiny muted" href={artwork.sourceUrl || 'https://www.theaudiodb.com/'} target="_blank" rel="noopener noreferrer">{artwork.attribution}</a>}
    </div>
  );
}

export function AlbumPage() {
  const { id } = useParams();
  const { data: a, error, loading, reload } = useApi(() => api.album(id), [id]);
  const { data: artwork } = useApi(() => api.albumArtwork(id), [id]);
  const player = usePlayer();
  if (loading) return <Loading />;
  if (error) return <div className="page"><ErrorState error={error} onRetry={reload} /></div>;
  if (a?.notAvailable) return <div className="page"><Empty title="Album details are not in this dataset">{a.message}</Empty></div>;
  const songs = Array.isArray(a?.songs) ? a.songs : [];
  const artists = Array.isArray(a?.artists) ? a.artists : [];
  return (
    <div className="page stack" style={{ '--gap': '24px' }}>
      <div className="row wrap" style={{ '--gap': '24px', alignItems: 'flex-end' }}>
        {artwork?.thumbnail
          ? <img src={artwork.thumbnail} alt={`${a.title} album cover`} loading="lazy" style={{ width: 200, height: 200, objectFit: 'cover', borderRadius: 18 }} />
          : <Cover colors={a.cover} seed={a.id * 31 + (songs[0] ? songs[0].id : 0)} size={200} />}
        <div className="stack" style={{ '--gap': '8px' }}>
          <div className="soft small">{a.type.toLowerCase()}{a.film ? <> · soundtrack of <Link className="link" to={`/film/${a.filmId}`}>{a.film}</Link></> : ''} · {a.releaseYear}{a.language ? ` · ${a.language}` : ''}</div>
          <h1 className="display">{a.title}</h1>
          <div className="soft">{artists.map((x, i) => <span key={x.id}>{i ? ', ' : ''}<Link className="link" to={`/artist/${x.id}`}>{x.name}</Link></span>)}</div>
          {songs.some(isPlayable) && <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => player.play(songs.find(isPlayable), { queue: songs, origin: 'LIBRARY' })}><Play />Play album</button>}
        </div>
      </div>
      <TrackList songs={songs.map((s) => ({ ...s, rank: s.trackNumber }))} origin="LIBRARY" />
      {artwork?.attribution && <a className="tiny muted" href={artwork.sourceUrl || 'https://www.theaudiodb.com/'} target="_blank" rel="noopener noreferrer">{artwork.attribution}</a>}
    </div>
  );
}

export function FilmPage() {
  const { id } = useParams();
  const { data: f, error, loading, reload } = useApi(() => api.film(id), [id]);
  const player = usePlayer();
  if (loading) return <Loading />;
  if (error) return <div className="page"><ErrorState error={error} onRetry={reload} /></div>;
  if (f?.notAvailable) return <div className="page"><Empty title="Film details are not in this dataset">{f.message}</Empty></div>;
  const filmSongs = Array.isArray(f?.songs) ? f.songs : [];
  const composers = Array.isArray(f?.composers) ? f.composers : [];
  const albums = Array.isArray(f?.albums) ? f.albums : [];
  const first = filmSongs.find(isPlayable);
  return (
    <div className="page stack" style={{ '--gap': '24px' }}>
      <div className="stack" style={{ '--gap': '8px' }}>
        <div className="soft small row" style={{ '--gap': '6px' }}><Film width={16} height={16} />Film · {f.releaseYear} · <Link className="link" to={`/language/${f.language.id}`}>{f.language.name}</Link></div>
        <h1 className="display">{f.title}</h1>
        {composers.length > 0 && <div className="soft">Music by {composers.map((c, i) => <span key={c.id}>{i ? ', ' : ''}<Link className="link" to={`/artist/${c.id}`}>{c.name}</Link></span>)}</div>}
        {f.external && f.external.overview && <p className="lead" style={{ maxWidth: 720 }}>{f.external.overview}</p>}
        <div className="row wrap">
          {first && <button className="btn primary" onClick={() => player.play(first, { queue: filmSongs, origin: 'LIBRARY' })}><Play />Play soundtrack</button>}
          <span className="small soft">{filmSongs.length} song{filmSongs.length === 1 ? '' : 's'} on LOOP</span>
        </div>
        {f.external && <p className="tiny muted">Film details from <a className="link" href={f.external.url} target="_blank" rel="noopener noreferrer">TMDB</a>. {f.external.attribution}</p>}
      </div>
      {albums.length > 0 && (
        <section>
          <div className="section-head"><h2 className="section-title">Soundtrack albums</h2></div>
          <div className="row wrap">
            {albums.map((al) => (
              <Link key={al.id} to={`/album/${al.id}`} className="card row" style={{ '--gap': '12px', padding: 12 }}>
                <Cover colors={[al.c1, al.c2]} seed={al.id * 31} size={56} />
                <div><div style={{ fontWeight: 600 }}>{al.title}</div><div className="tiny muted">{al.type.toLowerCase()} · {al.releaseYear}</div></div>
              </Link>
            ))}
          </div>
        </section>
      )}
      {filmSongs.length ? <TrackList songs={filmSongs.map((s) => ({ ...s, rank: s.trackNumber }))} origin="LIBRARY" />
        : <Empty title="No songs from this film yet">When songs from this soundtrack are added to the catalogue they appear here.</Empty>}
    </div>
  );
}

export function LanguagePage() {
  const { id } = useParams();
  const { data: l, error, loading, reload } = useApi(() => api.language(id), [id]);
  const player = usePlayer();
  if (loading) return <Loading />;
  if (error) return <div className="page"><ErrorState error={error} onRetry={reload} /></div>;
  if (l?.notAvailable) return <div className="page"><Empty title="Language data is not available">{l.message}</Empty></div>;
  const languageSongs = Array.isArray(l?.songs) ? l.songs : [];
  const artists = Array.isArray(l?.artists) ? l.artists : [];
  const films = Array.isArray(l?.films) ? l.films : [];
  const regions = Array.isArray(l?.regions) ? l.regions : [];
  const first = languageSongs.find(isPlayable);
  return (
    <div className="page stack" style={{ '--gap': '24px' }}>
      <div className="stack" style={{ '--gap': '8px' }}>
        <div className="soft small">Language · {l.script} script{regions.length ? ` · spoken in ${regions.map((r) => r.name).join(', ')}` : ''}</div>
        <h1 className="display">{l.name} <span className="soft" lang={l.iso}>{l.nativeName}</span></h1>
        <div className="row wrap">
          {first && <button className="btn primary" onClick={() => player.play(first, { queue: languageSongs, origin: 'LIBRARY' })}><Play />Play popular {l.name}</button>}
          <Link className="btn" to={`/mix/regional/${l.id}`}>Regional mix for you</Link>
          <span className="small soft">{n(l.totalSongs)} songs</span>
        </div>
      </div>
      {artists.length > 0 && (
        <section>
          <div className="section-head"><h2 className="section-title">Artists</h2></div>
          <div className="row wrap" style={{ '--gap': '8px' }}>
            {artists.map((a) => <Link key={a.id} className="chip" to={`/artist/${a.id}`}>{a.name}<span className="muted"> · {a.type.toLowerCase()}</span></Link>)}
          </div>
        </section>
      )}
      {films.length > 0 && (
        <section>
          <div className="section-head"><h2 className="section-title">Films</h2></div>
          <div className="row wrap" style={{ '--gap': '8px' }}>
            {films.map((f) => <Link key={f.id} className="chip" to={`/film/${f.id}`}><Film width={14} height={14} /> {f.title} <span className="muted">{f.releaseYear}</span></Link>)}
          </div>
        </section>
      )}
      <section>
        <div className="section-head"><h2 className="section-title">Popular in {l.name}</h2></div>
        {languageSongs.length ? <TrackList songs={languageSongs} origin="LIBRARY" /> : <Empty title={`No ${l.name} songs yet`}>Songs in this language will appear here once they are in the catalogue.</Empty>}
      </section>
    </div>
  );
}

export { colorOf };

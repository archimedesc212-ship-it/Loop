import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import { usePlayer } from '../hooks/usePlayer';
import { TrackList } from '../components/Songs';
import { Cover } from '../components/Art';
import { ErrorState, ListSkeleton, Empty, MoodChip } from '../components/ui';
import * as Icon from '../components/Icons';

function formatVideoDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Duration unavailable';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : `${minutes}:${String(secs).padStart(2, '0')}`;
}

function YouTubeSearchResult({ video, song, queue }) {
  const player = usePlayer();
  const current = player.isCurrent(song.id);
  const playing = player.isPlaying(song.id);
  const start = () => current ? player.toggle() : player.play(song, { queue, origin: 'WORLD' });
  return (
    <article className={`world-track${current ? ' playing' : ''}`}>
      {video.thumbnailUrl ? <img className="world-artwork" src={video.thumbnailUrl} alt="" loading="lazy" /> : <Cover colors={['#302b63', '#24243e']} seed={video.externalId.length} size={54} />}
      <div className="world-track-copy"><strong title={video.title}>{video.title}</strong><span>{video.channel || 'YouTube'}</span><small>{formatVideoDuration(video.durationSec)} · Official YouTube player · <a href={video.sourceUrl} target="_blank" rel="noreferrer">Open video</a></small></div>
      <button className="world-play" onClick={start} aria-label={`${playing ? 'Pause' : 'Play'} ${video.title}`}>{playing ? <Icon.Pause /> : <Icon.Play />}</button>
    </article>
  );
}

export default function Search() {
  const [params] = useSearchParams();
  const q = (params.get('q') || '').trim();
  const { data, error, loading, reload } = useApi(() => (q.length >= 2 ? api.search(q) : Promise.resolve(null)), [q]);
  const [youtubeVideos, setYoutubeVideos] = useState([]);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [youtubeError, setYoutubeError] = useState('');
  const [longerVideosOnly, setLongerVideosOnly] = useState(false);
  const visibleYoutubeVideos = longerVideosOnly
    ? youtubeVideos.filter((video) => Number(video.durationSec) >= 120)
    : youtubeVideos;
  const [mbRecordings, setMbRecordings] = useState([]);
  const [mbLoading, setMbLoading] = useState(false);
  const [mbError, setMbError] = useState('');

  useEffect(() => {
    if (q.length < 2) { setYoutubeVideos([]); setMbRecordings([]); return undefined; }
    let cancelled = false;
    setYoutubeLoading(true); setYoutubeError('');
    api.youtubeSearch(q, 12)
      .then((result) => { if (!cancelled) setYoutubeVideos(result.videos || []); })
      .catch((error) => { if (!cancelled) setYoutubeError(error?.message || 'YouTube search is unavailable.'); })
      .finally(() => { if (!cancelled) setYoutubeLoading(false); });
    setMbLoading(true); setMbError('');
    api.musicbrainzSearch(q, 8)
      .then((result) => { if (!cancelled) setMbRecordings(result.recordings || []); })
      .catch((error) => { if (!cancelled) setMbError(error?.message || 'MusicBrainz search is unavailable.'); })
      .finally(() => { if (!cancelled) setMbLoading(false); });
    return () => { cancelled = true; };
  }, [q]);


  if (q.length < 2) {
    return (
      <div className="page stack" style={{ maxWidth: 900 }}>
        <h1 className="display">Search music worldwide</h1>
        <p className="lead">Search LOOP's catalogue, YouTube music videos and MusicBrainz by song, artist or album.</p>
        <div className="world-discovery-grid">
          {[
            ['Global pop', 'global pop'], ['Bollywood', 'Bollywood hits'], ['K-pop', 'K-pop'], ['Afrobeats', 'Afrobeats'],
            ['Latin', 'Latin pop'], ['Arabic music', 'Arabic pop'], ['Japanese music', 'Japanese pop'], ['Rock classics', 'classic rock'],
          ].map(([label, query]) => <Link key={label} className="world-discovery-tile" to={`/search?q=${encodeURIComponent(query)}`}>{label}<Icon.Arrow /></Link>)}
        </div>
        <div className="small muted">Full-length playback is provided by embeddable YouTube videos.</div>
      </div>
    );
  }
  return (
    <div className="page stack" style={{ '--gap': '26px' }}>
      <div>
        <div className="soft small">Search results</div>
        <h1 className="display">“{q}”</h1>
        <p className="small muted" style={{ marginTop: 6 }}>Searching LOOP, YouTube and MusicBrainz. YouTube videos play through the official embedded player.</p>
      </div>

      <section>
        <div className="section-head">
          <div><h2 className="section-title">YouTube music videos</h2><p className="tiny muted">Actual uploaded video durations · official YouTube player stays inside LOOP. Longer videos may contain the full track; check the source video.</p></div>
          <button type="button" className={`btn sm${longerVideosOnly ? ' primary' : ' ghost'}`} aria-pressed={longerVideosOnly} onClick={() => setLongerVideosOnly((value) => !value)}> {longerVideosOnly ? 'Showing 2+ min' : 'Filter 2+ min'} </button>
        </div>
        {youtubeLoading && <div className="small muted">Searching YouTube…</div>}
        {youtubeError && <div className="small muted">{youtubeError} Check YOUTUBE_ENABLED and the backend API key.</div>}
        {visibleYoutubeVideos.length > 0 && <div className="world-track-list">{visibleYoutubeVideos.map((video) => {
          const queue = visibleYoutubeVideos.map((item) => ({
            id: `yt-${item.externalId}`, title: item.title, artist: { name: item.channel || 'YouTube' },
            album: { title: 'YouTube video' }, durationSec: item.durationSec || 0, artworkUrl: item.thumbnailUrl,
            cover: ['#302b63', '#24243e'], playback: { playable: true, type: 'YOUTUBE_EMBED' },
            youtube: { embedUrl: item.embedUrl, watchUrl: item.sourceUrl },
          }));
          const song = queue.find((item) => item.id === `yt-${video.externalId}`);
          return <YouTubeSearchResult key={video.externalId} video={video} song={song} queue={queue} />;
        })}</div>}
        {!youtubeLoading && !youtubeError && youtubeVideos.length === 0 && <div className="small muted">No embeddable YouTube videos found.</div>}
        {!youtubeLoading && !youtubeError && youtubeVideos.length > 0 && visibleYoutubeVideos.length === 0 && <div className="small muted">No videos of two minutes or longer matched. Turn off the filter to see all results.</div>}
      </section>

      <section>
        <div className="section-head"><div><h2 className="section-title">MusicBrainz recordings</h2><p className="tiny muted">Recording metadata and Cover Art Archive artwork, when a release cover exists</p></div></div>
        {mbLoading && <div className="small muted">Searching MusicBrainz and Cover Art Archive…</div>}
        {mbError && <div className="small muted">{mbError} Check MUSICBRAINZ_ENABLED and MUSICBRAINZ_USER_AGENT.</div>}
        {mbRecordings.length > 0 && <div className="world-track-list">{mbRecordings.map((recording) => (
          <article className="world-track" key={recording.recordingMbid}>
            {recording.artworkUrl ? <img className="world-artwork" src={recording.artworkUrl} alt="" loading="lazy" /> : <Cover colors={['#38434f', '#1f2937']} seed={recording.release_year || 1} size={54} />}
            <div className="world-track-copy"><strong>{recording.title}</strong><span>{recording.artist || 'Unknown artist'} · {recording.album || 'Release not listed'}</span><small>{recording.release_year || 'Year unknown'}{recording.isrc ? ` · ISRC ${recording.isrc}` : ''}{recording.artworkUrl ? ' · Cover art' : ' · No cover art listed'}</small></div>
          </article>
        ))}</div>}
        {!mbLoading && !mbError && mbRecordings.length === 0 && <div className="small muted">No MusicBrainz recordings found.</div>}
      </section>

      <section>
        <div className="section-head"><div><h2 className="section-title">LOOP catalogue</h2><p className="tiny muted">Your curated 28,372-track recommendation dataset</p></div></div>
        {loading && !data && <ListSkeleton n={6} />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {data && data.total === 0 && <Empty title="No LOOP matches">Try an artist name, track title, genre or mood.</Empty>}
        {data && (data.moods.length > 0 || data.genres.length > 0 || data.languages.length > 0) && (
          <div className="row wrap" style={{ '--gap': '8px', marginBottom: 16 }}>
            {data.moods.map((m) => <Link key={`m${m.id}`} to="/mood" state={{ moodIds: [m.id] }}><MoodChip name={m.name} emoji={m.emoji} color={m.color} /></Link>)}
            {data.genres.map((g) => <span key={`g${g.id}`} className="chip"><i style={{ width: 8, height: 8, borderRadius: 2, background: g.color }} />{g.name}</span>)}
            {data.languages.map((l) => <Link key={`l${l.id}`} className="chip accent" to={`/language/${l.id}`}>{l.name} · {l.nativeName}</Link>)}
          </div>
        )}
        {data && data.artists.length > 0 && <div className="grid-4" style={{ marginBottom: 18 }}>{data.artists.map((a) => (
          <Link key={a.id} to={`/artist/${a.id}`} className="card stack" style={{ '--gap': '4px' }}><strong>{a.name}</strong><span className="small muted">{a.type.toLowerCase()}{a.language ? ` · ${a.language}` : ''}</span></Link>
        ))}</div>}
        {data && data.songs.length > 0 && <TrackList songs={data.songs} origin="SEARCH" />}
        {data && data.albums.length > 0 && <div className="grid-4" style={{ marginTop: 18 }}>{data.albums.map((a) => (
          <Link key={a.id} to={`/album/${a.id}`} className="card row" style={{ '--gap': '12px' }}><Cover colors={[a.c1, a.c2]} seed={a.id * 31} size={56} /><div style={{ minWidth: 0 }}><strong>{a.title}</strong><div className="small muted">{a.artist} · {a.type.toLowerCase()}</div></div></Link>
        ))}</div>}
      </section>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import { usePlayer } from '../hooks/usePlayer';
import { TrackList } from '../components/Songs';
import { Cover } from '../components/Art';
import { ErrorState, ListSkeleton, Empty, MoodChip } from '../components/ui';
import * as Icon from '../components/Icons';
import { searchOpenverseAudio } from '../lib/openverse';
import { spotifySearchUrl } from '../lib/spotifyLinks';
import { searchYouTubeBrowser } from '../lib/youtubeBrowser';

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

function JamendoSearchResult({ track, song, queue }) {
  const player = usePlayer();
  const current = player.isCurrent(song.id);
  const playing = player.isPlaying(song.id);
  const start = () => current ? player.toggle() : player.play(song, { queue, origin: 'SEARCH' });
  return (
    <article className={`world-track${current ? ' playing' : ''}`}>
      {track.artworkUrl ? <img className="world-artwork" src={track.artworkUrl} alt="" loading="lazy" /> : <Cover colors={['#47316d', '#24243e']} seed={Number(track.id) || 1} size={54} />}
      <div className="world-track-copy"><strong title={track.title}>{track.title}</strong><span>{track.artist}{track.album ? ` · ${track.album}` : ''}</span><small>{formatVideoDuration(track.durationSec)} · Jamendo · <a href={track.trackUrl || 'https://www.jamendo.com/'} target="_blank" rel="noreferrer">Track</a>{track.licenseUrl ? <> · <a href={track.licenseUrl} target="_blank" rel="noreferrer">Licence</a></> : ''}</small></div>
      <button className="world-play" onClick={start} aria-label={`${playing ? 'Pause' : 'Play'} ${track.title}`}>{playing ? <Icon.Pause /> : <Icon.Play />}</button>
    </article>
  );
}

function OpenverseSearchResult({ track, song, queue }) {
  const player = usePlayer();
  const current = player.isCurrent(song.id);
  const playing = player.isPlaying(song.id);
  const start = () => current ? player.toggle() : player.play(song, { queue, origin: 'SEARCH' });
  return (
    <article className={`world-track${current ? ' playing' : ''}`}>
      {track.artworkUrl ? <img className="world-artwork" src={track.artworkUrl} alt="" loading="lazy" /> : <Cover colors={['#244e5a', '#192a35']} seed={track.id.length} size={54} />}
      <div className="world-track-copy">
        <strong title={track.title}>{track.title}</strong>
        <span>{track.artist}</span>
        <small>
          {formatVideoDuration(track.durationSec)} · Openverse · {track.licenseLabel}
          {' · '}<a href={track.sourceUrl} target="_blank" rel="noreferrer">Original source</a>
          {' · '}<a href={track.licenseUrl} target="_blank" rel="noreferrer">Licence</a>
          {track.creatorUrl ? <> · <a href={track.creatorUrl} target="_blank" rel="noreferrer">Artist</a></> : null}
        </small>
        <details className="tiny muted">
          <summary>Attribution details</summary>
          <p>{track.attribution}</p>
        </details>
      </div>
      <button className="world-play" onClick={start} aria-label={`${playing ? 'Pause' : 'Play'} ${track.title}`}>{playing ? <Icon.Pause /> : <Icon.Play />}</button>
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
  const [jamendoTracks, setJamendoTracks] = useState([]);
  const [jamendoLoading, setJamendoLoading] = useState(false);
  const [jamendoError, setJamendoError] = useState('');
  const [openverseTracks, setOpenverseTracks] = useState([]);
  const [openverseLoading, setOpenverseLoading] = useState(false);
  const [openverseError, setOpenverseError] = useState('');
  const [mbRecordings, setMbRecordings] = useState([]);
  const [mbLoading, setMbLoading] = useState(false);
  const [mbError, setMbError] = useState('');

  useEffect(() => {
    if (q.length < 2) { setYoutubeVideos([]); setYoutubeLoading(false); setYoutubeError(''); setMbRecordings([]); setMbLoading(false); setMbError(''); setJamendoTracks([]); setJamendoLoading(false); setJamendoError(''); setOpenverseTracks([]); setOpenverseLoading(false); setOpenverseError(''); return undefined; }
    let cancelled = false;
    const openverseController = new AbortController();
    const youtubeController = new AbortController();
    setYoutubeLoading(true); setYoutubeError('');
    api.youtubeSearch(q, 12)
      .then((result) => { if (!cancelled) setYoutubeVideos(result.videos || []); })
      .catch(async (error) => {
        // Static guest deployments may use a browser-referrer-restricted key.
        // This is a public key by design; backend deployments should prefer YOUTUBE_API_KEY.
        try {
          const browserVideos = await searchYouTubeBrowser(q, 12, { signal: youtubeController.signal });
          if (!cancelled && browserVideos.length) { setYoutubeVideos(browserVideos); return; }
        } catch (fallbackError) {
          if (fallbackError?.name === 'AbortError') return;
        }
        if (!cancelled) setYoutubeError(error?.message || 'YouTube search is unavailable.');
      })
      .finally(() => { if (!cancelled) setYoutubeLoading(false); });
    setJamendoLoading(true); setJamendoError('');
    api.jamendoSearch(q, 12)
      .then((result) => { if (!cancelled) setJamendoTracks(result.tracks || []); })
      .catch((error) => { if (!cancelled) setJamendoError(error?.message || 'Jamendo search is unavailable.'); })
      .finally(() => { if (!cancelled) setJamendoLoading(false); });
    setOpenverseLoading(true); setOpenverseError('');
    searchOpenverseAudio(q, 8, { signal: openverseController.signal })
      .then((tracks) => { if (!cancelled) setOpenverseTracks(tracks); })
      .catch((error) => { if (!cancelled && error?.name !== 'AbortError') setOpenverseError(error?.message || 'Openverse search is unavailable.'); })
      .finally(() => { if (!cancelled) setOpenverseLoading(false); });
    setMbLoading(true); setMbError('');
    api.musicbrainzSearch(q, 8)
      .then((result) => { if (!cancelled) setMbRecordings(result.recordings || []); })
      .catch((error) => { if (!cancelled) setMbError(error?.message || 'MusicBrainz search is unavailable.'); })
      .finally(() => { if (!cancelled) setMbLoading(false); });
    return () => { cancelled = true; openverseController.abort(); youtubeController.abort(); };
  }, [q]);


  if (q.length < 2) {
    return (
      <div className="page stack" style={{ maxWidth: 900 }}>
        <h1 className="display">Search music worldwide</h1>
        <p className="lead">Search LOOP's catalogue, YouTube videos and openly licensed audio by song, artist or album.</p>
        <a className="btn sm ghost" href={spotifySearchUrl('')} target="_blank" rel="noreferrer">Open Spotify</a>
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
        <p className="small muted" style={{ marginTop: 6 }}>Searching LOOP, YouTube, Jamendo, Openverse and MusicBrainz. Spotify opens separately in its official app or website.</p>
        <a className="btn sm ghost" href={spotifySearchUrl(q)} target="_blank" rel="noreferrer">Open “{q}” in Spotify <Icon.Arrow /></a>
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
        <div className="section-head"><div><h2 className="section-title">Jamendo independent music</h2><p className="tiny muted">Non-commercial catalogue streams · artist and licence attribution · streamed directly from Jamendo</p></div></div>
        {jamendoLoading && <div className="small muted">Searching Jamendo…</div>}
        {jamendoError && <div className="small muted">{jamendoError} Check JAMENDO_ENABLED and JAMENDO_CLIENT_ID on the backend.</div>}
        {jamendoTracks.length > 0 && <div className="world-track-list">{jamendoTracks.map((track) => {
          const queue = jamendoTracks.map((item) => ({
            id: `jamendo-${item.id}`, title: item.title, artist: { name: item.artist },
            album: { title: item.album || 'Jamendo single' }, durationSec: item.durationSec || 0,
            artworkUrl: item.artworkUrl, cover: ['#47316d', '#24243e'],
            playback: { playable: true, type: 'JAMENDO_STREAM', source: 'JAMENDO' },
            jamendo: { streamUrl: item.streamUrl, trackUrl: item.trackUrl, licenseUrl: item.licenseUrl, attribution: item.attribution },
          }));
          const song = queue.find((item) => item.id === `jamendo-${track.id}`);
          return <JamendoSearchResult key={track.id} track={track} song={song} queue={queue} />;
        })}</div>}
        {!jamendoLoading && !jamendoError && jamendoTracks.length === 0 && <div className="small muted">No Jamendo tracks found, or the provider is not enabled.</div>}
        <p className="tiny muted">Playback is streamed, not downloaded or cached. Open each track's licence and follow its attribution and reuse conditions.</p>
      </section>


      <section>
        <div className="section-head"><div><h2 className="section-title">Openverse licensed audio</h2><p className="tiny muted">Direct audio from the original source · creator attribution and per-track licence details</p></div></div>
        <p className="small muted" style={{ marginBottom: 12 }}>Made using <a href="https://openverse.org/" target="_blank" rel="noreferrer">Openverse</a>, but not endorsed or certified by Openverse. Check the original source and each track’s licence before use.</p>
        {openverseLoading && <div className="small muted">Searching Openverse audio…</div>}
        {openverseError && <div className="small muted">{openverseError}</div>}
        {openverseTracks.length > 0 && <div className="world-track-list">{openverseTracks.map((track) => {
          const queue = openverseTracks.map((item) => ({
            id: `openverse-${item.id}`, title: item.title, artist: { name: item.artist },
            album: { title: 'Openverse audio' }, durationSec: item.durationSec || 0,
            artworkUrl: item.artworkUrl, cover: ['#244e5a', '#192a35'],
            playback: { playable: true, type: 'OPENVERSE_STREAM', source: 'OPENVERSE' },
            openverse: { streamUrl: item.streamUrl, sourceUrl: item.sourceUrl, creatorUrl: item.creatorUrl,
              licenseUrl: item.licenseUrl, licenseLabel: item.licenseLabel, attribution: item.attribution },
          }));
          const song = queue.find((item) => item.id === `openverse-${track.id}`);
          return <OpenverseSearchResult key={track.id} track={track} song={song} queue={queue} />;
        })}</div>}
        {!openverseLoading && !openverseError && openverseTracks.length === 0 && <div className="small muted">No playable openly licensed music results were found for this search.</div>}
        <p className="tiny muted">Openverse does not verify licence accuracy. LOOP plays the source URL directly and does not download, cache or re-host audio.</p>
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

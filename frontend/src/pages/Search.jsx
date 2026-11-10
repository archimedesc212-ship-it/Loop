import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import { TrackList } from '../components/Songs';
import { Cover } from '../components/Art';
import { ErrorState, ListSkeleton, Empty, MoodChip } from '../components/ui';

export default function Search() {
  const [params] = useSearchParams();
  const q = (params.get('q') || '').trim();
  const { data, error, loading, reload } = useApi(() => (q.length >= 2 ? api.search(q) : Promise.resolve(null)), [q]);
  if (q.length < 2) {
    return (
      <div className="page stack" style={{ maxWidth: 720 }}>
        <h1 className="display">Search</h1>
        <p className="lead">Search the 28,372 track records by title, artist, genre or dataset topic. Try:</p>
        <div className="row wrap" style={{ '--gap': '6px' }}>{['mukesh', 'frankie laine', 'jazz', 'reggae', 'sadness', 'country', 'romantic'].map((s) => <Link key={s} className="chip" to={`/search?q=${s}`}>{s}</Link>)}</div>
      </div>
    );
  }
  return (
    <div className="page stack" style={{ '--gap': '26px' }}>
      <div>
        <div className="soft small">Results for</div>
        <h1 className="display">“{q}”</h1>
        {data && <p className="small muted" style={{ marginTop: 6 }}>{data.total.toLocaleString('en-IN')} matching records · title, artist, genre and topic search (lyrics are not included)</p>}
      </div>
      {loading && <ListSkeleton n={6} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.total === 0 && <Empty title="Nothing matched">Try an artist name, track title, one of the seven genres, or a dataset topic such as sadness, romantic or world/life.</Empty>}
      {data && (data.moods.length > 0 || data.genres.length > 0 || data.languages.length > 0) && (
        <div className="row wrap" style={{ '--gap': '8px' }}>
          {data.moods.map((m) => <Link key={`m${m.id}`} to="/mood" state={{ moodIds: [m.id] }}><MoodChip name={m.name} emoji={m.emoji} color={m.color} /></Link>)}
          {data.genres.map((g) => <span key={`g${g.id}`} className="chip"><i style={{ width: 8, height: 8, borderRadius: 2, background: g.color }} />{g.name}</span>)}
          {data.languages.map((l) => <Link key={`l${l.id}`} className="chip accent" to={`/language/${l.id}`}>{l.name} · {l.nativeName}</Link>)}
        </div>
      )}
      {data && data.artists.length > 0 && (
        <section>
          <div className="section-head"><h2 className="section-title">Artists</h2></div>
          <div className="grid-4">
            {data.artists.map((a) => (
              <Link key={a.id} to={`/artist/${a.id}`} className="card stack" style={{ '--gap': '4px' }}>
                <strong>{a.name}</strong>
                <span className="small muted">{a.type.toLowerCase()}{a.language ? ` · ${a.language}` : ''}</span>
                {a.matchedAlias && <span className="tiny soft">matched “{a.matchedAlias}”</span>}
                {a.soundsLike && <span className="tiny soft">sounds like your search</span>}
              </Link>
            ))}
          </div>
        </section>
      )}
      {data && data.songs.length > 0 && (
        <section>
          <div className="section-head"><h2 className="section-title">Songs</h2></div>
          <TrackList songs={data.songs} origin="SEARCH" />
        </section>
      )}
      {data && data.albums.length > 0 && (
        <section>
          <div className="section-head"><h2 className="section-title">Albums</h2></div>
          <div className="grid-4">
            {data.albums.map((a) => (
              <Link key={a.id} to={`/album/${a.id}`} className="card row" style={{ '--gap': '12px' }}>
                <Cover colors={[a.c1, a.c2]} seed={a.id * 31} size={56} />
                <div style={{ minWidth: 0 }}><strong>{a.title}</strong><div className="small muted">{a.artist} · {a.type.toLowerCase()}</div></div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

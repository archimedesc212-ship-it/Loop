import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { completeSpotifyAuth } from '../lib/spotifyAuth';

export default function SpotifyCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    completeSpotifyAuth().then(() => {
      if (active) navigate('/settings?spotify=connected', { replace: true });
    }).catch((reason) => {
      if (active) setError(reason?.message || 'Spotify connection could not be completed.');
    });
    return () => { active = false; };
  }, [navigate]);
  return (
    <main className="page" style={{ maxWidth: 600, margin: '10vh auto' }}>
      <section className="panel stack">
        <span className="tiny muted">SPOTIFY AUTHORISATION</span>
        <h1>{error ? 'Connection not completed' : 'Connecting Spotify…'}</h1>
        <p className="small soft">{error || 'Completing the secure PKCE sign-in and returning to LOOP Settings.'}</p>
        {error && <Link className="btn primary" to="/settings">Return to Settings</Link>}
      </section>
    </main>
  );
}

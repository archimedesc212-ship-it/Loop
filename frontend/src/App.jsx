import { useEffect } from 'react';
import { applyAccentTheme, getAccentTheme } from './lib/theme';
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import { Thinking } from './components/ui';
import Home from './pages/Home';
import Search from './pages/Search';
import Library, { PlaylistPage } from './pages/Library';
import Settings from './pages/Settings';
import DatabaseExplorer from './pages/DatabaseExplorer';
import SpotifyCallback from './pages/SpotifyCallback';
import AuthPage from './pages/AuthPage';

const Admin = lazy(() => import('./pages/admin/Admin'));

function NotFound() {
  return (
    <div className="page empty" style={{ maxWidth: 520 }}>
      <h3>Nothing plays here</h3>
      <p className="small">That page doesn’t exist. Return to Home or open the database explorer.</p>
      <a className="btn primary sm" href="/">Go home</a>
    </div>
  );
}

export default function App() {
  const { ready } = useAuth();
  useEffect(() => { applyAccentTheme(getAccentTheme().id); }, []);
  if (!ready) return <div style={{ padding: 40 }}><Thinking label="Opening LOOP" /></div>;
  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/signup" element={<Navigate to="/register" replace />} />
      <Route path="/create-account" element={<Navigate to="/register" replace />} />
      <Route path="/spotify/callback" element={<SpotifyCallback />} />
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="search" element={<Search />} />
        <Route path="library" element={<Library />} />
        <Route path="playlist/:id" element={<PlaylistPage />} />
        <Route path="database" element={<DatabaseExplorer />} />
        <Route path="settings" element={<Settings />} />
        <Route path="admin/*" element={<Suspense fallback={<Thinking label="Loading admin" />}><Admin /></Suspense>} />
        <Route path="mood/*" element={<Navigate to="/" replace />} />
        <Route path="mix/*" element={<Navigate to="/" replace />} />
        <Route path="assistant" element={<Navigate to="/search" replace />} />
        <Route path="world" element={<Navigate to="/" replace />} />
        <Route path="private" element={<Navigate to="/settings" replace />} />
        <Route path="artist/*" element={<Navigate to="/" replace />} />
        <Route path="song/*" element={<Navigate to="/search" replace />} />
        <Route path="album/*" element={<Navigate to="/search" replace />} />
        <Route path="film/*" element={<Navigate to="/" replace />} />
        <Route path="language/*" element={<Navigate to="/search" replace />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

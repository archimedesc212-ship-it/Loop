import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import { Thinking } from './components/ui';
import { Login, Register } from './pages/Auth';
import Onboarding from './pages/Onboarding';
import Home from './pages/Home';
import MoodPage from './pages/Mood';
import Mix from './pages/Mix';
import World from './pages/World';
import Search from './pages/Search';
import { SongPage, ArtistPage, AlbumPage, FilmPage, LanguagePage } from './pages/Catalog';
import Library, { PlaylistPage } from './pages/Library';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import PrivateSession from './pages/Private';

const Admin = lazy(() => import('./pages/admin/Admin'));

function RequireAuth({ children }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <div style={{ padding: 40 }}><Thinking label="Loading LOOP" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  return children;
}

function NotFound() {
  return (
    <div className="page empty" style={{ maxWidth: 520 }}>
      <h3>Nothing plays here</h3>
      <p className="small">That page doesn’t exist. Head back home and pick a mood.</p>
      <a className="btn primary sm" href="/">Go home</a>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/signup" element={<Navigate to="/register" replace />} />
      <Route path="/create-account" element={<Navigate to="/register" replace />} />
      <Route path="/onboarding" element={<Navigate to="/welcome" replace />} />
      <Route path="/welcome" element={<RequireAuth><Onboarding /></RequireAuth>} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Home />} />
        <Route path="mood" element={<MoodPage />} />
        <Route path="mix/:kind" element={<Mix />} />
        <Route path="mix/:kind/:arg" element={<Mix />} />
        <Route path="world" element={<World />} />
        <Route path="search" element={<Search />} />
        <Route path="song/:id" element={<SongPage />} />
        <Route path="artist/:id" element={<ArtistPage />} />
        <Route path="album/:id" element={<AlbumPage />} />
        <Route path="film/:id" element={<FilmPage />} />
        <Route path="language/:id" element={<LanguagePage />} />
        <Route path="library" element={<Library />} />
        <Route path="playlist/:id" element={<PlaylistPage />} />
        <Route path="profile" element={<Profile />} />
        <Route path="settings" element={<Settings />} />
        <Route path="private" element={<PrivateSession />} />
        <Route path="admin/*" element={<Suspense fallback={<Thinking label="Loading admin" />}><Admin /></Suspense>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

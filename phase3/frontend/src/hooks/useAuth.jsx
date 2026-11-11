import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler } from '../services/api';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [sessionNote, setSessionNote] = useState(null);

  // The session lives in an httpOnly cookie, so the only way to know whether we
  // are signed in is to ask the server.
  const refresh = useCallback(async () => {
    try {
      let r = await api.session();
      if (!r.authenticated) r = await api.createGuestSession();
      const u = r?.authenticated ? { ...r, incognito: !!r.incognito, permissions: Array.isArray(r.permissions) ? r.permissions : [] } : null;
      setUser(u);
      return u;
    } catch (e) {
      if (e.status === 401) setUser(null);
      else throw e;
      return null;
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler((e) => {
      setUser(null);
      setSessionNote(e.message || 'Your session has ended. Sign in again.');
    });
    refresh().catch((e) => setSessionNote(e.message));
  }, [refresh]);

  const can = useCallback((perm) => !!user && Array.isArray(user.permissions) && user.permissions.includes(perm), [user]);

  const value = useMemo(() => ({ user, ready, refresh, can, setUser, sessionNote }),
    [user, ready, refresh, can, sessionNote]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

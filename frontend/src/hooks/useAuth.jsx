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
      const r = await api.session();
      const u = r.authenticated ? r : null;
      setUser(u);
      return u;
    } catch (e) {
      if (e.status === 401) setUser(null);
      else if (e.code === 'NETWORK' || e.status >= 500) throw e;
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

  const signIn = useCallback(async (login, password) => {
    const r = await api.login(login, password);
    setUser(r.user);
    setSessionNote(null);
    return r.user;
  }, []);

  const register = useCallback(async (body) => {
    const r = await api.register(body);
    setUser(r.user);
    return r.user;
  }, []);

  const signOut = useCallback(async () => {
    try { await api.logout(); } catch { /* session may already be invalid */ }
    setUser(null);
  }, []);

  const can = useCallback((perm) => !!user && user.permissions.includes(perm), [user]);

  const value = useMemo(() => ({ user, ready, refresh, signIn, register, signOut, can, setUser, sessionNote }),
    [user, ready, refresh, signIn, register, signOut, can, sessionNote]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authApi, setSessionExpiredHandler, type User } from '../api/client';

export const SESSION_EXPIRED_MESSAGE = 'Session expired. Please sign in again.';

interface AuthContextValue {
  user: User | null;
  /** True until the initial `/api/auth/me` check has finished. */
  loading: boolean;
  /** True after an authenticated request returned 401; cleared on the next successful login. */
  sessionExpired: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Read the latest values inside the global 401 handler without re-registering it.
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;

  useEffect(() => {
    let cancelled = false;
    authApi
      .me({ anonymousProbe: true })
      .then((current) => {
        if (!cancelled) setUser(current);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // ui-spec §7: clear client state, go to /login, show the banner, and never loop on /login.
    setSessionExpiredHandler(() => {
      setUser(null);
      setSessionExpired(true);
      if (pathnameRef.current !== '/login') {
        navigate('/login', { replace: true });
      }
    });
    return () => setSessionExpiredHandler(null);
  }, [navigate]);

  const login = useCallback(async (email: string, password: string) => {
    const signedIn = await authApi.login(email, password);
    setSessionExpired(false);
    setUser(signedIn);
    return signedIn;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setSessionExpired(false);
    setUser(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  const value = useMemo(
    () => ({ user, loading, sessionExpired, login, logout }),
    [user, loading, sessionExpired, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return context;
}

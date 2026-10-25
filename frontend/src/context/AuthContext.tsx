import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { fetchSession, login as apiLogin, logout as apiLogout } from '../api/auth';
import type { AuthSession, LoginCredentials } from '../api/types';
import { AuthContext } from './auth-context-def';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ username: string } | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshSession = useCallback(async () => {
    try {
      const session = await fetchSession();
      if (session.authenticated && session.csrfToken) {
        setUser({ username: session.username || 'operator' });
        setCsrfToken(session.csrfToken);
        setExpiresAt(session.expiresAt || null);
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setCsrfToken(null);
        setExpiresAt(null);
        setIsAuthenticated(false);
      }
    } catch {
      setUser(null);
      setCsrfToken(null);
      setExpiresAt(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const login = useCallback(async (credentials: LoginCredentials): Promise<AuthSession> => {
    const result = await apiLogin(credentials);
    if (result.authenticated && result.csrfToken) {
      setUser({ username: result.username || credentials.username });
      setCsrfToken(result.csrfToken);
      setExpiresAt(result.expiresAt || null);
      setIsAuthenticated(true);
    }
    return result;
  }, []);

  const logout = useCallback(async () => {
    if (csrfToken) {
      try {
        await apiLogout(csrfToken);
      } catch {
        // Clear state locally regardless of network outcome
      }
    }
    setUser(null);
    setCsrfToken(null);
    setExpiresAt(null);
    setIsAuthenticated(false);
  }, [csrfToken]);

  return (
    <AuthContext.Provider
      value={{
        user,
        csrfToken,
        expiresAt,
        isAuthenticated,
        isLoading,
        login,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

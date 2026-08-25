import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { auth as authApi, getToken, setUnauthorizedHandler } from '../api/client';
import type { User } from '../api/types';

interface AuthValue {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateSettings: (patch: Partial<Omit<User, 'id' | 'email'>>) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await authApi.me());
    } catch {
      // An expired or forged token: treated the same as not being signed in.
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // A 401 anywhere in the app drops straight back to the sign-in screen
    // instead of leaving a page full of failed requests.
    setUnauthorizedHandler(() => setUser(null));
    void loadUser();
    return () => setUnauthorizedHandler(null);
  }, [loadUser]);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      signIn: async (email, password) => {
        await authApi.login(email, password);
        setUser(await authApi.me());
      },
      signUp: async (email, password, displayName) => {
        await authApi.register(email, password, displayName);
        setUser(await authApi.me());
      },
      signOut: async () => {
        await authApi.logout();
        setUser(null);
      },
      refreshUser: loadUser,
      updateSettings: async (patch) => setUser(await authApi.updateSettings(patch)),
    }),
    [user, loading, loadUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth musí být uvnitř AuthProvider');
  return context;
}

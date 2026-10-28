import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, authStore } from '@/lib/api';
import { startRealtime, stopRealtime } from '@/hooks/useRealtime';
import type { Organization, User, Wallet } from '@/types';

interface MeResponse {
  success: boolean;
  user: User;
  organization: Organization | null;
  wallet: Wallet | null;
}

interface LoginResponse {
  success: boolean;
  token: string;
  user: User;
  organization: Organization | null;
  wallet: Wallet | null;
}

interface AuthContextValue {
  user: User | null;
  organization: Organization | null;
  wallet: Wallet | null;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  setWallet: (wallet: Wallet | null) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [wallet, setWalletState] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((u: User, org: Organization | null, w: Wallet | null) => {
    setUser(u);
    setOrganization(org);
    setWalletState(w);
    if (u.organization_id && org && org.status === 'active') {
      startRealtime(org.id);
    } else {
      stopRealtime();
    }
  }, []);

  const refresh = useCallback(async () => {
    const data = await api.get<MeResponse>('/auth/me');
    setUser(data.user);
    setOrganization(data.organization);
    setWalletState(data.wallet);
    if (data.user.organization_id && data.organization) {
      startRealtime(data.organization.id);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (authStore.getToken()) {
          const data = await api.get<MeResponse>('/auth/me');
          applySession(data.user, data.organization, data.wallet);
        }
      } catch {
        authStore.clear();
      } finally {
        setLoading(false);
      }
    })();
  }, [applySession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await api.post<LoginResponse>('/auth/login', { email, password });
      authStore.setToken(data.token);
      // The server now returns the wallet with the session. Passing null here
      // is what left the sidebar showing "0 credits" until a page reload.
      applySession(data.user, data.organization, data.wallet ?? null);
      return data.user;
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore */
    } finally {
      authStore.clear();
      stopRealtime();
      setUser(null);
      setOrganization(null);
      setWalletState(null);
    }
  }, []);

  const setWallet = useCallback((w: Wallet | null) => setWalletState(w), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      organization,
      wallet,
      loading,
      isAuthenticated: !!user,
      isAdmin: user?.role === 'admin' || user?.role === 'superadmin',
      refresh,
      login,
      logout,
      setWallet,
    }),
    [user, organization, wallet, loading, refresh, login, logout, setWallet],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
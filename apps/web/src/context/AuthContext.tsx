import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { authApi, type AuthUser } from '../api/auth.ts';

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ requiresMfa?: boolean }>;
  register: (email: string, password: string) => Promise<void>;
  verifyMfa: (code: string) => Promise<void>;
  challengeMfa: (code: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async (t: string) => {
    try {
      localStorage.setItem('token', t);
      const res = await authApi.me();
      setUser(res.data);
    } catch {
      localStorage.removeItem('token');
      setToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    if (token) {
      fetchMe(token).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token, fetchMe]);

  const login = async (email: string, password: string) => {
    const res = await authApi.login({ email, password });
    const data = res.data;
    if (data.requiresMfa) {
      localStorage.setItem('token', data.token);
      setToken(data.token);
      return { requiresMfa: true };
    }
    localStorage.setItem('token', data.token);
    setToken(data.token);
    await fetchMe(data.token);
    return {};
  };

  const register = async (email: string, password: string) => {
    const res = await authApi.register({ email, password });
    localStorage.setItem('token', res.data.token);
    setToken(res.data.token);
    await fetchMe(res.data.token);
  };

  const verifyMfa = async (code: string) => {
    const res = await authApi.verify2fa({ code });
    localStorage.setItem('token', res.data.token);
    setToken(res.data.token);
    await fetchMe(res.data.token);
  };

  const challengeMfa = async (code: string) => {
    const res = await authApi.challenge2fa({ code });
    localStorage.setItem('token', res.data.token);
    setToken(res.data.token);
    await fetchMe(res.data.token);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, verifyMfa, challengeMfa, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

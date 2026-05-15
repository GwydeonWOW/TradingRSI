import { useState, useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { authApi } from '../api/auth.ts';
import { useAuth } from '../context/AuthContext.tsx';

export function AuthGuard() {
  const { user, token, loading: authLoading } = useAuth();
  const location = useLocation();
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  useEffect(() => {
    authApi.needsSetup()
      .then((res) => setNeedsSetup(res.data.needsSetup))
      .catch(() => setNeedsSetup(false));
  }, []);

  // Still loading
  if (authLoading || needsSetup === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary">
        <p className="text-sm text-text-muted">Cargando...</p>
      </div>
    );
  }

  // No users exist — must create admin first
  if (needsSetup) {
    return <Navigate to="/setup" replace />;
  }

  // Users exist but not logged in — must login
  if (!token || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

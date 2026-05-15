import { useState, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { authApi } from '../api/auth.ts';

export function SetupGuard() {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  useEffect(() => {
    authApi.needsSetup()
      .then((res) => setNeedsSetup(res.data.needsSetup))
      .catch(() => setNeedsSetup(false));
  }, []);

  if (needsSetup === null) return null; // loading
  if (needsSetup) return <Navigate to="/setup" replace />;
  return <Outlet />;
}

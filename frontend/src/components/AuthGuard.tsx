import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useWhoami } from '../api/auth';
import { useAppConfig } from '../api/config';
import { Spinner } from './Spinner';

export function AuthGuard() {
  const { isAuthenticated, user, setUser, logout } = useAuthStore();
  const { data: appConfig, isLoading: configLoading } = useAppConfig();
  const isPersonal = appConfig?.mode === 'personal';

  // Personal mode: call whoami unconditionally — the backend returns the
  // seeded user regardless of Authorization. In SSO mode, only call it
  // when we have a token but haven't yet hydrated the user.
  const whoamiEnabled = !configLoading && (isPersonal || (isAuthenticated && !user));
  const { data, isLoading: whoamiLoading, isError } = useWhoami(whoamiEnabled);

  useEffect(() => {
    if (data && !user) {
      setUser(data);
    }
  }, [data, user, setUser]);

  if (configLoading) return <Spinner />;

  if (!isPersonal && !isAuthenticated) return <Navigate to="/login" replace />;

  if (whoamiLoading || (isPersonal && !user)) return <Spinner />;

  if (isError) {
    if (isPersonal) {
      // Backend misconfigured — nothing we can do from the UI.
      return <div style={{ padding: 24 }}>백엔드 연결에 실패했습니다. 관리자에게 문의하세요.</div>;
    }
    // Token is no longer valid
    logout();
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

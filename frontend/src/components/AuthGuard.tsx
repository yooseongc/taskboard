import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useWhoami } from '../api/auth';
import { Spinner } from './Spinner';

export function AuthGuard() {
  const { isAuthenticated, user, setUser, logout } = useAuthStore();
  const { data, isLoading, isError } = useWhoami(isAuthenticated && !user);

  useEffect(() => {
    if (data && !user) {
      setUser(data);
    }
  }, [data, user, setUser]);

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (isLoading) return <Spinner />;

  if (isError) {
    // Token is no longer valid
    logout();
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

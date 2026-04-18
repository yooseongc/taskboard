import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';

/** Backend runtime mode — decides whether the login page is shown at all. */
export type AppMode = 'sso' | 'personal';

export interface AppConfig {
  mode: AppMode;
  auth_required: boolean;
  dev_auth_enabled: boolean;
}

/**
 * Fetches the backend's deployment mode. Cached indefinitely — the mode
 * can only change with a server restart, so there's no point re-fetching.
 * Public endpoint, no auth header needed.
 */
export function useAppConfig() {
  return useQuery({
    queryKey: ['app-config'],
    queryFn: () => apiFetch<AppConfig>('/api/config'),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });
}

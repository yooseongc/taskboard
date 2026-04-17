import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';
import type { PaginatedResponse, User, WhoamiResponse } from '../types/api';

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<PaginatedResponse<User>>('/api/users?limit=100'),
  });
}

export function useMe() {
  return useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => apiFetch<WhoamiResponse>('/api/users/me'),
  });
}

// Only `active` is mutable here — name/email/roles come from Keycloak/AD
// claims and are synced on every login via identity/handlers.rs::auth_callback.
export function usePatchUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active?: boolean }) =>
      apiFetch<User>(`/api/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['auth', 'whoami'] });
    },
  });
}

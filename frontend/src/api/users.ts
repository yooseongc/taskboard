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

export function usePatchUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      active?: boolean;
      roles?: string[];
    }) =>
      apiFetch<User>(`/api/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['auth', 'whoami'] });
    },
  });
}

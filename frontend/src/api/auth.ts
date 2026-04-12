import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';
import type { WhoamiResponse } from '../types/api';

export function useWhoami(enabled = true) {
  return useQuery({
    queryKey: ['auth', 'whoami'],
    queryFn: () => apiFetch<WhoamiResponse>('/api/auth/whoami'),
    enabled,
    retry: false,
  });
}

export function useDevLogin() {
  return useMutation({
    mutationFn: (email: string) =>
      apiFetch<{ token: string; expires_in: number }>('/api/dev/login', {
        method: 'POST',
        body: JSON.stringify({ user_email: email }),
      }),
  });
}

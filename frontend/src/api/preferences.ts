import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  locale: string;
  preferences: Record<string, unknown>;
}

export function usePreferences() {
  return useQuery({
    queryKey: ['preferences'],
    queryFn: () => apiFetch<UserPreferences>('/api/users/me/preferences'),
  });
}

export function usePatchPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      theme?: string;
      locale?: string;
      preferences?: Record<string, unknown>;
    }) =>
      apiFetch<UserPreferences>('/api/users/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['preferences'] });
    },
  });
}

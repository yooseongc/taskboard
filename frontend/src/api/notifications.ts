import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';

export type NotificationKind =
  | 'deadline_soon'
  | 'deadline_overdue'
  | 'board_activity'
  | 'mentioned'
  | 'assigned';

export interface NotificationSummary {
  id: string;
  kind: NotificationKind;
  board_id: string | null;
  board_title: string | null;
  task_id: string | null;
  task_title: string | null;
  actor_id: string | null;
  actor_name: string | null;
  action: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

interface NotificationPage {
  items: NotificationSummary[];
  next_cursor: string | null;
}

/** Unread count — the only query we poll. 60-second cadence keeps the badge
 *  near-fresh without piling requests on the backend. */
export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: () => apiFetch<{ unread: number }>('/api/users/me/notifications/count'),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useNotifications(params: { unread?: boolean } = {}) {
  const qs = new URLSearchParams();
  if (params.unread) qs.set('unread', 'true');
  qs.set('limit', '50');
  return useInfiniteQuery({
    queryKey: ['notifications', 'list', params],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const q = new URLSearchParams(qs);
      if (pageParam) q.set('cursor', pageParam);
      return apiFetch<NotificationPage>(`/api/users/me/notifications?${q.toString()}`);
    },
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, read }: { id: string; read: boolean }) =>
      apiFetch<{ ok: true }>(`/api/users/me/notifications/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ read }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ marked: number }>('/api/users/me/notifications/read-all', {
        method: 'POST',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

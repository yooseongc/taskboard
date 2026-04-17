import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';
import type {
  PaginatedResponse,
  Board,
  BoardColumn,
  BoardMember,
  TaskDto,
  Label,
  ActivityLogEntry,
} from '../types/api';

export function useBoards(limit = 20) {
  return useQuery({
    queryKey: ['boards', { limit }],
    queryFn: () =>
      apiFetch<PaginatedResponse<Board>>(`/api/boards?limit=${limit}`),
  });
}

export function useBoard(id: string) {
  return useQuery({
    queryKey: ['board', id],
    queryFn: () => apiFetch<Board>(`/api/boards/${id}`),
    enabled: !!id,
  });
}

export function useBoardColumns(boardId: string) {
  return useQuery({
    queryKey: ['board', boardId, 'columns'],
    queryFn: () =>
      apiFetch<{ items: BoardColumn[] }>(`/api/boards/${boardId}/columns`),
    enabled: !!boardId,
  });
}

export function useBoardTasks(boardId: string) {
  return useQuery({
    queryKey: ['board', boardId, 'tasks', 'by_column'],
    queryFn: () =>
      apiFetch<PaginatedResponse<TaskDto>>(
        `/api/boards/${boardId}/tasks?group_by=column&limit=100`,
      ),
    enabled: !!boardId,
  });
}

export function useBoardLabels(boardId: string) {
  return useQuery({
    queryKey: ['board', boardId, 'labels'],
    queryFn: () =>
      apiFetch<{ items: Label[] }>(`/api/boards/${boardId}/labels`),
    enabled: !!boardId,
  });
}

export function useBoardActivity(boardId: string) {
  return useQuery({
    queryKey: ['board', boardId, 'activity'],
    queryFn: () =>
      apiFetch<PaginatedResponse<ActivityLogEntry>>(
        `/api/boards/${boardId}/activity?limit=50`,
      ),
    enabled: !!boardId,
  });
}

// --- Mutations ---

export function useCreateBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      from_template,
      ...body
    }: {
      title: string;
      description?: string;
      department_ids?: string[];
      owner_type?: 'department' | 'personal';
      from_template?: string;
    }) => {
      const payload = {
        ...body,
        department_ids: body.department_ids ?? [],
      };
      const query = from_template ? `?from_template=${from_template}` : '';
      return apiFetch<Board>(`/api/boards${query}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['boards'] });
      qc.invalidateQueries({ queryKey: ['my-boards'] });
    },
  });
}

/** ROLES.md §5: bucketed listing for the current user. */
export function useMyBoards(bucket?: 'favorites' | 'department' | 'personal' | 'invited' | 'all') {
  return useQuery({
    queryKey: ['my-boards', bucket ?? 'all'],
    queryFn: () => {
      const q = bucket ? `?bucket=${bucket}` : '';
      return apiFetch<{ items: BoardSummaryWithBucket[] }>(`/api/users/me/boards${q}`);
    },
  });
}

/** ROLES.md §8: pin/unpin a board. */
export function useToggleBoardPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (boardId: string) =>
      apiFetch<{ board_id: string; pinned: boolean }>(`/api/users/me/pins/${boardId}`, {
        method: 'PUT',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-boards'] });
    },
  });
}

export interface BoardSummaryWithBucket {
  id: string;
  title: string;
  description: string | null;
  owner_id: string;
  owner_type: 'department' | 'personal';
  version: number;
  created_at: string;
  updated_at: string;
  pinned: boolean;
  bucket: 'department' | 'personal' | 'invited';
}

export function usePatchBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      title?: string;
      description?: string | null;
      version: number;
    }) =>
      apiFetch<Board>(`/api/boards/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['boards'] });
      qc.invalidateQueries({ queryKey: ['board', data.id] });
    },
  });
}

export function useDeleteBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/boards/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['boards'] });
    },
  });
}

export function useCreateColumn(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; position?: number; color?: string }) =>
      apiFetch<BoardColumn>(`/api/boards/${boardId}/columns`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board', boardId, 'columns'] });
    },
  });
}

export function usePatchColumn(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      columnId,
      ...body
    }: {
      columnId: string;
      title?: string;
      position?: number;
      version: number;
      /**
       * Tri-state: omit the field to leave color untouched, pass `null`
       * to clear the accent (revert to theme default), pass a `#rrggbb`
       * string to set it.
       */
      color?: string | null;
    }) =>
      apiFetch<BoardColumn>(`/api/boards/${boardId}/columns/${columnId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board', boardId, 'columns'] });
    },
  });
}

export function useDeleteColumn(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (columnId: string) =>
      apiFetch<void>(`/api/boards/${boardId}/columns/${columnId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board', boardId, 'columns'] });
      qc.invalidateQueries({ queryKey: ['board', boardId, 'tasks'] });
    },
  });
}

// --- Board Member Management ---

export function useBoardMembers(boardId: string) {
  return useQuery({
    queryKey: ['board', boardId, 'members'],
    queryFn: () =>
      apiFetch<PaginatedResponse<BoardMember>>(`/api/boards/${boardId}/members?limit=100`),
    enabled: !!boardId,
  });
}

export function useAddBoardMember(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { user_id: string; role_in_board: string }) =>
      apiFetch<BoardMember>(`/api/boards/${boardId}/members`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board', boardId, 'members'] });
    },
  });
}

export function usePatchBoardMember(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role_in_board }: { userId: string; role_in_board: string }) =>
      apiFetch<BoardMember>(`/api/boards/${boardId}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role_in_board }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board', boardId, 'members'] });
    },
  });
}

export function useRemoveBoardMember(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch<void>(`/api/boards/${boardId}/members/${userId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board', boardId, 'members'] });
    },
  });
}

export function useCreateBoardLabel(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; color: string }) =>
      apiFetch<Label>(`/api/boards/${boardId}/labels`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board', boardId, 'labels'] });
    },
  });
}

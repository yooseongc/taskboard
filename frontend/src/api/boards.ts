import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';
import type { PaginatedResponse, Board, BoardColumn, TaskDto } from '../types/api';

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

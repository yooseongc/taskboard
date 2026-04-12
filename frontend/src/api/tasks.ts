import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';
import type {
  PaginatedResponse,
  TaskDto,
  Comment,
  Checklist,
} from '../types/api';

// --- Queries ---

export function useTask(taskId: string) {
  return useQuery({
    queryKey: ['task', taskId],
    queryFn: () => apiFetch<TaskDto>(`/api/tasks/${taskId}`),
    enabled: !!taskId,
  });
}

export function useTaskComments(taskId: string) {
  return useQuery({
    queryKey: ['task', taskId, 'comments'],
    queryFn: () =>
      apiFetch<PaginatedResponse<Comment>>(
        `/api/tasks/${taskId}/comments?limit=100`,
      ),
    enabled: !!taskId,
  });
}

export function useTaskChecklists(taskId: string) {
  return useQuery({
    queryKey: ['task', taskId, 'checklists'],
    queryFn: () =>
      apiFetch<{ items: Checklist[] }>(`/api/tasks/${taskId}/checklists`),
    enabled: !!taskId,
  });
}

// --- Mutations ---

export function useCreateTask(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title: string;
      column_id: string;
      description?: string;
      priority?: string;
    }) =>
      apiFetch<TaskDto>(`/api/boards/${boardId}/tasks`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board', boardId, 'tasks'] });
    },
  });
}

export function usePatchTask(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskId,
      ...body
    }: {
      taskId: string;
      title?: string;
      description?: string | null;
      priority?: string;
      status?: string;
      start_date?: string | null;
      due_date?: string | null;
      version: number;
    }) =>
      apiFetch<TaskDto>(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['board', boardId, 'tasks'] });
      qc.invalidateQueries({ queryKey: ['task', data.id] });
    },
  });
}

export function useDeleteTask(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) =>
      apiFetch<void>(`/api/tasks/${taskId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board', boardId, 'tasks'] });
    },
  });
}

export function useMoveTask(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskId,
      column_id,
      position,
    }: {
      taskId: string;
      column_id: string;
      position: number;
    }) =>
      apiFetch<TaskDto>(`/api/tasks/${taskId}/move`, {
        method: 'PATCH',
        body: JSON.stringify({ column_id, position }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board', boardId, 'tasks'] });
    },
  });
}

// --- Sub-resource mutations ---

export function useCreateComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      apiFetch<Comment>(`/api/tasks/${taskId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId, 'comments'] });
      qc.invalidateQueries({ queryKey: ['task', taskId] });
    },
  });
}

export function useAddLabel(taskId: string, boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (labelId: string) =>
      apiFetch<void>(`/api/tasks/${taskId}/labels`, {
        method: 'POST',
        body: JSON.stringify({ label_id: labelId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] });
      qc.invalidateQueries({ queryKey: ['board', boardId, 'tasks'] });
    },
  });
}

export function useRemoveLabel(taskId: string, boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (labelId: string) =>
      apiFetch<void>(`/api/tasks/${taskId}/labels/${labelId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] });
      qc.invalidateQueries({ queryKey: ['board', boardId, 'tasks'] });
    },
  });
}

export function useAddAssignee(taskId: string, boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch<void>(`/api/tasks/${taskId}/assignees`, {
        method: 'POST',
        body: JSON.stringify({ user_id: userId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] });
      qc.invalidateQueries({ queryKey: ['board', boardId, 'tasks'] });
    },
  });
}

export function useRemoveAssignee(taskId: string, boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch<void>(`/api/tasks/${taskId}/assignees/${userId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] });
      qc.invalidateQueries({ queryKey: ['board', boardId, 'tasks'] });
    },
  });
}

export function useCreateChecklist(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (title: string) =>
      apiFetch<Checklist>(`/api/tasks/${taskId}/checklists`, {
        method: 'POST',
        body: JSON.stringify({ title }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId, 'checklists'] });
      qc.invalidateQueries({ queryKey: ['task', taskId] });
    },
  });
}

export function usePatchChecklistItem(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      checklistId,
      itemId,
      checked,
      title,
    }: {
      checklistId: string;
      itemId: string;
      checked?: boolean;
      title?: string;
    }) =>
      apiFetch<void>(
        `/api/tasks/${taskId}/checklists/${checklistId}/items/${itemId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ checked, title }),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId, 'checklists'] });
      qc.invalidateQueries({ queryKey: ['task', taskId] });
    },
  });
}

export function useAddChecklistItem(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      checklistId,
      title,
    }: {
      checklistId: string;
      title: string;
    }) =>
      apiFetch<void>(
        `/api/tasks/${taskId}/checklists/${checklistId}/items`,
        {
          method: 'POST',
          body: JSON.stringify({ title }),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId, 'checklists'] });
      qc.invalidateQueries({ queryKey: ['task', taskId] });
    },
  });
}

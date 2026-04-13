import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';

export interface CustomField {
  id: string;
  board_id: string;
  name: string;
  field_type: string;
  options: { label: string; color?: string }[];
  position: number;
  required: boolean;
  created_at: string;
}

export interface TaskFieldValue {
  task_id: string;
  field_id: string;
  value: unknown;
  updated_at: string;
}

export function useBoardCustomFields(boardId: string) {
  return useQuery({
    queryKey: ['board', boardId, 'fields'],
    queryFn: () =>
      apiFetch<{ items: CustomField[] }>(`/api/boards/${boardId}/fields`),
    enabled: !!boardId,
  });
}

export function useCreateCustomField(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      field_type: string;
      options?: { label: string; color?: string }[];
      required?: boolean;
    }) =>
      apiFetch<CustomField>(`/api/boards/${boardId}/fields`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board', boardId, 'fields'] });
    },
  });
}

export function usePatchCustomField(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      fieldId,
      ...body
    }: {
      fieldId: string;
      name?: string;
      options?: { label: string; color?: string }[];
      position?: number;
      required?: boolean;
    }) =>
      apiFetch<CustomField>(`/api/boards/${boardId}/fields/${fieldId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board', boardId, 'fields'] });
    },
  });
}

export function useDeleteCustomField(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fieldId: string) =>
      apiFetch<void>(`/api/boards/${boardId}/fields/${fieldId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board', boardId, 'fields'] });
    },
  });
}

/**
 * Bulk fetch every task's custom-field values for a board in one round-trip.
 * Used by TableView's filter builder so we can evaluate filter expressions
 * client-side without N per-task requests.
 */
export function useBoardFieldValues(boardId: string) {
  return useQuery({
    queryKey: ['board', boardId, 'field-values'],
    queryFn: () =>
      apiFetch<{ items: TaskFieldValue[] }>(`/api/boards/${boardId}/field-values`),
    enabled: !!boardId,
  });
}

export function useTaskFieldValues(taskId: string) {
  return useQuery({
    queryKey: ['task', taskId, 'fields'],
    queryFn: () =>
      apiFetch<{ items: TaskFieldValue[] }>(`/api/tasks/${taskId}/fields`),
    enabled: !!taskId,
  });
}

export function useSetTaskFieldValue(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fieldId, value }: { fieldId: string; value: unknown }) =>
      apiFetch<TaskFieldValue>(`/api/tasks/${taskId}/fields/${fieldId}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId, 'fields'] });
    },
  });
}

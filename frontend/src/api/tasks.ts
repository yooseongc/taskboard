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
      // Invalidate board task list to trigger refetch with enriched data
      // (labels, assignees, checklist summary, comment count).
      qc.invalidateQueries({ queryKey: ['board', boardId, 'tasks', 'by_column'] });
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
  const listKey = ['board', boardId, 'tasks', 'by_column'] as const;
  return useMutation({
    /**
     * Serialize every move mutation. Without scope, a second rapid drag
     * fires before the first's onSuccess has normalised the version in
     * cache — the second then reads a stale version and 409s. Scope
     * makes TanStack Query queue the second mutation until the first
     * fully settles (mutationFn + onSuccess).
     */
    scope: { id: 'task-move' },
    mutationFn: ({
      taskId,
      column_id,
      position,
      version,
    }: {
      taskId: string;
      column_id: string;
      position: number;
      /**
       * Fallback version if nothing is cached. Under normal flow we
       * read the latest version from cache just before the fetch, so
       * serialized consecutive mutations each see the authoritative
       * value left behind by the previous mutation's onSuccess.
       */
      version: number;
    }) => {
      const cached =
        qc.getQueryData<PaginatedResponse<TaskDto>>(listKey)?.items.find(
          (t) => t.id === taskId,
        ) ?? qc.getQueryData<TaskDto>(['task', taskId]);
      const effectiveVersion = cached?.version ?? version;
      return apiFetch<TaskDto>(`/api/tasks/${taskId}/move`, {
        method: 'PATCH',
        body: JSON.stringify({ column_id, position, version: effectiveVersion }),
      });
    },
    /**
     * Optimistic UI move: change column_id/position in cache so the card
     * doesn't snap back during the network round-trip.
     *
     * Order matters: we apply `setQueryData` BEFORE awaiting
     * `cancelQueries`. @hello-pangea/dnd ends its drop animation
     * synchronously after `onDragEnd` returns and expects the React tree
     * to already reflect the move; if we await first, the optimistic
     * cache update lands one microtask later and the library briefly
     * renders the card in its source location, producing the visible
     * "second drag needed to see first drag" stall. Cancelling the
     * pending refetch afterwards is still safe — there is no inflight
     * refetch on a freshly-stable list anyway.
     *
     * Do NOT bump `version` here — the mutationFn reads the cached
     * version, and a bumped value would be sent as if it were current.
     */
    onMutate: async ({ taskId, column_id, position }) => {
      const taskKey = ['task', taskId] as const;
      const previousList = qc.getQueryData<PaginatedResponse<TaskDto>>(listKey);
      const previousTask = qc.getQueryData<TaskDto>(taskKey);
      if (previousList) {
        qc.setQueryData<PaginatedResponse<TaskDto>>(listKey, {
          ...previousList,
          items: previousList.items.map((t) =>
            t.id === taskId ? { ...t, column_id, position } : t,
          ),
        });
      }
      if (previousTask) {
        qc.setQueryData<TaskDto>(taskKey, {
          ...previousTask,
          column_id,
          position,
        });
      }
      await Promise.all([
        qc.cancelQueries({ queryKey: listKey }),
        qc.cancelQueries({ queryKey: taskKey }),
      ]);
      return { previousList, previousTask, taskKey };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previousList) qc.setQueryData(listKey, ctx.previousList);
      if (ctx?.previousTask && ctx.taskKey)
        qc.setQueryData(ctx.taskKey, ctx.previousTask);
    },
    /**
     * Replace the cached task with the server's authoritative copy —
     * this writes the new `version` that the next serialized mutation
     * will read. We deliberately do NOT invalidate the list here: a
     * refetch can race with a queued second drag and momentarily
     * overwrite the next optimistic state. The cache is already
     * authoritative after this update.
     */
    onSuccess: (updated) => {
      qc.setQueryData<PaginatedResponse<TaskDto>>(listKey, (old) =>
        old
          ? { ...old, items: old.items.map((t) => (t.id === updated.id ? updated : t)) }
          : old,
      );
      qc.setQueryData<TaskDto>(['task', updated.id], updated);
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

export function usePatchComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, body }: { commentId: string; body: string }) =>
      apiFetch<Comment>(`/api/tasks/${taskId}/comments/${commentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId, 'comments'] });
    },
  });
}

export function useDeleteComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) =>
      apiFetch<void>(`/api/tasks/${taskId}/comments/${commentId}`, {
        method: 'DELETE',
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

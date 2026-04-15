// Round C — Saved Views API hooks.
//
// A view bundles a board's UI state (filters, sort, visible columns,
// group-by, etc.) under a user-chosen name. The `config` shape is
// owned by the frontend and varies per `view_type`; see the
// `TableViewConfig` / `BoardViewConfig` / `CalendarViewConfig` types
// below for the current contract.
//
// We keep `config: unknown` on the wire so adding new fields doesn't
// require a backend change — the server treats `config` as an opaque
// JSON blob and only enforces a schema for the enclosing row.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';
import type { GroupByKey, ViewDensity } from '../types/api';

export type ViewType = 'board' | 'table' | 'calendar';

export interface BoardView {
  id: string;
  board_id: string;
  name: string;
  view_type: ViewType;
  /**
   * Opaque client-owned configuration. Use the per-view-type helpers
   * (`useTableViewConfig` / future equivalents) to narrow the type.
   */
  config: Record<string, unknown>;
  owner_id: string;
  shared: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

/**
 * Shape of `config` for a Table view. Filter/sort logic in
 * `TableView.tsx` produces and consumes this.
 */
export interface TableViewConfig {
  filters?: Array<{
    id: string;
    fieldId: string;
    operator: string;
    value: string;
    value2?: string;
  }>;
  filterMode?: 'and' | 'or';
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  visibleColumns?: string[];
  visibleFieldIds?: string[];
  groupBy?: GroupByKey;
  density?: ViewDensity;
}

/**
 * Shape of `config` for a Board view — currently just the search
 * query and the priority filter, matching the board toolbar. Kept
 * open-ended so additional filters (assignee, label, etc.) can land
 * without schema changes.
 */
export interface BoardViewConfig {
  search?: string;
  priority?: string;
  groupBy?: GroupByKey;
  density?: ViewDensity;
}

export interface CalendarViewConfig {
  /** Custom date field id, or `"due_date"` / `"start_date"` for built-ins. */
  dateField?: string;
  groupBy?: GroupByKey;
}

export function useBoardViews(boardId: string) {
  return useQuery({
    queryKey: ['board', boardId, 'views'],
    queryFn: () =>
      apiFetch<{ items: BoardView[] }>(`/api/boards/${boardId}/views`),
    enabled: !!boardId,
  });
}

export function useCreateBoardView(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      view_type: ViewType;
      config?: Record<string, unknown>;
      shared?: boolean;
    }) =>
      apiFetch<BoardView>(`/api/boards/${boardId}/views`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board', boardId, 'views'] }),
  });
}

export function usePatchBoardView(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      viewId,
      ...body
    }: {
      viewId: string;
      name?: string;
      config?: Record<string, unknown>;
      shared?: boolean;
      position?: number;
      view_type?: ViewType;
    }) =>
      apiFetch<BoardView>(`/api/boards/${boardId}/views/${viewId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board', boardId, 'views'] }),
  });
}

export function useDeleteBoardView(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (viewId: string) =>
      apiFetch<void>(`/api/boards/${boardId}/views/${viewId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board', boardId, 'views'] }),
  });
}

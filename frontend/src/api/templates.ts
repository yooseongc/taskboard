import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';
import type { PaginatedResponse } from '../types/api';

// Backend template schema (S-022)
export interface TemplateDto {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  owner_id: string;
  scope: string;
  scope_ref_id: string | null;
  auto_enroll_members: boolean;
  payload: Record<string, unknown>;
  payload_version: number;
  created_at: string;
  updated_at: string;
}

export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: () =>
      apiFetch<PaginatedResponse<TemplateDto>>('/api/templates?limit=100'),
  });
}

export function useTemplate(id: string) {
  return useQuery({
    queryKey: ['template', id],
    queryFn: () => apiFetch<TemplateDto>(`/api/templates/${id}`),
    enabled: !!id,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      kind: string;
      name: string;
      description?: string;
      scope: string;
      scope_ref_id?: string;
      payload: Record<string, unknown>;
    }) =>
      apiFetch<TemplateDto>('/api/templates', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
    },
  });
}

export function usePatchTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      description?: string | null;
      payload?: Record<string, unknown>;
    }) =>
      apiFetch<TemplateDto>(`/api/templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      qc.invalidateQueries({ queryKey: ['template', data.id] });
    },
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
    },
  });
}

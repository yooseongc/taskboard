import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';
import type {
  PaginatedResponse,
  Department,
  DepartmentMember,
} from '../types/api';

export function useDepartments() {
  return useQuery({
    queryKey: ['departments'],
    queryFn: () =>
      apiFetch<PaginatedResponse<Department>>('/api/departments?limit=100'),
  });
}

export function useDepartment(id: string) {
  return useQuery({
    queryKey: ['department', id],
    queryFn: () => apiFetch<Department>(`/api/departments/${id}`),
    enabled: !!id,
  });
}

export function useDepartmentMembers(departmentId: string) {
  return useQuery({
    queryKey: ['department', departmentId, 'members'],
    queryFn: () =>
      apiFetch<PaginatedResponse<DepartmentMember>>(
        `/api/departments/${departmentId}/members?limit=100`,
      ),
    enabled: !!departmentId,
  });
}

export function useCreateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      slug: string;
      parent_id?: string | null;
    }) =>
      apiFetch<Department>('/api/departments', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] });
    },
  });
}

export function usePatchDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      slug?: string;
    }) =>
      apiFetch<Department>(`/api/departments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] });
    },
  });
}

export function useDeleteDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/departments/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] });
    },
  });
}

export function useAddDepartmentMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      departmentId,
      user_id,
      role,
    }: {
      departmentId: string;
      user_id: string;
      role: string;
    }) =>
      apiFetch<void>(`/api/departments/${departmentId}/members`, {
        method: 'POST',
        body: JSON.stringify({ user_id, role_in_department: role }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({
        queryKey: ['department', vars.departmentId, 'members'],
      });
    },
  });
}

export function useRemoveDepartmentMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      departmentId,
      userId,
    }: {
      departmentId: string;
      userId: string;
    }) =>
      apiFetch<void>(
        `/api/departments/${departmentId}/members/${userId}`,
        { method: 'DELETE' },
      ),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({
        queryKey: ['department', vars.departmentId, 'members'],
      });
    },
  });
}

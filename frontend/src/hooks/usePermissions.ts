import { useAuthStore } from '../stores/authStore';
import type { GlobalRole } from '../types/api';

/**
 * Role-based permission checks aligned with ROLES.md §1+§4.
 *
 * Global roles: SystemAdmin > DepartmentAdmin > Member.
 * Viewer was removed; every authenticated user is at least Member.
 *
 * MATRIX (Create column):
 *   SystemAdmin:     Board=A, Task=A, Template=A, Comment=A, DeptMgmt=A
 *   DepartmentAdmin: Board=A, Task=A, Template=A, Comment=A, DeptMgmt=A
 *   Member:          Board=D (uses board-role), Task=A, Template=A, Comment=A, DeptMgmt=D
 */

const ROLE_LEVEL: Record<GlobalRole, number> = {
  SystemAdmin: 2,
  DepartmentAdmin: 1,
  Member: 0,
};

function highestLevel(roles: GlobalRole[]): number {
  if (roles.length === 0) return 0;
  return Math.max(...roles.map((r) => ROLE_LEVEL[r] ?? 0));
}

export function usePermissions() {
  const user = useAuthStore((s) => s.user);
  const roles = (user?.roles ?? ['Member']) as GlobalRole[];
  const level = highestLevel(roles);

  return {
    /** SystemAdmin */
    isSystemAdmin: level >= 2,
    /** DepartmentAdmin+ */
    isDeptAdmin: level >= 1,
    /** Always true now (Member is the floor) */
    isMember: true,

    // Resource-specific checks
    canCreateDepartmentBoard: level >= 1, // DeptAdmin+
    canCreatePersonalBoard: true, // Any Member can create personal boards
    /** Any user can create at least a personal board. Kept for legacy callers. */
    canCreateBoard: true,
    canCreateTemplate: true, // Any Member
    canManageDepartments: level >= 1, // DeptAdmin+
    canManageUsers: level >= 2, // SystemAdmin only
  };
}

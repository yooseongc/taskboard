import { useAuthStore } from '../stores/authStore';
import type { GlobalRole } from '../types/api';

/**
 * Role-based permission checks derived from S-025 MATRIX.
 *
 * GlobalRole privilege: SystemAdmin > DepartmentAdmin > Member > Viewer
 *
 * MATRIX (Create column only):
 *   SystemAdmin:     Board=A, Task=A, Template=A, Comment=A, DeptMgmt=A
 *   DepartmentAdmin: Board=A, Task=A, Template=A, Comment=A, DeptMgmt=A
 *   Member:          Board=D, Task=A, Template=A, Comment=A, DeptMgmt=D
 *   Viewer:          Board=D, Task=D, Template=D, Comment=D, DeptMgmt=D
 */

const ROLE_LEVEL: Record<GlobalRole, number> = {
  SystemAdmin: 3,
  DepartmentAdmin: 2,
  Member: 1,
  Viewer: 0,
};

function highestLevel(roles: GlobalRole[]): number {
  if (roles.length === 0) return 0;
  return Math.max(...roles.map((r) => ROLE_LEVEL[r] ?? 0));
}

export function usePermissions() {
  const user = useAuthStore((s) => s.user);
  const roles = (user?.roles ?? ['Viewer']) as GlobalRole[];
  const level = highestLevel(roles);

  return {
    /** SystemAdmin */
    isSystemAdmin: level >= 3,
    /** DepartmentAdmin+ */
    isDeptAdmin: level >= 2,
    /** Member+ */
    isMember: level >= 1,

    // Resource-specific checks (from MATRIX)
    canCreateBoard: level >= 2, // DeptAdmin+
    canCreateTemplate: level >= 1, // Member+
    canManageDepartments: level >= 2, // DeptAdmin+
    canManageUsers: level >= 3, // SystemAdmin only
  };
}

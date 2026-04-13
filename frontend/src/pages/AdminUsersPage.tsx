import { useState, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useUsers } from '../api/users';
import { useDepartments } from '../api/departments';
import { Spinner } from '../components/Spinner';
import { usePermissions } from '../hooks/usePermissions';
import Badge from '../components/ui/Badge';
import { roleClass } from '../theme/constants';

export default function AdminUsersPage() {
  const { canManageUsers } = usePermissions();
  const { data, isLoading } = useUsers();
  const { data: deptsData } = useDepartments();
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');

  if (!canManageUsers) return <Navigate to="/" replace />;

  const users = data?.items ?? [];
  const departments = deptsData?.items ?? [];
  const deptMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of departments) m.set(d.id, d.name);
    return m;
  }, [departments]);

  const filtered = useMemo(() => {
    let list = [...users];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q),
      );
    }
    if (filterRole) {
      list = list.filter((u) => u.roles.includes(filterRole as never));
    }
    return list;
  }, [users, search, filterRole]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">User Administration</h1>
        <p className="text-sm text-gray-400 mt-1">
          User accounts are managed via Active Directory. This view is read-only.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name or email..."
          className="border rounded-lg px-3 py-2 text-sm w-72 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        >
          <option value="">All roles</option>
          <option value="SystemAdmin">SystemAdmin</option>
          <option value="DepartmentAdmin">DepartmentAdmin</option>
          <option value="Member">Member</option>
          <option value="Viewer">Viewer</option>
        </select>
        <span className="self-center text-sm text-gray-400">
          {filtered.length} user(s)
        </span>
      </div>

      {isLoading && <Spinner />}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">
                User
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">
                Email
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">
                Roles
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">
                Departments
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">
                Status
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">
                Joined
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium">{user.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500">{user.email}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {user.roles.map((r) => (
                      <Badge key={r} className={roleClass(r)}>
                        {r}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {user.department_ids.length > 0
                      ? user.department_ids.map((did) => (
                          <Badge key={did} variant="neutral">
                            {deptMap.get(did) ?? did.slice(0, 8)}
                          </Badge>
                        ))
                      : (
                        <span
                          className="text-xs"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          -
                        </span>
                      )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={user.active ? 'success' : 'neutral'}>
                    {user.active ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {new Date(user.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && !isLoading && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-gray-400"
                >
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

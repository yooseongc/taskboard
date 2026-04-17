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

  const inputStyle = {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text)',
  } as const;

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6 py-6 md:py-8">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight"
            style={{ color: 'var(--color-text)' }}>
          User Administration
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
          User accounts are managed via Active Directory. This view is read-only.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name or email..."
          className="rounded-md px-3 py-2 text-sm w-full sm:w-72 outline-none focus:ring-2"
          style={inputStyle}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="rounded-md px-3 py-2 text-sm outline-none focus:ring-2"
          style={inputStyle}
        >
          <option value="">All roles</option>
          <option value="SystemAdmin">SystemAdmin</option>
          <option value="DepartmentAdmin">DepartmentAdmin</option>
          <option value="Member">Member</option>
        </select>
        <span className="self-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {filtered.length} user(s)
        </span>
      </div>

      {isLoading && <Spinner />}

      {/* No internal overflow-x wrapper — <main> handles page-level
          horizontal scroll when the table exceeds viewport width. */}
      <div
        className="rounded-lg"
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
        }}
      >
        <table className="w-full min-w-[720px] text-sm">
          <thead style={{ backgroundColor: 'var(--color-surface-hover)' }}>
            <tr>
              {['User', 'Email', 'Roles', 'Departments', 'Status', 'Joined'].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left font-medium"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y" style={{ backgroundColor: 'var(--color-surface)' }}>
            {filtered.map((user) => (
              <tr key={user.id} className="hover:bg-[var(--color-surface-hover)]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                      style={{
                        backgroundColor: 'var(--color-primary)',
                        color: 'var(--color-text-inverse)',
                      }}
                    >
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium" style={{ color: 'var(--color-text)' }}>{user.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>{user.email}</td>
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
                <td className="px-4 py-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {new Date(user.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && !isLoading && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center"
                  style={{ color: 'var(--color-text-muted)' }}
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

import { useState, useMemo } from 'react';
import { useDepartments, useDepartmentMembers } from '../api/departments';
import { useUsers } from '../api/users';
import { Spinner } from '../components/Spinner';
import Badge from '../components/ui/Badge';
import { roleClass } from '../theme/constants';
import type { Department, User } from '../types/api';

const PAGE_SIZE = 20;

export default function DirectoryPage() {
  const { data: deptsData, isLoading: deptsLoading } = useDepartments();
  const { data: usersData, isLoading: usersLoading } = useUsers();
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const departments = deptsData?.items ?? [];
  const allUsers = usersData?.items ?? [];
  const selectedDept = departments.find((d) => d.id === selectedDeptId) ?? null;

  const deptMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of departments) m.set(d.id, d.name);
    return m;
  }, [departments]);

  const roots = departments.filter((d) => !d.parent_id);
  const childrenOf = (parentId: string) =>
    departments.filter((d) => d.parent_id === parentId);

  // Reset page on search/dept change
  const handleSearch = (q: string) => { setSearch(q); setPage(0); };
  const handleSelectDept = (id: string | null) => { setSelectedDeptId(id); setPage(0); };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Directory</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Organization structure and people. Synced from Active Directory.
        </p>
      </div>

      {(deptsLoading || usersLoading) && <Spinner />}

      <div className="flex gap-6">
        {/* Left: Department tree */}
        <div className="w-64 flex-shrink-0">
          <div className="surface-raised p-3 sticky top-4">
            <h2 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
              Departments
            </h2>
            {/* "All people" option */}
            <div
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-sm cursor-pointer mb-1 ${
                selectedDeptId === null
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'hover:bg-[var(--color-surface-hover)] text-[var(--color-text)]'
              }`}
              onClick={() => handleSelectDept(null)}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>All people</span>
              <span className="ml-auto text-xs text-[var(--color-text-muted)]">{allUsers.length}</span>
            </div>
            <div className="border-t my-1.5" />
            {roots.map((dept) => (
              <DeptNode
                key={dept.id}
                dept={dept}
                childrenOf={childrenOf}
                selected={selectedDeptId}
                onSelect={handleSelectDept}
                depth={0}
              />
            ))}
          </div>
        </div>

        {/* Right: People list */}
        <div className="flex-1 min-w-0">
          <div className="surface-raised">
            {/* Header */}
            <div className="px-4 py-3 border-b flex items-center gap-3">
              <h2 className="text-sm font-semibold">
                {selectedDept ? selectedDept.name : 'All People'}
              </h2>
              <input
                type="text"
                placeholder="Search by name or email..."
                className="ml-auto border rounded-lg px-3 py-1.5 text-sm w-64 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>

            {/* Content */}
            {selectedDeptId ? (
              <DeptMembersView
                departmentId={selectedDeptId}
                search={search}
                page={page}
                setPage={setPage}
                deptMap={deptMap}
                allUsers={allUsers}
              />
            ) : (
              <AllUsersView
                users={allUsers}
                search={search}
                page={page}
                setPage={setPage}
                deptMap={deptMap}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- All Users View with pagination ---

function AllUsersView({
  users,
  search,
  page,
  setPage,
  deptMap,
}: {
  users: User[];
  search: string;
  page: number;
  setPage: (p: number) => void;
  deptMap: Map<string, string>;
}) {
  const filtered = useMemo(() => {
    if (!search) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [users, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <>
      <UserTable users={paged} deptMap={deptMap} />
      <Pagination page={page} totalPages={totalPages} total={filtered.length} setPage={setPage} />
    </>
  );
}

// --- Department Members View ---

function DeptMembersView({
  departmentId,
  search,
  page,
  setPage,
  deptMap,
  allUsers,
}: {
  departmentId: string;
  search: string;
  page: number;
  setPage: (p: number) => void;
  deptMap: Map<string, string>;
  allUsers: User[];
}) {
  const { data, isLoading } = useDepartmentMembers(departmentId);
  const members = data?.items ?? [];

  // Enrich member data with full user info
  const userMap = useMemo(() => {
    const m = new Map<string, User>();
    for (const u of allUsers) m.set(u.id, u);
    return m;
  }, [allUsers]);

  const enriched = useMemo(() => {
    let list = members.map((m) => ({
      ...m,
      user: userMap.get(m.user_id),
    }));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          m.user_name.toLowerCase().includes(q) ||
          m.user_email.toLowerCase().includes(q),
      );
    }
    return list;
  }, [members, search, userMap]);

  const totalPages = Math.ceil(enriched.length / PAGE_SIZE);
  const paged = enriched.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (isLoading) return <div className="p-4"><Spinner /></div>;

  return (
    <>
      <table className="w-full text-sm">
        <thead className="bg-[var(--color-surface-hover)]">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium text-[var(--color-text-secondary)]">Person</th>
            <th className="px-4 py-2.5 text-left font-medium text-[var(--color-text-secondary)]">Email</th>
            <th className="px-4 py-2.5 text-left font-medium text-[var(--color-text-secondary)]">Role in Dept</th>
            <th className="px-4 py-2.5 text-left font-medium text-[var(--color-text-secondary)]">Other Departments</th>
            <th className="px-4 py-2.5 text-left font-medium text-[var(--color-text-secondary)]">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border-light)]">
          {paged.map((m) => (
            <tr key={m.user_id} className="hover:bg-[var(--color-surface-hover)]">
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{
                      backgroundColor: 'var(--color-primary)',
                      color: 'var(--color-text-inverse)',
                    }}
                  >
                    {m.user_name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-medium">{m.user_name}</span>
                </div>
              </td>
              <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">{m.user_email}</td>
              <td className="px-4 py-2.5">
                <Badge className={roleClass(m.role_in_department)}>
                  {m.role_in_department}
                </Badge>
              </td>
              <td className="px-4 py-2.5">
                {m.user?.department_ids
                  ?.filter((did) => did !== m.department_id)
                  .map((did) => (
                    <span key={did} className="inline-flex mr-1 mb-0.5">
                      <Badge variant="neutral">
                        {deptMap.get(did) ?? did.slice(0, 8)}
                      </Badge>
                    </span>
                  )) ?? (
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      -
                    </span>
                  )}
              </td>
              <td className="px-4 py-2.5">
                <Badge variant={m.user?.active !== false ? 'success' : 'neutral'}>
                  {m.user?.active !== false ? 'Active' : 'Inactive'}
                </Badge>
              </td>
            </tr>
          ))}
          {paged.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-[var(--color-text-muted)]">
                {members.length === 0 ? 'No members in this department.' : 'No results.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <Pagination page={page} totalPages={totalPages} total={enriched.length} setPage={setPage} />
    </>
  );
}

// --- Shared user table ---

function UserTable({ users, deptMap }: { users: User[]; deptMap: Map<string, string> }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-[var(--color-surface-hover)]">
        <tr>
          <th className="px-4 py-2.5 text-left font-medium text-[var(--color-text-secondary)]">Person</th>
          <th className="px-4 py-2.5 text-left font-medium text-[var(--color-text-secondary)]">Email</th>
          <th className="px-4 py-2.5 text-left font-medium text-[var(--color-text-secondary)]">Roles</th>
          <th className="px-4 py-2.5 text-left font-medium text-[var(--color-text-secondary)]">Departments</th>
          <th className="px-4 py-2.5 text-left font-medium text-[var(--color-text-secondary)]">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--color-border-light)]">
        {users.map((user) => (
          <tr key={user.id} className="hover:bg-[var(--color-surface-hover)]">
            <td className="px-4 py-2.5">
              <div className="flex items-center gap-2.5">
                <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{
                      backgroundColor: 'var(--color-primary)',
                      color: 'var(--color-text-inverse)',
                    }}
                  >
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <span className="font-medium">{user.name}</span>
              </div>
            </td>
            <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">{user.email}</td>
            <td className="px-4 py-2.5">
              <div className="flex flex-wrap gap-1">
                {user.roles.map((r) => (
                  <Badge key={r} className={roleClass(r)}>{r}</Badge>
                ))}
              </div>
            </td>
            <td className="px-4 py-2.5">
              <div className="flex flex-wrap gap-1">
                {user.department_ids.length > 0
                  ? user.department_ids.map((did) => (
                      <Badge key={did} variant="neutral">
                        {deptMap.get(did) ?? did.slice(0, 8)}
                      </Badge>
                    ))
                  : (
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      -
                    </span>
                  )}
              </div>
            </td>
            <td className="px-4 py-2.5">
              <Badge variant={user.active ? 'success' : 'neutral'}>
                {user.active ? 'Active' : 'Inactive'}
              </Badge>
            </td>
          </tr>
        ))}
        {users.length === 0 && (
          <tr>
            <td colSpan={5} className="px-4 py-8 text-center text-[var(--color-text-muted)]">No results.</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

// --- Pagination ---

function Pagination({
  page,
  totalPages,
  total,
  setPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  setPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="px-4 py-3 border-t flex items-center justify-between text-sm">
      <span className="text-[var(--color-text-muted)]">
        {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
      </span>
      <div className="flex gap-1">
        <button
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
          className="px-2.5 py-1 border rounded text-xs disabled:opacity-30 hover:bg-[var(--color-surface-hover)]"
        >
          Prev
        </button>
        <button
          disabled={page >= totalPages - 1}
          onClick={() => setPage(page + 1)}
          className="px-2.5 py-1 border rounded text-xs disabled:opacity-30 hover:bg-[var(--color-surface-hover)]"
        >
          Next
        </button>
      </div>
    </div>
  );
}

// --- Department tree node ---

function DeptNode({
  dept,
  childrenOf,
  selected,
  onSelect,
  depth,
}: {
  dept: Department;
  childrenOf: (id: string) => Department[];
  selected: string | null;
  onSelect: (id: string) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const children = childrenOf(dept.id);
  const isSelected = selected === dept.id;
  const hasChildren = children.length > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-sm cursor-pointer ${
          isSelected
            ? 'bg-blue-50 text-blue-700 font-medium'
            : 'hover:bg-[var(--color-surface-hover)] text-[var(--color-text)]'
        }`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onSelect(dept.id)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="w-3.5 h-3.5 flex items-center justify-center text-[var(--color-text-muted)] flex-shrink-0"
          >
            <svg
              className={`w-2.5 h-2.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M6 6l8 4-8 4V6z" />
            </svg>
          </button>
        ) : (
          <span className="w-3.5 flex-shrink-0" />
        )}
        <span className="truncate">{dept.name}</span>
      </div>
      {expanded &&
        children.map((child) => (
          <DeptNode
            key={child.id}
            dept={child}
            childrenOf={childrenOf}
            selected={selected}
            onSelect={onSelect}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}

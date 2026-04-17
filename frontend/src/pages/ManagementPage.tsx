import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useDepartments, useDepartmentMembers } from '../api/departments';
import { useUsers } from '../api/users';
import { useUserBoards, useDepartmentBoards } from '../api/boards';
import { Spinner } from '../components/Spinner';
import Badge from '../components/ui/Badge';
import { roleClass } from '../theme/constants';
import type { Department, User } from '../types/api';

type Selection =
  | { kind: 'all' }
  | { kind: 'user'; userId: string }
  | { kind: 'department'; deptId: string };

/**
 * Unified management page (renamed from "Directory" per ROLES.md §6).
 * Three-column layout:
 *   - Left: scope tree (All people + departments)
 *   - Middle: list of users in scope
 *   - Right: detail panel for selected user / department
 *           — for users: profile, dept memberships, board memberships
 *           — for departments: members + boards
 */
export default function ManagementPage() {
  const { t } = useTranslation();
  const { data: deptsData, isLoading: deptsLoading } = useDepartments();
  const { data: usersData, isLoading: usersLoading } = useUsers();
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({ kind: 'all' });
  const [search, setSearch] = useState('');

  const departments = deptsData?.items ?? [];
  const allUsers = usersData?.items ?? [];

  const deptMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of departments) m.set(d.id, d.name);
    return m;
  }, [departments]);

  const roots = departments.filter((d) => !d.parent_id);
  const childrenOf = (parentId: string) =>
    departments.filter((d) => d.parent_id === parentId);

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold">{t('management.title', '관리')}</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          {t('management.subtitle', '사용자, 부서, 보드 통합 관리')}
        </p>
      </div>

      {(deptsLoading || usersLoading) && <Spinner />}

      <div className="flex gap-4">
        {/* Left: scope tree */}
        <div className="w-56 flex-shrink-0">
          <div className="surface-raised p-3 sticky top-4">
            <h2 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
              {t('management.scope', '범위')}
            </h2>
            <ScopeButton
              label={t('management.allPeople', '전체 사용자')}
              count={allUsers.length}
              active={selection.kind === 'all'}
              onClick={() => { setSelection({ kind: 'all' }); setSelectedDeptId(null); }}
            />
            <div className="border-t my-1.5" />
            {roots.map((dept) => (
              <DeptNode
                key={dept.id}
                dept={dept}
                childrenOf={childrenOf}
                selected={selectedDeptId}
                onSelect={(id) => {
                  setSelectedDeptId(id);
                  setSelection({ kind: 'department', deptId: id });
                }}
                depth={0}
              />
            ))}
          </div>
        </div>

        {/* Middle: user list */}
        <div className="flex-1 min-w-0 max-w-xl">
          <div className="surface-raised">
            <div className="px-3 py-2 border-b flex items-center gap-2">
              <input
                type="text"
                placeholder={t('management.searchPlaceholder', '이름 또는 이메일')}
                className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {selectedDeptId ? (
              <DeptUserList
                deptId={selectedDeptId}
                allUsers={allUsers}
                search={search}
                selectedUserId={selection.kind === 'user' ? selection.userId : null}
                onSelect={(userId) => setSelection({ kind: 'user', userId })}
              />
            ) : (
              <AllUserList
                users={allUsers}
                search={search}
                selectedUserId={selection.kind === 'user' ? selection.userId : null}
                onSelect={(userId) => setSelection({ kind: 'user', userId })}
                deptMap={deptMap}
              />
            )}
          </div>
        </div>

        {/* Right: detail */}
        <div className="w-[28rem] flex-shrink-0">
          {selection.kind === 'user' && (
            <UserDetail
              userId={selection.userId}
              allUsers={allUsers}
              deptMap={deptMap}
            />
          )}
          {selection.kind === 'department' && (
            <DepartmentDetail deptId={selection.deptId} />
          )}
          {selection.kind === 'all' && (
            <div className="surface-raised p-4 text-sm text-[var(--color-text-muted)]">
              {t('management.selectHint', '좌측에서 부서 또는 사용자를 선택하세요.')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScopeButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-sm cursor-pointer mb-1 ${
        active ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-[var(--color-surface-hover)] text-[var(--color-text)]'
      }`}
      onClick={onClick}
    >
      <span className="flex-1">{label}</span>
      {typeof count === 'number' && (
        <span className="text-xs text-[var(--color-text-muted)]">{count}</span>
      )}
    </div>
  );
}

function DeptNode({
  dept,
  childrenOf,
  selected,
  onSelect,
  depth,
}: {
  dept: Department;
  childrenOf: (parentId: string) => Department[];
  selected: string | null;
  onSelect: (id: string) => void;
  depth: number;
}) {
  const kids = childrenOf(dept.id);
  return (
    <>
      <div
        className={`flex items-center gap-1 px-2 py-1 rounded text-sm cursor-pointer mb-0.5 ${
          selected === dept.id
            ? 'bg-blue-50 text-blue-700 font-medium'
            : 'hover:bg-[var(--color-surface-hover)] text-[var(--color-text)]'
        }`}
        style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
        onClick={() => onSelect(dept.id)}
      >
        <span className="truncate" title={dept.name}>{dept.name}</span>
      </div>
      {kids.map((k) => (
        <DeptNode
          key={k.id}
          dept={k}
          childrenOf={childrenOf}
          selected={selected}
          onSelect={onSelect}
          depth={depth + 1}
        />
      ))}
    </>
  );
}

function AllUserList({
  users,
  search,
  selectedUserId,
  onSelect,
  deptMap,
}: {
  users: User[];
  search: string;
  selectedUserId: string | null;
  onSelect: (id: string) => void;
  deptMap: Map<string, string>;
}) {
  const filtered = useMemo(() => {
    if (!search) return users;
    const q = search.toLowerCase();
    return users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [users, search]);
  return (
    <ul className="divide-y max-h-[70vh] overflow-y-auto">
      {filtered.map((u) => (
        <UserRow
          key={u.id}
          user={u}
          deptMap={deptMap}
          selected={selectedUserId === u.id}
          onClick={() => onSelect(u.id)}
        />
      ))}
      {filtered.length === 0 && (
        <li className="p-4 text-sm text-[var(--color-text-muted)] text-center">검색 결과 없음</li>
      )}
    </ul>
  );
}

function DeptUserList({
  deptId,
  allUsers,
  search,
  selectedUserId,
  onSelect,
}: {
  deptId: string;
  allUsers: User[];
  search: string;
  selectedUserId: string | null;
  onSelect: (id: string) => void;
}) {
  const { data, isLoading } = useDepartmentMembers(deptId);
  const members = data?.items ?? [];
  const userMap = useMemo(() => {
    const m = new Map<string, User>();
    for (const u of allUsers) m.set(u.id, u);
    return m;
  }, [allUsers]);
  const enriched = useMemo(() => {
    let list = members.map((m) => userMap.get(m.user_id)).filter((u): u is User => !!u);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    }
    return list;
  }, [members, userMap, search]);
  if (isLoading) return <div className="p-4"><Spinner /></div>;
  return (
    <ul className="divide-y max-h-[70vh] overflow-y-auto">
      {enriched.map((u) => (
        <UserRow
          key={u.id}
          user={u}
          deptMap={new Map()}
          selected={selectedUserId === u.id}
          onClick={() => onSelect(u.id)}
        />
      ))}
      {enriched.length === 0 && (
        <li className="p-4 text-sm text-[var(--color-text-muted)] text-center">부서원 없음</li>
      )}
    </ul>
  );
}

function UserRow({
  user,
  deptMap,
  selected,
  onClick,
}: {
  user: User;
  deptMap: Map<string, string>;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-[var(--color-surface-hover)] ${
          selected ? 'bg-blue-50' : ''
        }`}
      >
        <div className="w-7 h-7 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center flex-shrink-0">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>{user.name}</div>
          <div className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{user.email}</div>
        </div>
        {user.roles?.map((r) => (
          <Badge key={r} className={roleClass(r)}>{r}</Badge>
        ))}
        {!user.active && <span className="text-xs text-red-500">비활성</span>}
        {user.department_ids?.length > 0 && deptMap.size > 0 && (
          <span className="text-xs text-[var(--color-text-muted)] truncate max-w-[8rem]">
            {user.department_ids.map((id) => deptMap.get(id)).filter(Boolean).join(', ')}
          </span>
        )}
      </button>
    </li>
  );
}

function UserDetail({
  userId,
  allUsers,
  deptMap,
}: {
  userId: string;
  allUsers: User[];
  deptMap: Map<string, string>;
}) {
  const user = allUsers.find((u) => u.id === userId);
  const { data: boardsData, isLoading } = useUserBoards(userId);
  const boards = boardsData?.items ?? [];
  if (!user) return null;
  return (
    <div className="surface-raised p-4 sticky top-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-blue-500 text-white text-sm flex items-center justify-center flex-shrink-0">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="font-semibold truncate" style={{ color: 'var(--color-text)' }}>{user.name}</div>
          <div className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{user.email}</div>
        </div>
      </div>

      <div className="mb-3">
        <div className="text-xs font-semibold uppercase mb-1" style={{ color: 'var(--color-text-muted)' }}>역할</div>
        <div className="flex gap-1 flex-wrap">
          {user.roles?.map((r) => (
            <Badge key={r} className={roleClass(r)}>{r}</Badge>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <div className="text-xs font-semibold uppercase mb-1" style={{ color: 'var(--color-text-muted)' }}>소속 부서</div>
        <div className="text-sm" style={{ color: 'var(--color-text)' }}>
          {user.department_ids?.length ? (
            user.department_ids.map((id) => deptMap.get(id)).filter(Boolean).join(', ')
          ) : (
            <span style={{ color: 'var(--color-text-muted)' }}>없음</span>
          )}
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase mb-1" style={{ color: 'var(--color-text-muted)' }}>
          참여 보드 ({boards.length})
        </div>
        {isLoading && <Spinner />}
        <ul className="space-y-0.5 max-h-[40vh] overflow-y-auto">
          {boards.map((b) => (
            <li key={b.id}>
              <Link
                to={`/boards/${b.id}`}
                className="flex items-center gap-2 px-2 py-1 text-sm rounded hover:bg-[var(--color-surface-hover)]"
                style={{ color: 'var(--color-text)' }}
              >
                <span className="text-xs flex-shrink-0">
                  {b.owner_type === 'personal' ? '👤' : '🏢'}
                </span>
                <span className="flex-1 truncate">{b.title}</span>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{b.bucket}</span>
              </Link>
            </li>
          ))}
          {boards.length === 0 && !isLoading && (
            <li className="text-sm py-2" style={{ color: 'var(--color-text-muted)' }}>참여 보드 없음</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function DepartmentDetail({ deptId }: { deptId: string }) {
  const { data, isLoading } = useDepartmentBoards(deptId);
  const boards = data?.items ?? [];
  return (
    <div className="surface-raised p-4 sticky top-4">
      <div className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--color-text-muted)' }}>
        부서 보드 ({boards.length})
      </div>
      {isLoading && <Spinner />}
      <ul className="space-y-0.5 max-h-[60vh] overflow-y-auto">
        {boards.map((b) => (
          <li key={b.id}>
            <Link
              to={`/boards/${b.id}`}
              className="flex items-center gap-2 px-2 py-1 text-sm rounded hover:bg-[var(--color-surface-hover)]"
              style={{ color: 'var(--color-text)' }}
            >
              <span className="text-xs">🏢</span>
              <span className="flex-1 truncate">{b.title}</span>
            </Link>
          </li>
        ))}
        {boards.length === 0 && !isLoading && (
          <li className="text-sm py-2" style={{ color: 'var(--color-text-muted)' }}>부서 보드 없음</li>
        )}
      </ul>
    </div>
  );
}

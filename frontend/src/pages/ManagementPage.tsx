import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useDepartments, useDepartmentMembers } from '../api/departments';
import { useUsers } from '../api/users';
import { useUserBoards, useDepartmentBoards } from '../api/boards';
import { Spinner } from '../components/Spinner';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import { roleClass } from '../theme/constants';
import type { Department, User } from '../types/api';

type Scope = { kind: 'all' } | { kind: 'department'; deptId: string };

/**
 * Unified management page (renamed from "Directory" per ROLES.md §6).
 *
 * 2-column master view + modal detail:
 *   - Left: scope tree (All people + departments). 14rem rail on `lg`,
 *           collapses above the table on narrower viewports.
 *   - Right: wide user table — more horizontal space than the previous
 *           3-pane layout gave the middle column, which made columns like
 *           roles / departments / email squeeze uncomfortably.
 *   - Click a row → detail modal with the user's profile, dept membership,
 *           and board memberships.
 *   - Click a department header in the scope tree → table filters to that
 *           department's members. A "dept detail" modal opens via the
 *           "View details" button next to the scope title.
 */
export default function ManagementPage() {
  const { t } = useTranslation();
  const { data: deptsData, isLoading: deptsLoading } = useDepartments();
  const { data: usersData, isLoading: usersLoading } = useUsers();
  const [scope, setScope] = useState<Scope>({ kind: 'all' });
  const [detail, setDetail] = useState<
    { kind: 'user'; userId: string } | { kind: 'department'; deptId: string } | null
  >(null);
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

  const selectedDept =
    scope.kind === 'department' ? departments.find((d) => d.id === scope.deptId) : null;

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-6 md:py-8">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>
          {t('management.title', '관리')}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
          {t('management.subtitle', '사용자, 부서, 보드 통합 관리')}
        </p>
      </div>

      {(deptsLoading || usersLoading) && <Spinner />}

      {/* Master view: scope tree (left rail) + wide user table (main).
          Below `lg` they stack so the table gets the full viewport width.
          Click a row → detail modal; no squeezed side panel fighting the
          table for horizontal space. */}
      <div className="grid gap-4 lg:gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
        {/* Scope tree */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="surface-raised p-3">
            <h2
              className="text-[11px] font-semibold uppercase tracking-wider mb-2"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {t('management.scope', '범위')}
            </h2>
            <ScopeButton
              label={t('management.allPeople', '전체 사용자')}
              count={allUsers.length}
              active={scope.kind === 'all'}
              onClick={() => setScope({ kind: 'all' })}
            />
            <div className="my-1.5" style={{ borderTop: '1px solid var(--color-border-light)' }} />
            {roots.map((dept) => (
              <DeptNode
                key={dept.id}
                dept={dept}
                childrenOf={childrenOf}
                selected={scope.kind === 'department' ? scope.deptId : null}
                onSelect={(id) => setScope({ kind: 'department', deptId: id })}
                depth={0}
              />
            ))}
          </div>
        </aside>

        {/* User table */}
        <section className="min-w-0">
          <div className="surface-raised overflow-hidden">
            <div
              className="flex flex-wrap items-center gap-2 px-4 py-3"
              style={{ borderBottom: '1px solid var(--color-border)' }}
            >
              <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                {selectedDept
                  ? selectedDept.name
                  : t('management.allPeople', '전체 사용자')}
              </h2>
              {selectedDept && (
                <button
                  onClick={() => setDetail({ kind: 'department', deptId: selectedDept.id })}
                  className="text-xs hover:underline"
                  style={{ color: 'var(--color-primary)' }}
                >
                  {t('management.deptDetails', '부서 상세 →')}
                </button>
              )}
              <input
                type="text"
                placeholder={t('management.searchPlaceholder', '이름 또는 이메일')}
                className="ml-auto rounded-md px-3 py-1.5 text-sm outline-none focus:ring-2 w-full sm:w-64"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {scope.kind === 'department' ? (
              <DeptUserTable
                deptId={scope.deptId}
                allUsers={allUsers}
                deptMap={deptMap}
                search={search}
                onSelect={(userId) => setDetail({ kind: 'user', userId })}
              />
            ) : (
              <UserTable
                users={allUsers}
                deptMap={deptMap}
                search={search}
                onSelect={(userId) => setDetail({ kind: 'user', userId })}
              />
            )}
          </div>
        </section>
      </div>

      {/* Detail modal — opens on row click, overlays the table */}
      {detail?.kind === 'user' && (
        <Modal
          title={allUsers.find((u) => u.id === detail.userId)?.name ?? ''}
          onClose={() => setDetail(null)}
          width="max-w-xl"
        >
          <UserDetailBody
            userId={detail.userId}
            allUsers={allUsers}
            deptMap={deptMap}
          />
        </Modal>
      )}
      {detail?.kind === 'department' && (
        <Modal
          title={deptMap.get(detail.deptId) ?? t('management.departmentDetail', '부서')}
          onClose={() => setDetail(null)}
          width="max-w-xl"
        >
          <DepartmentDetailBody deptId={detail.deptId} />
        </Modal>
      )}
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
      className="flex items-center gap-1.5 px-2 py-1.5 rounded text-sm cursor-pointer mb-1 hover:bg-[var(--color-surface-hover)]"
      style={{
        backgroundColor: active ? 'var(--color-primary-light)' : undefined,
        color: active ? 'var(--color-primary-text)' : 'var(--color-text)',
        fontWeight: active ? 600 : 400,
      }}
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
        className="flex items-center gap-1 px-2 py-1 rounded text-sm cursor-pointer mb-0.5 hover:bg-[var(--color-surface-hover)]"
        style={{
          paddingLeft: `${0.5 + depth * 0.75}rem`,
          backgroundColor: selected === dept.id ? 'var(--color-primary-light)' : undefined,
          color: selected === dept.id ? 'var(--color-primary-text)' : 'var(--color-text)',
          fontWeight: selected === dept.id ? 600 : 400,
        }}
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

function UserTable({
  users,
  deptMap,
  search,
  onSelect,
}: {
  users: User[];
  deptMap: Map<string, string>;
  search: string;
  onSelect: (id: string) => void;
}) {
  const filtered = useMemo(() => {
    if (!search) return users;
    const q = search.toLowerCase();
    return users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [users, search]);
  return <UserTableBody rows={filtered} deptMap={deptMap} onSelect={onSelect} />;
}

function DeptUserTable({
  deptId,
  allUsers,
  deptMap,
  search,
  onSelect,
}: {
  deptId: string;
  allUsers: User[];
  deptMap: Map<string, string>;
  search: string;
  onSelect: (id: string) => void;
}) {
  const { data, isLoading } = useDepartmentMembers(deptId);
  const members = data?.items ?? [];
  const userMap = useMemo(() => {
    const m = new Map<string, User>();
    for (const u of allUsers) m.set(u.id, u);
    return m;
  }, [allUsers]);
  const rows = useMemo(() => {
    let list = members.map((m) => userMap.get(m.user_id)).filter((u): u is User => !!u);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    }
    return list;
  }, [members, userMap, search]);
  if (isLoading) return <div className="p-4"><Spinner /></div>;
  return <UserTableBody rows={rows} deptMap={deptMap} onSelect={onSelect} />;
}

function UserTableBody({
  rows,
  deptMap,
  onSelect,
}: {
  rows: User[];
  deptMap: Map<string, string>;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (rows.length === 0) {
    return (
      <div className="p-6 text-sm text-center" style={{ color: 'var(--color-text-muted)' }}>
        {t('management.empty', '결과 없음')}
      </div>
    );
  }
  return (
    <table className="w-full min-w-[720px] text-sm">
      <thead style={{ backgroundColor: 'var(--color-surface-hover)' }}>
        <tr>
          {[
            t('management.colName', '이름'),
            t('management.colEmail', '이메일'),
            t('management.colDepts', '부서'),
            t('management.colRoles', '역할'),
            t('management.colStatus', '상태'),
          ].map((h) => (
            <th
              key={h}
              className="px-4 py-2.5 text-left font-medium text-xs uppercase tracking-wider"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y" style={{ backgroundColor: 'var(--color-surface)' }}>
        {rows.map((u) => (
          <tr
            key={u.id}
            onClick={() => onSelect(u.id)}
            className="cursor-pointer hover:bg-[var(--color-surface-hover)]"
          >
            <td className="px-4 py-2.5">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-7 h-7 rounded-full text-xs flex items-center justify-center flex-shrink-0 font-semibold"
                  style={{
                    backgroundColor: 'var(--color-primary)',
                    color: 'var(--color-text-inverse)',
                  }}
                >
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <span className="font-medium" style={{ color: 'var(--color-text)' }}>{u.name}</span>
              </div>
            </td>
            <td className="px-4 py-2.5" style={{ color: 'var(--color-text-secondary)' }}>{u.email}</td>
            <td className="px-4 py-2.5">
              {u.department_ids?.length ? (
                <div className="flex flex-wrap gap-1">
                  {u.department_ids.map((id) => {
                    const name = deptMap.get(id);
                    if (!name) return null;
                    return (
                      <Badge key={id} variant="neutral">
                        {name}
                      </Badge>
                    );
                  })}
                </div>
              ) : (
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>-</span>
              )}
            </td>
            <td className="px-4 py-2.5">
              <div className="flex flex-wrap gap-1">
                {u.roles?.map((r) => (
                  <Badge key={r} className={roleClass(r)}>{r}</Badge>
                ))}
              </div>
            </td>
            <td className="px-4 py-2.5">
              <Badge variant={u.active ? 'success' : 'neutral'}>
                {u.active ? t('common.active', '활성') : t('common.inactive', '비활성')}
              </Badge>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function UserDetailBody({
  userId,
  allUsers,
  deptMap,
}: {
  userId: string;
  allUsers: User[];
  deptMap: Map<string, string>;
}) {
  const { t } = useTranslation();
  const user = allUsers.find((u) => u.id === userId);
  const { data: boardsData, isLoading } = useUserBoards(userId);
  const boards = boardsData?.items ?? [];
  if (!user) return null;
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-12 h-12 rounded-full text-base flex items-center justify-center flex-shrink-0 font-semibold"
          style={{
            backgroundColor: 'var(--color-primary)',
            color: 'var(--color-text-inverse)',
          }}
        >
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="font-semibold truncate" style={{ color: 'var(--color-text)' }}>{user.name}</div>
          <div className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{user.email}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div className="text-xs font-semibold uppercase mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
            {t('management.roles', '역할')}
          </div>
          <div className="flex gap-1 flex-wrap">
            {user.roles?.length ? user.roles.map((r) => (
              <Badge key={r} className={roleClass(r)}>{r}</Badge>
            )) : <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>-</span>}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
            {t('management.departments', '소속 부서')}
          </div>
          <div className="flex gap-1 flex-wrap">
            {user.department_ids?.length ? (
              user.department_ids.map((id) => {
                const name = deptMap.get(id);
                return name ? <Badge key={id} variant="neutral">{name}</Badge> : null;
              })
            ) : <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>-</span>}
          </div>
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
          {t('management.userBoards', '참여 보드')} ({boards.length})
        </div>
        {isLoading && <Spinner />}
        <ul className="space-y-0.5 max-h-[40vh] overflow-y-auto">
          {boards.map((b) => (
            <li key={b.id}>
              <Link
                to={`/boards/${b.id}`}
                className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-[var(--color-surface-hover)]"
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
            <li className="text-sm py-2" style={{ color: 'var(--color-text-muted)' }}>
              {t('management.noBoards', '참여 보드 없음')}
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function DepartmentDetailBody({ deptId }: { deptId: string }) {
  const { t } = useTranslation();
  const { data, isLoading } = useDepartmentBoards(deptId);
  const boards = data?.items ?? [];
  return (
    <div>
      <div className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--color-text-muted)' }}>
        {t('management.deptBoards', '부서 보드')} ({boards.length})
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

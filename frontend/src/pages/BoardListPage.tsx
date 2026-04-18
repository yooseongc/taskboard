import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCreateBoard, useMyBoards, type BoardSummaryWithBucket } from '../api/boards';
import { useDepartments } from '../api/departments';
import { useTemplates } from '../api/templates';
import {
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
  type NotificationSummary,
} from '../api/notifications';
import { useAppConfig } from '../api/config';
import { useToastStore } from '../stores/toastStore';
import { usePermissions } from '../hooks/usePermissions';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import { SkeletonGrid } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import NotificationRow, { notificationHref } from '../components/NotificationRow';

export default function BoardListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useMyBoards('all');
  const { data: appConfig } = useAppConfig();
  const { data: unreadCount } = useUnreadNotificationCount();
  const { data: unreadList } = useNotifications({ unread: true });
  const markRead = useMarkNotificationRead();
  const [showCreate, setShowCreate] = useState(false);
  const { canCreateBoard } = usePermissions();
  const isPersonal = appConfig?.mode === 'personal';

  // Inline search — filters the bucket grid by title/description match.
  // When active, the today-first hero strip still shows so the user can
  // glance at deadlines while narrowing boards.
  const [boardSearch, setBoardSearch] = useState('');

  // ROLES.md §5: 4 buckets — favorites + department + personal + invited.
  // Personal mode collapses to "personal" only (+ optional favorites pin).
  const buckets = useMemo(() => {
    const all = data?.items ?? [];
    const q = boardSearch.trim().toLowerCase();
    const matches = (b: BoardSummaryWithBucket) =>
      !q ||
      b.title.toLowerCase().includes(q) ||
      (b.description ?? '').toLowerCase().includes(q);
    return {
      favorites: all.filter((b) => b.pinned && matches(b)),
      department: isPersonal
        ? []
        : all.filter((b) => b.bucket === 'department' && matches(b)),
      personal: all.filter((b) => b.bucket === 'personal' && matches(b)),
      invited: isPersonal ? [] : all.filter((b) => b.bucket === 'invited' && matches(b)),
    };
  }, [data, isPersonal, boardSearch]);

  const totalBoards = (data?.items ?? []).length;
  const visibleTotal =
    buckets.favorites.length +
    buckets.department.length +
    buckets.personal.length +
    buckets.invited.length;

  // Today attention = unread deadline-related notifications. Drives both
  // the Due-Soon stat card count and the hero list below.
  const deadlineNotifs = useMemo<NotificationSummary[]>(() => {
    const flat = unreadList?.pages.flatMap((p) => p.items) ?? [];
    return flat.filter(
      (n) => n.kind === 'deadline_soon' || n.kind === 'deadline_overdue',
    );
  }, [unreadList]);
  const dueSoonCount = deadlineNotifs.length;
  const unreadTotal = unreadCount?.unread ?? 0;

  const activateNotif = (n: NotificationSummary) => {
    if (!n.read_at) markRead.mutate({ id: n.id, read: true });
    const dest = notificationHref(n);
    if (dest) navigate(dest);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6 py-6 md:py-8">
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>{t('boards.title')}</h1>
          {totalBoards > 0 && (
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{totalBoards} board(s)</p>
          )}
        </div>
        {totalBoards > 0 && (
          <div className="flex-1 min-w-[200px] max-w-md">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={boardSearch}
                onChange={(e) => setBoardSearch(e.target.value)}
                placeholder={t('home.searchPlaceholder')}
                aria-label={t('home.searchPlaceholder')}
                className="w-full rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                }}
              />
            </div>
          </div>
        )}
        {canCreateBoard ? (
          <Button onClick={() => setShowCreate(true)}>{t('boards.newBoard')}</Button>
        ) : (
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Board creation requires Department Admin role
          </span>
        )}
      </div>

      {isLoading && <SkeletonGrid count={6} />}
      {isError && (
        <div className="surface-raised p-5 flex items-center justify-between">
          <div>
            <p className="font-medium" style={{ color: 'var(--color-danger)' }}>
              Failed to load boards.
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Check your network connection or try again.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {data && totalBoards === 0 && (
        <EmptyState
          icon={
            <svg className="w-16 h-16" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
          }
          title="아직 보드가 없습니다"
          description="보드는 팀의 업무를 시각적으로 정리하는 공간입니다. 템플릿으로 빠르게 시작하거나 빈 보드를 만들어보세요."
          action={
            canCreateBoard ? (
              <Button onClick={() => setShowCreate(true)}>첫 보드 만들기</Button>
            ) : (
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                관리자에게 보드 생성을 요청하세요
              </p>
            )
          }
        />
      )}

      {/* Today-first hero — stat strip + "needs attention today" list.
          Only when the user already has boards; a newcomer's home still
          focuses on the EmptyState above. */}
      {data && totalBoards > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <StatCard
              label={t('home.statDueSoon')}
              value={dueSoonCount}
              tone={dueSoonCount > 0 ? 'danger' : 'neutral'}
              icon={<ClockIcon />}
              to="/notifications"
            />
            <StatCard
              label={t('home.statUnread')}
              value={unreadTotal}
              tone={unreadTotal > 0 ? 'primary' : 'neutral'}
              icon={<BellIcon />}
              to="/notifications"
            />
            <StatCard
              label={t('home.statBoards')}
              value={totalBoards}
              tone="neutral"
              icon={<GridIcon />}
            />
          </div>

          <TodayAttention
            notifications={deadlineNotifs}
            onActivate={activateNotif}
          />
        </>
      )}

      {/* Bucket grid — filtered by the inline search when the query is set.
          ROLES.md §5: 4 sections (fav + dept + personal + invited); personal
          mode collapses to 2. */}
      {boardSearch.trim() && visibleTotal === 0 ? (
        <div
          className="text-center py-10 rounded-lg"
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-muted)',
          }}
        >
          {t('home.searchEmpty')}
        </div>
      ) : (
        <>
          <BucketSection label={t('boards.bucket.favorites', '★ 즐겨찾기')} boards={buckets.favorites} />
          {!isPersonal && (
            <BucketSection label={t('boards.bucket.department', '부서 보드')} boards={buckets.department} />
          )}
          <BucketSection label={t('boards.bucket.personal', '개인 보드')} boards={buckets.personal} />
          {!isPersonal && (
            <BucketSection label={t('boards.bucket.invited', '초대받은 보드')} boards={buckets.invited} />
          )}
        </>
      )}

      {showCreate && (
        <CreateBoardModal onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Today-first hero — stat strip + "needs attention" list.
// ---------------------------------------------------------------------------

type StatTone = 'neutral' | 'primary' | 'danger';

function StatCard({
  label,
  value,
  tone,
  icon,
  to,
}: {
  label: string;
  value: number;
  tone: StatTone;
  icon: React.ReactNode;
  to?: string;
}) {
  // Tone palette: danger when there's something that needs attention,
  // primary for general unread, neutral otherwise. The icon circle picks
  // up the tone so the card reads at a glance.
  const ringVar = tone === 'danger'
    ? 'var(--tag-danger-bg)'
    : tone === 'primary'
      ? 'var(--color-primary-light)'
      : 'var(--color-surface-hover)';
  const iconColor = tone === 'danger'
    ? 'var(--tag-danger-text)'
    : tone === 'primary'
      ? 'var(--color-primary-text)'
      : 'var(--color-text-muted)';

  const content = (
    <div
      className="flex items-center gap-3 p-4 rounded-lg h-full"
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div
        className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
        style={{ backgroundColor: ringVar, color: iconColor }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="text-2xl font-bold tabular-nums leading-none"
          style={{ color: 'var(--color-text)' }}
        >
          {value}
        </div>
        <div
          className="mt-1 text-xs"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {label}
        </div>
      </div>
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="block hover:shadow-sm transition-shadow">
        {content}
      </Link>
    );
  }
  return content;
}

function TodayAttention({
  notifications,
  onActivate,
}: {
  notifications: NotificationSummary[];
  onActivate: (n: NotificationSummary) => void;
}) {
  const { t } = useTranslation();
  // Cap the hero list — deeper inspection goes to /notifications. Five
  // rows is enough to cover "what's on my plate today" without pushing
  // the board grid below the fold on most laptops.
  const top = notifications.slice(0, 5);
  return (
    <div className="mb-8">
      <h2
        className="text-xs font-semibold uppercase tracking-wider mb-3"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {t('home.todayTitle')}
      </h2>
      <div
        className="rounded-lg overflow-hidden"
        style={{
          border: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-surface)',
        }}
      >
        {top.length === 0 ? (
          <div className="px-5 py-6 text-center">
            <div
              className="text-sm font-medium"
              style={{ color: 'var(--color-text)' }}
            >
              {t('home.todayEmpty')}
            </div>
            <div
              className="mt-1 text-xs"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {t('home.todayEmptyHint')}
            </div>
          </div>
        ) : (
          <>
            {top.map((n) => (
              <NotificationRow
                key={n.id}
                notification={n}
                onActivate={() => onActivate(n)}
                compact
              />
            ))}
            {notifications.length > top.length && (
              <div
                className="px-3 py-2 text-center"
                style={{ borderTop: '1px solid var(--color-border)' }}
              >
                <Link
                  to="/notifications"
                  className="text-xs"
                  style={{ color: 'var(--color-primary)' }}
                >
                  {t('notifications.viewAll')} →
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2" />
    </svg>
  );
}
function BellIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}
function GridIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h3v6H4V6zm0 8h5v6H6a2 2 0 01-2-2v-4zm11-10h3a2 2 0 012 2v4h-5V4zm0 8h5v6a2 2 0 01-2 2h-3v-8z" />
    </svg>
  );
}

function BucketSection({
  label,
  boards,
}: {
  label: string;
  boards: BoardSummaryWithBucket[];
}) {
  if (boards.length === 0) return null;
  return (
    <div className="mb-8">
      <h2 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
        {label} <span className="font-normal opacity-60">({boards.length})</span>
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {boards.map((board) => (
          <BoardCard key={board.id} board={board} />
        ))}
      </div>
    </div>
  );
}

function BoardCard({ board }: { board: BoardSummaryWithBucket }) {
  // Compact assignee stack: up to 3 initial circles, overlapping so a dense
  // board still fits in the card footer. The `+N` chip absorbs the rest.
  const assigneeOverflow = Math.max(
    0,
    (board.top_assignees?.length ?? 0) - 3,
  );
  return (
    <Link
      to={`/boards/${board.id}`}
      className="block surface-raised p-5 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start gap-2">
        <span className="text-base">{board.owner_type === 'personal' ? '👤' : '🏢'}</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold">
            {board.pinned && <span className="mr-1" style={{ color: '#fbbf24' }}>★</span>}
            {board.title}
          </h3>
          {board.description && (
            <p className="mt-1.5 text-sm text-[var(--color-text-secondary)] line-clamp-2">
              {board.description}
            </p>
          )}
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
              style={{
                backgroundColor: 'var(--color-surface-hover)',
                color: 'var(--color-text-secondary)',
              }}
              title={`${board.open_task_count} open tasks`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              {board.open_task_count} open
            </span>
            {board.top_assignees && board.top_assignees.length > 0 && (
              <div className="flex items-center">
                <div className="flex -space-x-1.5">
                  {board.top_assignees.slice(0, 3).map((a) => (
                    <span
                      key={a.user_id}
                      title={a.name}
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                      style={{
                        backgroundColor: paletteFromId(a.user_id),
                        color: '#ffffff',
                        boxShadow: '0 0 0 2px var(--color-surface-raised)',
                      }}
                    >
                      {a.name.charAt(0).toUpperCase()}
                    </span>
                  ))}
                </div>
                {assigneeOverflow > 0 && (
                  <span
                    className="ml-1.5 text-xs"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    +{assigneeOverflow}
                  </span>
                )}
              </div>
            )}
            <span
              className="ml-auto text-xs"
              style={{ color: 'var(--color-text-muted)' }}
              title={new Date(board.updated_at).toLocaleString()}
            >
              {new Date(board.updated_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// Same palette function used by groupBy — deterministic color per user id.
// Inlined here to avoid importing the larger groupBy module on this page.
function paletteFromId(id: string): string {
  const palette = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b',
    '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function CreateBoardModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ownerType, setOwnerType] = useState<'department' | 'personal'>('personal');
  const [departmentId, setDepartmentId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const createBoard = useCreateBoard();
  const { data: depts } = useDepartments();
  const { data: templates } = useTemplates();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);

  const departments = depts?.items ?? [];
  const sorted = [...departments].sort((a, b) => a.path.localeCompare(b.path));

  const canSubmit = title.trim() && (ownerType === 'personal' || !!departmentId);

  const handleCreate = () => {
    if (!canSubmit) return;
    const body: Parameters<typeof createBoard.mutate>[0] = {
      title,
      owner_type: ownerType,
      department_ids: ownerType === 'department' ? [departmentId] : [],
    };
    if (description) body.description = description;
    if (templateId) body.from_template = templateId;

    createBoard.mutate(body, {
      onSuccess: (board) => {
        addToast('success', t('boards.created'));
        onClose();
        navigate(`/boards/${board.id}`);
      },
      onError: () =>
        addToast('error', t('errors.boardCreateFailed', { title }), {
          action: { label: t('errors.retry'), onClick: handleCreate },
        }),
    });
  };

  return (
    <Modal
      title="Create New Board"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!canSubmit || createBoard.isPending}
          >
            {createBoard.isPending ? 'Creating...' : 'Create Board'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Board ownership type — ROLES.md §2 */}
        <div>
          <label
            className="block text-sm font-medium mb-2"
            style={{ color: 'var(--color-text)' }}
          >
            보드 종류
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setOwnerType('personal')}
              className="p-3 rounded-lg text-left transition-all"
              style={{
                border: `2px solid ${ownerType === 'personal' ? 'var(--color-primary)' : 'var(--color-border)'}`,
                backgroundColor: ownerType === 'personal' ? 'var(--color-surface-active)' : 'var(--color-surface)',
              }}
            >
              <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>👤 개인 보드</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                나만 관리, 멤버 초대 가능
              </div>
            </button>
            <button
              type="button"
              onClick={() => setOwnerType('department')}
              className="p-3 rounded-lg text-left transition-all"
              style={{
                border: `2px solid ${ownerType === 'department' ? 'var(--color-primary)' : 'var(--color-border)'}`,
                backgroundColor: ownerType === 'department' ? 'var(--color-surface-active)' : 'var(--color-surface)',
              }}
            >
              <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>🏢 부서 보드</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                부서 전체에 공유
              </div>
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>
            제목 *
          </label>
          <input
            autoFocus
            className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
            style={{
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
            }}
            placeholder="보드 이름"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>
            설명
          </label>
          <textarea
            className="w-full rounded-lg px-3 py-2 text-sm min-h-[60px] outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
            style={{
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
            }}
            placeholder="(선택)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {ownerType === 'department' && (
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>
              부서 *
            </label>
            <select
              className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
              style={{
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
              }}
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              <option value="">부서 선택...</option>
              {sorted.map((d) => (
                <option key={d.id} value={d.id}>
                  {'\u00A0'.repeat(d.depth * 3)}{d.depth > 0 ? '└ ' : ''}{d.name}
                </option>
              ))}
            </select>
            {!departmentId && (
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                부서 보드는 부서가 필요합니다.
              </p>
            )}
          </div>
        )}
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>
            From Template
          </label>
          <select
            className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
            style={{
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
            }}
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            <option value="">No template</option>
            {(templates?.items ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  );
}

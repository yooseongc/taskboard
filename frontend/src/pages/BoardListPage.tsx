import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useBoards, useCreateBoard } from '../api/boards';
import { useDepartments } from '../api/departments';
import { useTemplates } from '../api/templates';
import { useToastStore } from '../stores/toastStore';
import { usePermissions } from '../hooks/usePermissions';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import { SkeletonGrid } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import type { Board } from '../types/api';

export default function BoardListPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useBoards();
  const { data: deptsData } = useDepartments();
  const [showCreate, setShowCreate] = useState(false);
  const { canCreateBoard } = usePermissions();

  const departments = deptsData?.items ?? [];
  const deptMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of departments) m.set(d.id, d.name);
    return m;
  }, [departments]);

  // Group boards by their first department
  const grouped = useMemo(() => {
    const boards = data?.items ?? [];
    const groups = new Map<string, { name: string; boards: Board[] }>();
    const ungrouped: Board[] = [];

    for (const board of boards) {
      const deptId = board.department_ids?.[0];
      if (deptId && deptMap.has(deptId)) {
        const existing = groups.get(deptId);
        if (existing) {
          existing.boards.push(board);
        } else {
          groups.set(deptId, { name: deptMap.get(deptId)!, boards: [board] });
        }
      } else {
        ungrouped.push(board);
      }
    }

    return { groups: [...groups.values()], ungrouped };
  }, [data, deptMap]);

  const totalBoards = (data?.items ?? []).length;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>{t('boards.title')}</h1>
          {totalBoards > 0 && (
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{totalBoards} board(s)</p>
          )}
        </div>
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

      {/* Grouped by department */}
      {grouped.groups.map((group) => (
        <div key={group.name} className="mb-8">
          <h2 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
            {group.name}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.boards.map((board) => (
              <BoardCard key={board.id} board={board} />
            ))}
          </div>
        </div>
      ))}
      {grouped.ungrouped.length > 0 && (
        <div className="mb-8">
          {grouped.groups.length > 0 && (
            <h2 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
              Other
            </h2>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {grouped.ungrouped.map((board) => (
              <BoardCard key={board.id} board={board} />
            ))}
          </div>
        </div>
      )}

      {showCreate && (
        <CreateBoardModal onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}

function BoardCard({ board }: { board: Board }) {
  return (
    <Link
      to={`/boards/${board.id}`}
      className="block surface-raised p-5 hover:shadow-md transition-shadow"
    >
      <h3 className="text-base font-semibold">{board.title}</h3>
      {board.description && (
        <p className="mt-1.5 text-sm text-[var(--color-text-secondary)] line-clamp-2">
          {board.description}
        </p>
      )}
      <div className="mt-3 text-xs text-[var(--color-text-muted)]">
        v{board.version} &middot;{' '}
        {new Date(board.created_at).toLocaleDateString()}
      </div>
    </Link>
  );
}

function CreateBoardModal({ onClose }: { onClose: () => void }) {
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
        addToast('success', 'Board created');
        onClose();
        navigate(`/boards/${board.id}`);
      },
      onError: () =>
        addToast('error', `Failed to create board "${title}"`, {
          action: { label: 'Retry', onClick: handleCreate },
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
          <label className="block text-sm font-medium text-gray-700 mb-2">
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
          <label className="block text-sm font-medium text-gray-700 mb-1">
            제목 *
          </label>
          <input
            autoFocus
            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="보드 이름"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            설명
          </label>
          <textarea
            className="w-full border rounded-lg px-3 py-2 text-sm min-h-[60px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="(선택)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {ownerType === 'department' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              부서 *
            </label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                부서 보드는 부서가 필요합니다.
              </p>
            )}
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            From Template
          </label>
          <select
            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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

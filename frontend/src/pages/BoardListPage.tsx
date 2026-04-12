import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBoards, useCreateBoard } from '../api/boards';
import { useDepartments } from '../api/departments';
import { useTemplates } from '../api/templates';
import { Spinner } from '../components/Spinner';
import { useToastStore } from '../stores/toastStore';
import { usePermissions } from '../hooks/usePermissions';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import type { Board } from '../types/api';

export default function BoardListPage() {
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
          <h1 className="text-2xl font-bold">My Boards</h1>
          {totalBoards > 0 && (
            <p className="text-sm text-gray-400 mt-0.5">{totalBoards} board(s)</p>
          )}
        </div>
        {canCreateBoard ? (
          <Button onClick={() => setShowCreate(true)}>+ New Board</Button>
        ) : (
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Board creation requires Department Admin role
          </span>
        )}
      </div>

      {isLoading && <Spinner />}
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
        <p className="text-center text-gray-400 py-12">
          No boards yet. Create one to get started.
        </p>
      )}

      {/* Grouped by department */}
      {grouped.groups.map((group) => (
        <div key={group.name} className="mb-8">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
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
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
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
      className="block rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
    >
      <h3 className="text-base font-semibold">{board.title}</h3>
      {board.description && (
        <p className="mt-1.5 text-sm text-gray-500 line-clamp-2">
          {board.description}
        </p>
      )}
      <div className="mt-3 text-xs text-gray-400">
        v{board.version} &middot;{' '}
        {new Date(board.created_at).toLocaleDateString()}
      </div>
    </Link>
  );
}

function CreateBoardModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const createBoard = useCreateBoard();
  const { data: depts } = useDepartments();
  const { data: templates } = useTemplates();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);

  const departments = depts?.items ?? [];
  const sorted = [...departments].sort((a, b) => a.path.localeCompare(b.path));

  const handleCreate = () => {
    if (!title.trim() || !departmentId) return;
    const body: Parameters<typeof createBoard.mutate>[0] = {
      title,
      department_ids: [departmentId],
    };
    if (description) body.description = description;
    if (templateId) body.from_template = templateId;

    createBoard.mutate(body, {
      onSuccess: (board) => {
        addToast('success', 'Board created');
        onClose();
        navigate(`/boards/${board.id}`);
      },
      onError: () => addToast('error', 'Failed to create board'),
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
            disabled={!title.trim() || !departmentId || createBoard.isPending}
          >
            {createBoard.isPending ? 'Creating...' : 'Create Board'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Title *
          </label>
          <input
            autoFocus
            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="Board title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            className="w-full border rounded-lg px-3 py-2 text-sm min-h-[60px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="Optional description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Department *
          </label>
          <select
            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
          >
            <option value="">Select department...</option>
            {sorted.map((d) => (
              <option key={d.id} value={d.id}>
                {'\u00A0'.repeat(d.depth * 3)}{d.depth > 0 ? '└ ' : ''}{d.name}
              </option>
            ))}
          </select>
          {!departmentId && (
            <p className="text-xs text-gray-400 mt-1">
              A department is required.
            </p>
          )}
        </div>
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

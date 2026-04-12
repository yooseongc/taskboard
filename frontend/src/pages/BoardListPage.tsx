import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBoards, useCreateBoard } from '../api/boards';
import { useDepartments } from '../api/departments';
import { useTemplates } from '../api/templates';
import { Spinner } from '../components/Spinner';
import { useToastStore } from '../stores/toastStore';
import { usePermissions } from '../hooks/usePermissions';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';

export default function BoardListPage() {
  const { data, isLoading, isError } = useBoards();
  const [showCreate, setShowCreate] = useState(false);
  const { canCreateBoard } = usePermissions();

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">My Boards</h1>
        {canCreateBoard && (
          <Button onClick={() => setShowCreate(true)}>+ New Board</Button>
        )}
      </div>

      {isLoading && <Spinner />}
      {isError && <p className="text-red-500">Failed to load boards.</p>}
      {data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((board) => (
            <Link
              key={board.id}
              to={`/boards/${board.id}`}
              className="block rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <h2 className="text-base font-semibold">{board.title}</h2>
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
          ))}
          {data.items.length === 0 && (
            <p className="col-span-full text-center text-gray-400 py-12">
              No boards yet. Create one to get started.
            </p>
          )}
        </div>
      )}

      {showCreate && (
        <CreateBoardModal onClose={() => setShowCreate(false)} />
      )}
    </div>
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

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBoards, useCreateBoard } from '../api/boards';
import { useDepartments } from '../api/departments';
import { useTemplates } from '../api/templates';
import { Spinner } from '../components/Spinner';
import { useToastStore } from '../stores/toastStore';

export default function BoardListPage() {
  const { data, isLoading, isError } = useBoards();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">My Boards</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          + New Board
        </button>
      </div>

      {isLoading && <Spinner />}
      {isError && <p className="text-red-500">Failed to load boards.</p>}
      {data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((board) => (
            <Link
              key={board.id}
              to={`/boards/${board.id}`}
              className="block rounded-lg border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <h2 className="text-lg font-semibold">{board.title}</h2>
              {board.description && (
                <p className="mt-2 text-sm text-gray-500 line-clamp-2">
                  {board.description}
                </p>
              )}
              <div className="mt-4 text-xs text-gray-400">
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

  const handleCreate = () => {
    if (!title.trim()) return;
    const body: Parameters<typeof createBoard.mutate>[0] = { title };
    if (description) body.description = description;
    if (departmentId) body.department_ids = [departmentId];
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
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
          <h2 className="text-lg font-semibold mb-4">Create New Board</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title *
              </label>
              <input
                autoFocus
                className="w-full border rounded-lg px-3 py-2 text-sm"
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
                className="w-full border rounded-lg px-3 py-2 text-sm min-h-[60px]"
                placeholder="Optional description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Department
              </label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
              >
                <option value="">None</option>
                {(depts?.items ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                From Template
              </label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
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

          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!title.trim() || createBoard.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {createBoard.isPending ? 'Creating...' : 'Create Board'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

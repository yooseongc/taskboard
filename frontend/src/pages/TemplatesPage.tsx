import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useTemplates,
  useCreateTemplate,
  useDeleteTemplate,
} from '../api/templates';
import { useCreateBoard } from '../api/boards';
import { Spinner } from '../components/Spinner';
import { useToastStore } from '../stores/toastStore';
import type { TemplateSnapshot } from '../types/api';

export default function TemplatesPage() {
  const { data, isLoading } = useTemplates();
  const deleteTemplate = useDeleteTemplate();
  const createBoard = useCreateBoard();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const [showCreate, setShowCreate] = useState(false);

  const handleUseTemplate = (templateId: string, templateTitle: string) => {
    createBoard.mutate(
      {
        title: `${templateTitle} Board`,
        from_template: templateId,
      },
      {
        onSuccess: (board) => {
          addToast('success', 'Board created from template');
          navigate(`/boards/${board.id}`);
        },
        onError: () => addToast('error', 'Failed to create board'),
      },
    );
  };

  const handleDelete = (id: string) => {
    deleteTemplate.mutate(id, {
      onSuccess: () => addToast('success', 'Template deleted'),
      onError: () => addToast('error', 'Failed to delete template'),
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Templates</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          + New Template
        </button>
      </div>

      {isLoading && <Spinner />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(data?.items ?? []).map((tmpl) => (
          <div
            key={tmpl.id}
            className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
          >
            <h2 className="text-lg font-semibold">{tmpl.title}</h2>
            {tmpl.description && (
              <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                {tmpl.description}
              </p>
            )}

            {/* Snapshot preview */}
            <div className="mt-3 text-xs text-gray-400">
              {tmpl.snapshot.columns.length} column(s)
              {tmpl.snapshot.default_tasks.length > 0 &&
                `, ${tmpl.snapshot.default_tasks.length} task(s)`}
              {tmpl.snapshot.labels.length > 0 &&
                `, ${tmpl.snapshot.labels.length} label(s)`}
            </div>

            <div className="mt-2 flex flex-wrap gap-1">
              {tmpl.snapshot.columns.map((col, i) => (
                <span
                  key={i}
                  className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded"
                >
                  {col.title}
                </span>
              ))}
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => handleUseTemplate(tmpl.id, tmpl.title)}
                disabled={createBoard.isPending}
                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                Use Template
              </button>
              <button
                onClick={() => handleDelete(tmpl.id)}
                className="px-3 py-1.5 text-sm text-red-500 hover:text-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        ))}

        {data && data.items.length === 0 && (
          <p className="col-span-full text-center text-gray-400 py-12">
            No templates yet.
          </p>
        )}
      </div>

      {showCreate && (
        <CreateTemplateModal onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}

function CreateTemplateModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [columnsText, setColumnsText] = useState('To Do, In Progress, Done');
  const createTemplate = useCreateTemplate();
  const addToast = useToastStore((s) => s.addToast);

  const handleCreate = () => {
    if (!title.trim()) return;

    const columns = columnsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const snapshot: TemplateSnapshot = {
      columns: columns.map((c, i) => ({ title: c, position: i })),
      labels: [],
      default_tasks: [],
    };

    createTemplate.mutate(
      {
        title,
        description: description || undefined,
        snapshot,
      },
      {
        onSuccess: () => {
          addToast('success', 'Template created');
          onClose();
        },
        onError: () => addToast('error', 'Failed to create template'),
      },
    );
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
          <h2 className="text-lg font-semibold mb-4">Create Template</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title *
              </label>
              <input
                autoFocus
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="Template title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                className="w-full border rounded-lg px-3 py-2 text-sm min-h-[60px]"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Columns (comma-separated)
              </label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={columnsText}
                onChange={(e) => setColumnsText(e.target.value)}
                placeholder="To Do, In Progress, Done"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!title.trim() || createTemplate.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {createTemplate.isPending ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

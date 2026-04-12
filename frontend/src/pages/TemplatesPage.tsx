import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useTemplates,
  useCreateTemplate,
  useDeleteTemplate,
  type TemplateDto,
} from '../api/templates';
import { useCreateBoard } from '../api/boards';
import { Spinner } from '../components/Spinner';
import { useToastStore } from '../stores/toastStore';
import { usePermissions } from '../hooks/usePermissions';

export default function TemplatesPage() {
  const { data, isLoading } = useTemplates();
  const deleteTemplate = useDeleteTemplate();
  const createBoard = useCreateBoard();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const [showCreate, setShowCreate] = useState(false);
  const { canCreateTemplate, canCreateBoard } = usePermissions();

  const handleUseTemplate = (tmpl: TemplateDto) => {
    createBoard.mutate(
      {
        title: `${tmpl.name} Board`,
        from_template: tmpl.id,
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

  const getColumns = (tmpl: TemplateDto): string[] => {
    const p = tmpl.payload as Record<string, unknown>;
    const cols = p?.columns;
    if (Array.isArray(cols)) {
      return cols.map((c: unknown) => {
        if (typeof c === 'object' && c !== null && 'title' in c) {
          return (c as { title: string }).title;
        }
        return String(c);
      });
    }
    return [];
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Templates</h1>
        {canCreateTemplate && (
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          + New Template
        </button>
        )}
      </div>

      {isLoading && <Spinner />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(data?.items ?? []).map((tmpl) => {
          const columns = getColumns(tmpl);
          return (
            <div
              key={tmpl.id}
              className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
            >
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-semibold">{tmpl.name}</h2>
                <span className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                  {tmpl.kind}
                </span>
              </div>
              {tmpl.description && (
                <p className="text-sm text-gray-500 line-clamp-2">
                  {tmpl.description}
                </p>
              )}

              <div className="mt-3 text-xs text-gray-400">
                scope: {tmpl.scope}
                {columns.length > 0 && ` · ${columns.length} column(s)`}
              </div>

              {columns.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {columns.map((col, i) => (
                    <span
                      key={i}
                      className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded"
                    >
                      {col}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex gap-2 mt-4">
                {canCreateBoard && (
                <button
                  onClick={() => handleUseTemplate(tmpl)}
                  disabled={createBoard.isPending}
                  className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  Use Template
                </button>
                )}
                {canCreateTemplate && (
                <button
                  onClick={() => handleDelete(tmpl.id)}
                  className="px-3 py-1.5 text-sm text-red-500 hover:text-red-700"
                >
                  Delete
                </button>
                )}
              </div>
            </div>
          );
        })}

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
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [columnsText, setColumnsText] = useState('To Do, In Progress, Done');
  const createTemplate = useCreateTemplate();
  const addToast = useToastStore((s) => s.addToast);

  const handleCreate = () => {
    if (!name.trim()) return;

    const columns = columnsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    createTemplate.mutate(
      {
        kind: 'board',
        name,
        description: description || undefined,
        scope: 'global',
        payload: {
          columns: columns.map((c, i) => ({ title: c, position: i })),
          labels: [],
          default_tasks: [],
        },
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
                Name *
              </label>
              <input
                autoFocus
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="Template name"
                value={name}
                onChange={(e) => setName(e.target.value)}
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
              disabled={!name.trim() || createTemplate.isPending}
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

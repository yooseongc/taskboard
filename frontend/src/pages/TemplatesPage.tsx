import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useTemplates,
  useCreateTemplate,
  useDeleteTemplate,
  type TemplateDto,
} from '../api/templates';
import { useCreateBoard } from '../api/boards';
import { useDepartments } from '../api/departments';
import { Spinner } from '../components/Spinner';
import { useToastStore } from '../stores/toastStore';
import { usePermissions } from '../hooks/usePermissions';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';

export default function TemplatesPage() {
  const { data, isLoading } = useTemplates();
  const deleteTemplate = useDeleteTemplate();
  const addToast = useToastStore((s) => s.addToast);
  const [showCreate, setShowCreate] = useState(false);
  const [useTemplateTarget, setUseTemplateTarget] = useState<TemplateDto | null>(null);
  const { canCreateTemplate, canCreateBoard } = usePermissions();

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
        {canCreateTemplate && (
          <Button onClick={() => setShowCreate(true)}>+ New Template</Button>
        )}
      </div>

      {isLoading && <Spinner />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(data?.items ?? []).map((tmpl) => {
          const columns = getColumns(tmpl);
          const isGlobal = tmpl.scope === 'global';
          return (
            <div
              key={tmpl.id}
              className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <h2 className="text-base font-semibold">{tmpl.name}</h2>
                <Badge>{tmpl.kind}</Badge>
              </div>
              {tmpl.description && (
                <p className="text-sm text-gray-500 line-clamp-2 mb-3">
                  {tmpl.description}
                </p>
              )}

              {columns.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
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

              <div className="flex gap-2 mt-auto pt-2 border-t border-gray-100">
                {canCreateBoard && (
                  <Button
                    variant="success"
                    size="sm"
                    onClick={() => setUseTemplateTarget(tmpl)}
                  >
                    Use Template
                  </Button>
                )}
                {canCreateTemplate && !isGlobal && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(tmpl.id)}
                  >
                    Delete
                  </Button>
                )}
                {isGlobal && (
                  <span className="text-xs text-gray-400 self-center ml-auto">
                    System template
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {data && data.items.length === 0 && (
          <div className="col-span-full">
            <EmptyState
              icon={
                <svg className="w-16 h-16" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              }
              title="템플릿이 없습니다"
              description="템플릿은 반복되는 보드 구조를 한 번 만들어두고 재사용할 수 있게 해줍니다. 컬럼 구성과 기본 라벨을 저장해 새 보드에 적용하세요."
              action={
                canCreateTemplate ? (
                  <Button onClick={() => setShowCreate(true)}>첫 템플릿 만들기</Button>
                ) : undefined
              }
            />
          </div>
        )}
      </div>

      {showCreate && (
        <CreateTemplateModal onClose={() => setShowCreate(false)} />
      )}

      {useTemplateTarget && (
        <UseTemplateModal
          template={useTemplateTarget}
          onClose={() => setUseTemplateTarget(null)}
        />
      )}
    </div>
  );
}

// --- Use Template Modal (with department selection) ---

function UseTemplateModal({
  template,
  onClose,
}: {
  template: TemplateDto;
  onClose: () => void;
}) {
  const [departmentId, setDepartmentId] = useState('');
  const [title, setTitle] = useState(`${template.name} Board`);
  const { data: depts } = useDepartments();
  const createBoard = useCreateBoard();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);

  const handleCreate = () => {
    if (!title.trim() || !departmentId) return;
    createBoard.mutate(
      {
        title,
        department_ids: [departmentId],
        from_template: template.id,
      },
      {
        onSuccess: (board) => {
          addToast('success', 'Board created from template');
          onClose();
          navigate(`/boards/${board.id}`);
        },
        onError: () => addToast('error', 'Failed to create board'),
      },
    );
  };

  return (
    <Modal
      title={`Create board from "${template.name}"`}
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
            Board Title
          </label>
          <input
            autoFocus
            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
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
            {(depts?.items ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {'\u00A0'.repeat(d.depth * 3)}{d.depth > 0 ? '└ ' : ''}{d.name}
              </option>
            ))}
          </select>
          {!departmentId && (
            <p className="text-xs text-gray-400 mt-1">
              A department is required to create a board.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

// --- Create Template Modal ---

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
        scope: 'team',
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
    <Modal
      title="Create Template"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || createTemplate.isPending}
          >
            {createTemplate.isPending ? 'Creating...' : 'Create'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Name *
          </label>
          <input
            autoFocus
            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
            className="w-full border rounded-lg px-3 py-2 text-sm min-h-[60px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Columns (comma-separated)
          </label>
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            value={columnsText}
            onChange={(e) => setColumnsText(e.target.value)}
            placeholder="To Do, In Progress, Done"
          />
        </div>
      </div>
    </Modal>
  );
}

function getColumns(tmpl: TemplateDto): string[] {
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
}

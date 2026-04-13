import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const [showCreate, setShowCreate] = useState(false);
  const [useTemplateTarget, setUseTemplateTarget] = useState<TemplateDto | null>(null);
  const [previewTarget, setPreviewTarget] = useState<TemplateDto | null>(null);
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
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
          {t('templates.title')}
        </h1>
        {canCreateTemplate && (
          <Button onClick={() => setShowCreate(true)}>{t('templates.newTemplate')}</Button>
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
              className="surface-raised p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <h2 className="text-base font-semibold">{tmpl.name}</h2>
                <Badge>{tmpl.kind}</Badge>
              </div>
              {tmpl.description && (
                <p className="text-sm text-[var(--color-text-secondary)] line-clamp-2 mb-3">
                  {tmpl.description}
                </p>
              )}

              {columns.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {columns.map((col, i) => (
                    <span
                      key={i}
                      className="inline-block bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] text-xs px-2 py-0.5 rounded"
                    >
                      {col}
                    </span>
                  ))}
                </div>
              )}

              <div
                className="flex gap-2 mt-auto pt-2"
                style={{ borderTop: '1px solid var(--color-border-light)' }}
              >
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPreviewTarget(tmpl)}
                >
                  {t('common.preview')}
                </Button>
                {canCreateBoard && (
                  <Button
                    variant="success"
                    size="sm"
                    onClick={() => setUseTemplateTarget(tmpl)}
                  >
                    {t('templates.useTemplate')}
                  </Button>
                )}
                {canCreateTemplate && !isGlobal && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(tmpl.id)}
                  >
                    {t('common.delete')}
                  </Button>
                )}
                {isGlobal && (
                  <span
                    className="text-xs self-center ml-auto"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {t('templates.systemTemplate')}
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
              title={t('templates.emptyTitle')}
              description={t('templates.emptyDesc')}
              action={
                canCreateTemplate ? (
                  <Button onClick={() => setShowCreate(true)}>
                    {t('templates.emptyAction')}
                  </Button>
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

      {previewTarget && (
        <TemplatePreviewModal
          template={previewTarget}
          onClose={() => setPreviewTarget(null)}
          onUse={() => {
            const target = previewTarget;
            setPreviewTarget(null);
            setUseTemplateTarget(target);
          }}
          canUse={canCreateBoard}
        />
      )}
    </div>
  );
}

// --- Template Preview Modal -------------------------------------------------
//
// Surfaces the structure embedded in `template.payload`:
//   • columns: [{ title, position }, ...]
//   • labels:  [{ name, color }, ...]
//   • default_tasks: [{ title, ... }, ...]   (optional, free-form)
//
// Read-only — used so the user can confirm what they're about to instantiate
// before committing to a real board.

interface TemplateColumn { title: string; position?: number; }
interface TemplateLabel { name: string; color: string; }
interface TemplateDefaultTask { title: string; column?: string; priority?: string; }

function TemplatePreviewModal({
  template,
  onClose,
  onUse,
  canUse,
}: {
  template: TemplateDto;
  onClose: () => void;
  onUse: () => void;
  canUse: boolean;
}) {
  const { t } = useTranslation();
  const payload = (template.payload ?? {}) as Record<string, unknown>;

  const columns: TemplateColumn[] = Array.isArray(payload.columns)
    ? (payload.columns as unknown[]).map((c) => {
        if (typeof c === 'object' && c !== null && 'title' in c) {
          return c as TemplateColumn;
        }
        return { title: String(c) };
      })
    : [];

  const labels: TemplateLabel[] = Array.isArray(payload.labels)
    ? (payload.labels as unknown[])
        .filter((l): l is TemplateLabel =>
          typeof l === 'object' && l !== null && 'name' in l && 'color' in l,
        )
    : [];

  const defaultTasks: TemplateDefaultTask[] = Array.isArray(payload.default_tasks)
    ? (payload.default_tasks as unknown[])
        .filter((tk): tk is TemplateDefaultTask =>
          typeof tk === 'object' && tk !== null && 'title' in tk,
        )
    : [];

  return (
    <Modal
      title={t('templatePreview.title', { name: template.name })}
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
          {canUse && (
            <Button onClick={onUse}>{t('templatePreview.useThis')}</Button>
          )}
        </>
      }
    >
      <div className="space-y-6">
        {template.description && (
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {template.description}
          </p>
        )}

        {/* Columns — rendered as mini Kanban headers */}
        <section>
          <h3
            className="text-xs font-semibold uppercase tracking-wider mb-2"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {t('templatePreview.columns', { count: columns.length })}
          </h3>
          {columns.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {t('templatePreview.noColumns')}
            </p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {columns.map((col, i) => (
                <div
                  key={i}
                  className="flex-shrink-0 w-32 rounded-lg p-2 text-center text-xs font-medium"
                  style={{
                    backgroundColor: 'var(--color-surface-hover)',
                    color: 'var(--color-text)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  {col.title}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Labels */}
        <section>
          <h3
            className="text-xs font-semibold uppercase tracking-wider mb-2"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {t('templatePreview.labels', { count: labels.length })}
          </h3>
          {labels.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {t('templatePreview.noLabels')}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {labels.map((l, i) => (
                <span
                  key={i}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                  style={{
                    backgroundColor: l.color,
                    color: pickContrastText(l.color),
                  }}
                >
                  {l.name}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Default tasks */}
        <section>
          <h3
            className="text-xs font-semibold uppercase tracking-wider mb-2"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {t('templatePreview.defaultTasks', { count: defaultTasks.length })}
          </h3>
          {defaultTasks.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {t('templatePreview.noDefaultTasks')}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {defaultTasks.map((task, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 text-sm rounded px-2 py-1.5"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    color: 'var(--color-text)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <span className="flex-1 truncate">{task.title}</span>
                  {task.column && (
                    <Badge>{task.column}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}

/**
 * Pick black or white text for a given background hex so labels stay readable.
 * Uses the YIQ luminance heuristic (cheap, good enough for preview chips).
 */
function pickContrastText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  // YIQ formula
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 160 ? '#111827' : '#ffffff';
}

// --- Use Template Modal (with department selection) ---

function UseTemplateModal({
  template,
  onClose,
}: {
  template: TemplateDto;
  onClose: () => void;
}) {
  const { t } = useTranslation();
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
      title={t('templates.createFrom', { name: template.name })}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!title.trim() || !departmentId || createBoard.isPending}
          >
            {createBoard.isPending ? t('boards.creating') : t('boards.createBoard')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label
            className="block text-sm font-medium mb-1"
            style={{ color: 'var(--color-text)' }}
          >
            {t('boards.boardTitle')}
          </label>
          <input
            autoFocus
            className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            }}
          />
        </div>
        <div>
          <label
            className="block text-sm font-medium mb-1"
            style={{ color: 'var(--color-text)' }}
          >
            {t('boards.department')} *
          </label>
          <select
            className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            }}
          >
            <option value="">{t('boards.selectDept')}</option>
            {(depts?.items ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {'\u00A0'.repeat(d.depth * 3)}{d.depth > 0 ? '└ ' : ''}{d.name}
              </option>
            ))}
          </select>
          {!departmentId && (
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              {t('boards.deptRequired')}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

// --- Create Template Modal ---

function CreateTemplateModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
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

  const inputStyle = {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text)',
  } as const;
  const labelStyle = { color: 'var(--color-text)' } as const;

  return (
    <Modal
      title={t('templates.createTitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || createTemplate.isPending}
          >
            {createTemplate.isPending ? t('boards.creating') : t('common.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1" style={labelStyle}>
            {t('templates.name')} *
          </label>
          <input
            autoFocus
            className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
            placeholder={t('templates.name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={labelStyle}>
            {t('boards.description')}
          </label>
          <textarea
            className="w-full rounded-lg px-3 py-2 text-sm min-h-[60px] outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={labelStyle}>
            {t('templates.columns')}
          </label>
          <input
            className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
            value={columnsText}
            onChange={(e) => setColumnsText(e.target.value)}
            placeholder="To Do, In Progress, Done"
            style={inputStyle}
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

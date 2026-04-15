import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Markdown from 'react-markdown';
import {
  useTask,
  useTaskComments,
  useTaskChecklists,
  usePatchTask,
  useMoveTask,
  useCreateComment,
  useCreateChecklist,
  useAddChecklistItem,
  usePatchChecklistItem,
  useAddAssignee,
  useRemoveAssignee,
  useAddLabel,
  useRemoveLabel,
} from '../api/tasks';
import { useBoardColumns, useBoardLabels, useCreateBoardLabel } from '../api/boards';
import { useBoardCustomFields, useTaskFieldValues, useSetTaskFieldValue } from '../api/customFields';
import { useUsers } from '../api/users';
import { useToastStore } from '../stores/toastStore';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Spinner } from './Spinner';
import Button from './ui/Button';
// NOTE: hardcoded `Priority` / `TaskStatus` enums are no longer consumed by
// this component — the Custom Fields block at the bottom of the right
// sidebar renders Status/Priority via the seeded built-in select fields
// (see migration 0010 + create_board seed). The `tasks.status` / `priority`
// enum columns still exist on the row, kept in sync by the backend's
// custom→enum mirror in set_task_field_value, so card badges and table
// sort continue working without referencing them here.

interface TaskDrawerProps {
  taskId: string;
  boardId: string;
  onClose: () => void;
}

export default function TaskDrawer({ taskId, boardId, onClose }: TaskDrawerProps) {
  const { data: task, isLoading } = useTask(taskId);
  const { data: commentsData } = useTaskComments(taskId);
  const { data: checklistsData } = useTaskChecklists(taskId);
  const { data: labelsData } = useBoardLabels(boardId);
  const { data: columnsData } = useBoardColumns(boardId);
  const { data: usersData } = useUsers();
  const patchTask = usePatchTask(boardId);
  const moveTask = useMoveTask(boardId);
  const createComment = useCreateComment(taskId);
  const createChecklist = useCreateChecklist(taskId);
  const addChecklistItem = useAddChecklistItem(taskId);
  const patchChecklistItem = usePatchChecklistItem(taskId);
  const addAssignee = useAddAssignee(taskId, boardId);
  const removeAssignee = useRemoveAssignee(taskId, boardId);
  const addLabel = useAddLabel(taskId, boardId);
  const removeLabel = useRemoveLabel(taskId, boardId);
  const createBoardLabel = useCreateBoardLabel(boardId);
  const { data: customFieldsData } = useBoardCustomFields(boardId);
  const { data: fieldValuesData } = useTaskFieldValues(taskId);
  const setFieldValue = useSetTaskFieldValue(taskId);
  const addToast = useToastStore((s) => s.addToast);
  const { t } = useTranslation();

  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [newItemTexts, setNewItemTexts] = useState<Record<string, string>>({});
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#2563eb');

  // NOTE: All hooks (including useMemo below) MUST run on every render — even when
  // `task` is still loading. Returning early before useMemo would change the hook
  // call count between renders and trigger React error #310 ("Rendered more hooks
  // than during the previous render"). Compute defensively, then early-return.

  const comments = commentsData?.items ?? [];
  const checklists = checklistsData?.items ?? [];
  const boardLabels = labelsData?.items ?? [];
  const boardColumns = columnsData?.items ?? [];
  const allUsers = usersData?.items ?? [];
  const taskLabels = task?.labels ?? [];
  const taskAssignees = task?.assignees ?? [];

  // Seed `summary` local state from the server task whenever it arrives or
  // changes upstream (e.g. a different task opened in the same drawer, or a
  // successful mutation refetch). Tracking just the string — not the object —
  // means unrelated mutations (labels, assignees) won't clobber in-flight
  // typing, and a round-tripped identical value is a no-op re-set.
  useEffect(() => {
    setSummary(task?.summary ?? '');
  }, [task?.summary]);

  // Assignee search — must be declared before any conditional return.
  const filteredUsers = useMemo(() => {
    const assigned = new Set(taskAssignees.map((a) => a.id));
    let list = allUsers.filter((u) => !assigned.has(u.id));
    if (assigneeSearch) {
      const q = assigneeSearch.toLowerCase();
      list = list.filter(
        (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
      );
    }
    return list.slice(0, 8);
  }, [allUsers, taskAssignees, assigneeSearch]);

  if (isLoading || !task) {
    return (
      <DrawerShell onClose={onClose}>
        <div className="flex-1 flex items-center justify-center"><Spinner /></div>
      </DrawerShell>
    );
  }

  const save = (fields: Record<string, unknown>) => {
    patchTask.mutate(
      { taskId, version: task.version, ...fields } as Parameters<typeof patchTask.mutate>[0],
      { onError: () => addToast('error', t('common.saveFailed')) },
    );
  };

  return (
    <DrawerShell onClose={onClose}>
      {/* Title + Summary — the two header fields. Title is a long click-to-edit
          h2; summary is a persistent one-liner (max 256 chars) that renders on
          cards and table rows. Both save on blur / Enter via the shared
          optimistic `save()` helper. */}
      <div className="px-6 pt-5 pb-3 space-y-2">
        {editingTitle ? (
          <input
            autoFocus
            className="w-full text-xl font-bold outline-none pb-1 bg-transparent"
            style={{
              color: 'var(--color-text)',
              borderBottom: '2px solid var(--color-primary)',
            }}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (title.trim() && title !== task.title) save({ title });
              setEditingTitle(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (title.trim() && title !== task.title) save({ title });
                setEditingTitle(false);
              }
            }}
          />
        ) : (
          <h2
            className="text-xl font-bold cursor-text hover:bg-[var(--color-surface-hover)] rounded px-1 -mx-1"
            style={{ color: 'var(--color-text)' }}
            onClick={() => { setTitle(task.title); setEditingTitle(true); }}
          >
            {task.title}
          </h2>
        )}
        <input
          type="text"
          maxLength={256}
          placeholder={t('task.summaryPlaceholder')}
          className="w-full text-sm outline-none bg-transparent px-1 -mx-1 rounded hover:bg-[var(--color-surface-hover)] focus:bg-[var(--color-surface-hover)]"
          style={{ color: 'var(--color-text-secondary)' }}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          onBlur={() => {
            const trimmed = summary.trim();
            const next = trimmed ? trimmed : null;
            if (next !== (task.summary ?? null)) save({ summary: next });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      </div>

      {/* Main content — 2-column layout like Trello */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col md:flex-row gap-4 px-6 pb-6">
          {/* Left: main content */}
          <div className="flex-1 min-w-0 space-y-5">

            {/* Description (markdown) */}
            <Section title={t('task.description')}>
              {editingDesc ? (
                <div>
                  <textarea
                    autoFocus
                    className="w-full border rounded-lg p-3 text-sm min-h-[120px] font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder={t('task.descEditPlaceholder')}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" onClick={() => { save({ description: description || null }); setEditingDesc(false); }}>
                      {t('task.save')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingDesc(false)}>
                      {t('task.cancel')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className="cursor-text hover:bg-[var(--color-surface-hover)] rounded p-2 -m-2 min-h-[40px]"
                  onClick={() => { setDescription(task.description ?? ''); setEditingDesc(true); }}
                >
                  {task.description ? (
                    <div className="markdown-body">
                      <Markdown>{task.description}</Markdown>
                    </div>
                  ) : (
                    <p className="italic" style={{ color: 'var(--color-text-muted)' }}>
                      {t('task.descPlaceholder')}
                    </p>
                  )}
                </div>
              )}
            </Section>

            {/* Checklists */}
            {checklists.length > 0 && (
              <Section title={t('task.checklists')}>
                {checklists.map((cl) => {
                  const items = cl.items ?? [];
                  const done = items.filter((i: { checked: boolean }) => i.checked).length;
                  const pct = items.length > 0 ? Math.round((done / items.length) * 100) : 0;
                  return (
                    <div key={cl.id} className="mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="text-sm font-semibold">{cl.title}</h4>
                        <span className="text-xs text-[var(--color-text-muted)]">{done}/{items.length}</span>
                      </div>
                      {/* Progress bar */}
                      {items.length > 0 && (
                        <div className="h-1.5 bg-[var(--color-surface-hover)] rounded-full mb-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                      {items.map((item: { id: string; title: string; checked: boolean }) => (
                        <label
                          key={item.id}
                          className="flex items-center gap-2.5 py-1 px-1 rounded hover:bg-[var(--color-surface-hover)] cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            checked={item.checked}
                            onChange={(e) =>
                              patchChecklistItem.mutate({
                                checklistId: cl.id,
                                itemId: item.id,
                                checked: e.target.checked,
                              })
                            }
                          />
                          <span className={`text-sm ${item.checked ? 'line-through text-[var(--color-text-muted)]' : ''}`}>
                            {item.title}
                          </span>
                        </label>
                      ))}
                      {/* Add item inline */}
                      <div className="mt-1">
                        <input
                          placeholder={t('task.addItem')}
                          className="w-full text-sm border-0 border-b border-transparent hover:border-gray-200 focus:border-blue-400 outline-none py-1 px-1"
                          value={newItemTexts[cl.id] ?? ''}
                          onChange={(e) =>
                            setNewItemTexts((prev) => ({ ...prev, [cl.id]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newItemTexts[cl.id]?.trim()) {
                              addChecklistItem.mutate({
                                checklistId: cl.id,
                                title: newItemTexts[cl.id],
                              });
                              setNewItemTexts((prev) => ({ ...prev, [cl.id]: '' }));
                            }
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </Section>
            )}

            {/* Add checklist */}
            <div className="flex gap-2">
              <input
                placeholder={t('task.newChecklist')}
                className="flex-1 text-sm border rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none"
                value={newChecklistTitle}
                onChange={(e) => setNewChecklistTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newChecklistTitle.trim()) {
                    createChecklist.mutate(newChecklistTitle, {
                      onSuccess: () => setNewChecklistTitle(''),
                    });
                  }
                }}
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={!newChecklistTitle.trim()}
                onClick={() => {
                  if (newChecklistTitle.trim()) {
                    createChecklist.mutate(newChecklistTitle, {
                      onSuccess: () => setNewChecklistTitle(''),
                    });
                  }
                }}
              >
                {t('task.addChecklist')}
              </Button>
            </div>

            {/* Comments */}
            <Section title={t('task.commentsCount', { count: comments.length })}>
              <div className="space-y-3">
                <textarea
                  className="w-full border rounded-lg p-3 text-sm min-h-[60px] focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder={t('task.writeComment')}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                />
                <Button
                  size="sm"
                  onClick={() => {
                    if (commentText.trim()) {
                      createComment.mutate(commentText, {
                        onSuccess: () => setCommentText(''),
                      });
                    }
                  }}
                  disabled={!commentText.trim() || createComment.isPending}
                >
                  {t('task.post')}
                </Button>
                {comments.map((c) => (
                  <div key={c.id} className="flex gap-2.5 py-2">
                    <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-[var(--color-text-secondary)] flex-shrink-0">
                      {c.author_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{c.author_name}</span>
                        <span className="text-xs text-[var(--color-text-muted)]">{new Date(c.created_at).toLocaleString()}</span>
                      </div>
                      <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">{c.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </div>

          {/* Right sidebar — properties */}
          <div className="w-full md:w-48 md:flex-shrink-0 space-y-4 pt-1 md:border-l-0 border-t md:border-t-0 pt-4 md:pt-1" style={{ borderColor: 'var(--color-border)' }}>
            {/* Column — moving between columns goes through the dedicated
                move endpoint (not PATCH /tasks/:id), since patch_task rejects
                column_id/position changes with ColumnMovNotAllowed. Position
                0 drops the card at the top of the target column; users can
                then drag to reorder within the column. */}
            <Property label={t('task.column')}>
              <select
                value={task.column_id}
                onChange={(e) => {
                  const nextColumnId = e.target.value;
                  if (nextColumnId === task.column_id) return;
                  moveTask.mutate(
                    {
                      taskId,
                      column_id: nextColumnId,
                      position: 0,
                      version: task.version,
                    },
                    { onError: () => addToast('error', t('common.saveFailed')) },
                  );
                }}
                className="w-full text-sm rounded px-2 py-1"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                }}
              >
                {boardColumns.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </Property>

            {/* NOTE: Status and Priority are now rendered by the Custom
                Fields block below. They were seeded as built-in `select`
                fields by migration 0010 / create_board, so the Custom Fields
                renderer at the bottom of this sidebar covers them with the
                same option semantics + 8-family color tokens.
                Backend mirror-writes these custom field changes back into
                `tasks.status` / `tasks.priority` so card badges, table sort,
                and search continue to work without code changes elsewhere. */}

            {/* Dates — range style */}
            <Property label={t('task.dates')}>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-[var(--color-text-muted)] w-8">{t('task.start')}</span>
                  <input
                    type="date"
                    value={task.start_date?.split('T')[0] ?? ''}
                    onChange={(e) => save({ start_date: dateToIso(e.target.value) })}
                    className="flex-1 text-xs border rounded px-1.5 py-1"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-[var(--color-text-muted)] w-8">{t('task.due')}</span>
                  <input
                    type="date"
                    value={task.due_date?.split('T')[0] ?? ''}
                    onChange={(e) => save({ due_date: dateToIso(e.target.value) })}
                    className="flex-1 text-xs border rounded px-1.5 py-1"
                    min={task.start_date?.split('T')[0] ?? undefined}
                  />
                </div>
                {task.start_date && task.due_date && (
                  <div className="text-xs text-[var(--color-text-muted)] text-center">
                    {Math.ceil(
                      (new Date(task.due_date).getTime() - new Date(task.start_date).getTime()) /
                        (1000 * 60 * 60 * 24),
                    )}{' '}
                    days
                  </div>
                )}
              </div>
            </Property>

            {/* Labels */}
            <Property label={t('task.labels')}>
              <div className="space-y-1">
                {taskLabels.map((l) => (
                  <div key={l.id} className="flex items-center gap-1 group">
                    <span
                      className="flex-1 inline-flex items-center px-2 py-0.5 rounded text-xs text-white truncate"
                      style={{ backgroundColor: l.color }}
                    >
                      {l.name}
                    </span>
                    <button
                      onClick={() => removeLabel.mutate(l.id)}
                      className="text-gray-300 hover:text-red-500 hidden group-hover:block text-xs"
                    >
                      x
                    </button>
                  </div>
                ))}
                {boardLabels.filter((bl) => !taskLabels.some((l) => l.id === bl.id)).length > 0 && (
                  <select
                    value=""
                    onChange={(e) => { if (e.target.value) addLabel.mutate(e.target.value); }}
                    className="w-full text-xs border rounded px-1.5 py-1"
                  >
                    <option value="">+ Add label</option>
                    {boardLabels
                      .filter((bl) => !taskLabels.some((l) => l.id === bl.id))
                      .map((bl) => (
                        <option key={bl.id} value={bl.id}>{bl.name}</option>
                      ))}
                  </select>
                )}
                {/* Create new label */}
                <div className="flex gap-1 mt-1">
                  <input
                    type="color"
                    value={newLabelColor}
                    onChange={(e) => setNewLabelColor(e.target.value)}
                    className="w-6 h-6 p-0 border rounded cursor-pointer"
                  />
                  <input
                    placeholder={t('task.newLabel')}
                    className="flex-1 text-xs border rounded px-1.5 py-0.5"
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newLabelName.trim()) {
                        createBoardLabel.mutate(
                          { name: newLabelName, color: newLabelColor },
                          { onSuccess: () => setNewLabelName('') },
                        );
                      }
                    }}
                  />
                </div>
              </div>
            </Property>

            {/* Assignees — searchable */}
            <Property label={t('task.assignees')}>
              <div className="space-y-1">
                {taskAssignees.map((a) => (
                  <div key={a.id} className="flex items-center gap-1.5 group">
                    <div className="w-5 h-5 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center flex-shrink-0">
                      {a.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-xs truncate flex-1">{a.name}</span>
                    <button
                      onClick={() => removeAssignee.mutate(a.id)}
                      className="text-gray-300 hover:text-red-500 hidden group-hover:block text-xs"
                    >
                      x
                    </button>
                  </div>
                ))}
                {/* Search input */}
                <div className="relative">
                  <input
                    placeholder={t('task.searchPeople')}
                    className="w-full text-xs border rounded px-2 py-1 focus:ring-1 focus:ring-blue-400 outline-none"
                    value={assigneeSearch}
                    onChange={(e) => { setAssigneeSearch(e.target.value); setShowAssigneeDropdown(true); }}
                    onFocus={() => setShowAssigneeDropdown(true)}
                    onBlur={() => setTimeout(() => setShowAssigneeDropdown(false), 200)}
                  />
                  {showAssigneeDropdown && filteredUsers.length > 0 && (
                    <div
                      className="absolute top-full left-0 right-0 mt-1 rounded z-10 max-h-32 overflow-y-auto"
                      style={{
                        backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        boxShadow: 'var(--shadow-md)',
                      }}
                    >
                      {filteredUsers.map((u) => (
                        <button
                          key={u.id}
                          className="w-full text-left px-2 py-1.5 text-xs flex items-center gap-1.5 hover:bg-[var(--color-surface-hover)]"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            addAssignee.mutate(u.id);
                            setAssigneeSearch('');
                            setShowAssigneeDropdown(false);
                          }}
                          style={{ color: 'var(--color-text)' }}
                        >
                          <div
                            className="w-4 h-4 rounded-full text-[8px] flex items-center justify-center"
                            style={{
                              backgroundColor: 'var(--color-surface-hover)',
                              color: 'var(--color-text-secondary)',
                            }}
                          >
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <span>{u.name}</span>
                          <span className="ml-auto" style={{ color: 'var(--color-text-muted)' }}>
                            {u.email}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Property>

            {/* Custom Fields */}
            {(customFieldsData?.items ?? []).map((field) => {
              const values = fieldValuesData?.items ?? [];
              const fv = values.find((v) => v.field_id === field.id);
              const val = fv?.value;
              return (
                <Property key={field.id} label={field.name}>
                  <CustomFieldInput
                    field={field}
                    value={val}
                    users={allUsers}
                    onChange={(v) =>
                      setFieldValue.mutate({ fieldId: field.id, value: v })
                    }
                  />
                </Property>
              );
            })}
          </div>
        </div>
      </div>
    </DrawerShell>
  );
}

/**
 * The `<input type="date">` control emits `YYYY-MM-DD`, but the backend's
 * `start_date` / `due_date` fields deserialize into `DateTime<Utc>` — which
 * rejects a bare calendar date. Normalize to RFC 3339 UTC-midnight before
 * sending; an empty string maps to null so the field can be cleared.
 */
function dateToIso(value: string): string | null {
  if (!value) return null;
  // `YYYY-MM-DDTHH:mm:ssZ` — anchor at UTC midnight to avoid timezone drift
  // flipping the displayed date one day off on load.
  return `${value}T00:00:00Z`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Property({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
        {label}
      </span>
      {children}
    </div>
  );
}

function CustomFieldInput({
  field,
  value,
  users = [],
  onChange,
}: {
  field: { field_type: string; options: { label: string; color?: string }[] };
  value: unknown;
  users?: { id: string; name: string; email: string }[];
  onChange: (v: unknown) => void;
}) {
  switch (field.field_type) {
    case 'text':
      return (
        <input
          className="w-full text-xs border rounded px-1.5 py-1"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(e.target.value || null)}
        />
      );
    case 'url':
      return (
        <input
          className="w-full text-xs border rounded px-1.5 py-1"
          placeholder="https://..."
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(e.target.value || null)}
        />
      );
    case 'email':
      return (
        <input
          type="email"
          className="w-full text-xs border rounded px-1.5 py-1"
          placeholder="user@example.com"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(e.target.value || null)}
        />
      );
    case 'phone':
      return (
        <input
          type="tel"
          className="w-full text-xs border rounded px-1.5 py-1"
          placeholder="+82 10-0000-0000"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(e.target.value || null)}
        />
      );
    case 'person': {
      // Stores a user ID; displays the resolved name
      const selectedId = (value as string) ?? '';
      return (
        <select
          className="w-full text-xs border rounded px-1.5 py-1"
          value={selectedId}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">— None —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      );
    }
    case 'number':
      return (
        <input
          type="number"
          className="w-full text-xs border rounded px-1.5 py-1"
          value={(value as number) ?? ''}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        />
      );
    case 'date':
      return (
        <input
          type="date"
          className="w-full text-xs border rounded px-1.5 py-1"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    case 'checkbox':
      return (
        <input
          type="checkbox"
          className="w-4 h-4 rounded"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case 'select':
      return (
        <select
          className="w-full text-xs border rounded px-1.5 py-1"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">-</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt.label} value={opt.label}>{opt.label}</option>
          ))}
        </select>
      );
    case 'multi_select': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-1">
          {(field.options ?? []).map((opt) => {
            const active = selected.includes(opt.label);
            return (
              <button
                key={opt.label}
                onClick={() => {
                  const next = active
                    ? selected.filter((s) => s !== opt.label)
                    : [...selected, opt.label];
                  onChange(next);
                }}
                className={`px-1.5 py-0.5 rounded text-xs ${
                  active ? 'bg-blue-100 text-blue-700' : 'bg-[var(--color-surface-hover)] text-[var(--color-text-muted)]'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      );
    }
    default:
      return <span className="text-xs text-[var(--color-text-muted)]">Unsupported</span>;
  }
}

function DrawerShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEscapeKey(onClose);
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      {/* Centered large dialog — fills ~90% of viewport */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
        <div
          ref={trapRef}
          role="dialog"
          aria-modal="true"
          aria-label="Task details"
          className="relative w-full max-w-5xl h-full max-h-[90vh] flex flex-col rounded-xl overflow-hidden"
          style={{
            backgroundColor: 'var(--color-surface)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <button
            onClick={onClose}
            aria-label="Close task details"
            className="absolute top-4 right-4 z-10 p-1 rounded hover:opacity-70 focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {children}
        </div>
      </div>
    </>
  );
}

import { useState, useMemo } from 'react';
import Markdown from 'react-markdown';
import {
  useTask,
  useTaskComments,
  useTaskChecklists,
  usePatchTask,
  useCreateComment,
  useCreateChecklist,
  useAddChecklistItem,
  usePatchChecklistItem,
  useAddAssignee,
  useRemoveAssignee,
  useAddLabel,
  useRemoveLabel,
} from '../api/tasks';
import { useBoardLabels, useCreateBoardLabel } from '../api/boards';
import { useBoardCustomFields, useTaskFieldValues, useSetTaskFieldValue } from '../api/customFields';
import { useUsers } from '../api/users';
import { useToastStore } from '../stores/toastStore';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Spinner } from './Spinner';
import Badge from './ui/Badge';
import Button from './ui/Button';
import { priorityClass } from '../theme/constants';
import type { Priority, TaskStatus } from '../types/api';

interface TaskDrawerProps {
  taskId: string;
  boardId: string;
  onClose: () => void;
}

const priorities: Priority[] = ['low', 'medium', 'high', 'urgent'];
const statuses: TaskStatus[] = ['open', 'in_progress', 'done', 'archived'];

export default function TaskDrawer({ taskId, boardId, onClose }: TaskDrawerProps) {
  const { data: task, isLoading } = useTask(taskId);
  const { data: commentsData } = useTaskComments(taskId);
  const { data: checklistsData } = useTaskChecklists(taskId);
  const { data: labelsData } = useBoardLabels(boardId);
  const { data: usersData } = useUsers();
  const patchTask = usePatchTask(boardId);
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

  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [newItemTexts, setNewItemTexts] = useState<Record<string, string>>({});
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#2563eb');

  if (isLoading || !task) {
    return (
      <DrawerShell onClose={onClose}>
        <div className="flex-1 flex items-center justify-center"><Spinner /></div>
      </DrawerShell>
    );
  }

  const comments = commentsData?.items ?? [];
  const checklists = checklistsData?.items ?? [];
  const boardLabels = labelsData?.items ?? [];
  const allUsers = usersData?.items ?? [];
  const taskLabels = task.labels ?? [];
  const taskAssignees = task.assignees ?? [];

  const save = (fields: Record<string, unknown>) => {
    patchTask.mutate(
      { taskId, version: task.version, ...fields } as Parameters<typeof patchTask.mutate>[0],
      { onError: () => addToast('error', 'Failed to save') },
    );
  };

  // Assignee search
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

  return (
    <DrawerShell onClose={onClose}>
      {/* Title */}
      <div className="px-6 pt-5 pb-3">
        {editingTitle ? (
          <input
            autoFocus
            className="w-full text-xl font-bold border-b-2 border-blue-400 outline-none pb-1"
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
            onClick={() => { setTitle(task.title); setEditingTitle(true); }}
          >
            {task.title}
          </h2>
        )}
      </div>

      {/* Main content — 2-column layout like Trello */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col md:flex-row gap-4 px-6 pb-6">
          {/* Left: main content */}
          <div className="flex-1 min-w-0 space-y-5">

            {/* Description (markdown) */}
            <Section title="Description">
              {editingDesc ? (
                <div>
                  <textarea
                    autoFocus
                    className="w-full border rounded-lg p-3 text-sm min-h-[120px] font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Write in Markdown..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" onClick={() => { save({ description: description || null }); setEditingDesc(false); }}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingDesc(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className="cursor-text hover:bg-[var(--color-surface-hover)] rounded p-2 -m-2 min-h-[40px] prose prose-sm max-w-none"
                  onClick={() => { setDescription(task.description ?? ''); setEditingDesc(true); }}
                >
                  {task.description ? (
                    <Markdown>{task.description}</Markdown>
                  ) : (
                    <p className="text-[var(--color-text-muted)] italic">Click to add description (Markdown supported)...</p>
                  )}
                </div>
              )}
            </Section>

            {/* Checklists */}
            {checklists.length > 0 && (
              <Section title="Checklists">
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
                          placeholder="Add item..."
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
                placeholder="New checklist..."
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
                + Checklist
              </Button>
            </div>

            {/* Comments */}
            <Section title={`Comments (${comments.length})`}>
              <div className="space-y-3">
                <textarea
                  className="w-full border rounded-lg p-3 text-sm min-h-[60px] focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Write a comment..."
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
                  Post
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
            {/* Status */}
            <Property label="Status">
              <select
                value={task.status}
                onChange={(e) => save({ status: e.target.value })}
                className="w-full text-sm border rounded px-2 py-1 bg-white"
              >
                {statuses.map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </Property>

            {/* Priority */}
            <Property label="Priority">
              <div className="flex flex-wrap gap-1">
                {priorities.map((p) => (
                  <button
                    key={p}
                    onClick={() => save({ priority: p })}
                    className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${
                      task.priority === p
                        ? `${priorityClass(p)} ring-2 ring-offset-1 ring-blue-400`
                        : 'bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </Property>

            {/* Dates — range style */}
            <Property label="Dates">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-[var(--color-text-muted)] w-8">Start</span>
                  <input
                    type="date"
                    value={task.start_date?.split('T')[0] ?? ''}
                    onChange={(e) => save({ start_date: e.target.value || null })}
                    className="flex-1 text-xs border rounded px-1.5 py-1"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-[var(--color-text-muted)] w-8">Due</span>
                  <input
                    type="date"
                    value={task.due_date?.split('T')[0] ?? ''}
                    onChange={(e) => save({ due_date: e.target.value || null })}
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
            <Property label="Labels">
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
                    placeholder="New label"
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
            <Property label="Assignees">
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
                    placeholder="Search people..."
                    className="w-full text-xs border rounded px-2 py-1 focus:ring-1 focus:ring-blue-400 outline-none"
                    value={assigneeSearch}
                    onChange={(e) => { setAssigneeSearch(e.target.value); setShowAssigneeDropdown(true); }}
                    onFocus={() => setShowAssigneeDropdown(true)}
                    onBlur={() => setTimeout(() => setShowAssigneeDropdown(false), 200)}
                  />
                  {showAssigneeDropdown && filteredUsers.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded shadow-lg z-10 max-h-32 overflow-y-auto">
                      {filteredUsers.map((u) => (
                        <button
                          key={u.id}
                          className="w-full text-left px-2 py-1.5 text-xs hover:bg-blue-50 flex items-center gap-1.5"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            addAssignee.mutate(u.id);
                            setAssigneeSearch('');
                            setShowAssigneeDropdown(false);
                          }}
                        >
                          <div className="w-4 h-4 rounded-full bg-gray-300 text-[8px] flex items-center justify-center">
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <span>{u.name}</span>
                          <span className="text-[var(--color-text-muted)] ml-auto">{u.email}</span>
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
  onChange,
}: {
  field: { field_type: string; options: { label: string; color?: string }[] };
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (field.field_type) {
    case 'text':
    case 'url':
      return (
        <input
          className="w-full text-xs border rounded px-1.5 py-1"
          placeholder={field.field_type === 'url' ? 'https://...' : ''}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(e.target.value)}
        />
      );
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
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Task details"
        className="fixed inset-0 md:inset-y-0 md:right-0 md:left-auto w-full md:max-w-2xl z-50 flex flex-col"
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
    </>
  );
}

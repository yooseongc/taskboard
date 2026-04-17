import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Markdown from 'react-markdown';
import {
  useTask,
  useTaskComments,
  useTaskChecklists,
  usePatchTask,
  useMoveTask,
  useCreateComment,
  usePatchComment,
  useDeleteComment,
  useCreateChecklist,
  useAddChecklistItem,
  usePatchChecklistItem,
  useAddAssignee,
  useRemoveAssignee,
  useAddLabel,
  useRemoveLabel,
} from '../api/tasks';
import { useBoardColumns, useBoardLabels, useCreateBoardLabel } from '../api/boards';
import {
  useBoardCustomFields,
  useTaskFieldValues,
  useSetTaskFieldValue,
  useCreateCustomField,
} from '../api/customFields';
import { useUsers } from '../api/users';
import { useToastStore } from '../stores/toastStore';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Spinner } from './Spinner';
import Button from './ui/Button';
import EmojiPickerButton from './EmojiPickerButton';
import { tagClass, type TagVariant } from '../theme/constants';
// NOTE: hardcoded `Priority` / `TaskStatus` enums are no longer consumed by
// this component — the Custom Fields block at the bottom of the right
// sidebar renders Status/Priority via the seeded built-in select fields
// (see migration 0010 + create_board seed). The `tasks.status` / `priority`
// enum columns still exist on the row, kept in sync by the backend's
// custom→enum mirror in set_task_field_value, so card badges and table
// sort continue working without referencing them here.

interface TaskModalProps {
  taskId: string;
  boardId: string;
  onClose: () => void;
}

export default function TaskModal({ taskId, boardId, onClose }: TaskModalProps) {
  const { data: task, isLoading } = useTask(taskId);
  const { data: commentsData } = useTaskComments(taskId);
  const { data: checklistsData } = useTaskChecklists(taskId);
  const { data: labelsData } = useBoardLabels(boardId);
  const { data: columnsData } = useBoardColumns(boardId);
  const { data: usersData } = useUsers();
  const patchTask = usePatchTask(boardId);
  const moveTask = useMoveTask(boardId);
  const createComment = useCreateComment(taskId);
  const patchComment = usePatchComment(taskId);
  const deleteComment = useDeleteComment(taskId);
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
  const setFieldValue = useSetTaskFieldValue(taskId, boardId);
  const createCustomField = useCreateCustomField(boardId);
  const addToast = useToastStore((s) => s.addToast);
  const { t } = useTranslation();

  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [newItemTexts, setNewItemTexts] = useState<Record<string, string>>({});
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const assigneeBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (assigneeBlurTimerRef.current) clearTimeout(assigneeBlurTimerRef.current);
    };
  }, []);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#2563eb');
  const [addPropOpen, setAddPropOpen] = useState(false);
  const [newPropName, setNewPropName] = useState('');
  const [newPropType, setNewPropType] = useState('text');

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

  const isOverdue =
    !!task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';

  return (
    <DrawerShell onClose={onClose}>
      {/* Header — Trello-style "in list [Column]" breadcrumb + title + summary + chip row.
          Clicking the column name pops up a native select that invokes moveTask
          (since patch_task rejects column_id changes). */}
      <div
        className="px-8 pt-6 pb-5"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <div
          className="flex items-center gap-1.5 text-xs mb-3"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <span className="w-3.5 h-3.5">
            <ColumnIcon />
          </span>
          <span>{t('task.inList')}</span>
          <select
            value={task.column_id}
            onChange={(e) => {
              const nextColumnId = e.target.value;
              if (nextColumnId === task.column_id) return;
              moveTask.mutate(
                { taskId, column_id: nextColumnId, position: 0, version: task.version },
                { onError: () => addToast('error', t('common.saveFailed')) },
              );
            }}
            className="bg-transparent font-medium px-1.5 py-0.5 rounded hover:bg-[var(--color-surface-hover)] outline-none cursor-pointer"
            style={{ color: 'var(--color-text)' }}
          >
            {boardColumns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-start gap-2">
          <EmojiPickerButton
            value={task.icon ?? null}
            size={36}
            title={t('task.pickIcon', 'Pick icon')}
            onChange={(next) => save({ icon: next })}
          />
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input
                autoFocus
                className="w-full text-2xl font-bold outline-none pb-1 bg-transparent"
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
                className="text-2xl font-bold cursor-text hover:bg-[var(--color-surface-hover)] rounded px-1 -mx-1 leading-tight"
                style={{ color: 'var(--color-text)' }}
                onClick={() => { setTitle(task.title); setEditingTitle(true); }}
              >
                {task.title}
              </h2>
            )}
          </div>
        </div>
        <input
          type="text"
          maxLength={256}
          placeholder={t('task.summaryPlaceholder')}
          className="w-full text-sm outline-none bg-transparent px-1 -mx-1 mt-1 rounded hover:bg-[var(--color-surface-hover)] focus:bg-[var(--color-surface-hover)]"
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

        <ChipRow
          labels={taskLabels}
          dueDate={task.due_date ?? null}
          isOverdue={isOverdue}
          assignees={taskAssignees}
        />
      </div>

      {/* 2-column body — left: description/checklists/comments, right:
          properties panel. JSX order is [properties, content]; on desktop
          `lg:flex-row-reverse` places properties in the right sidebar,
          while on mobile the default column direction stacks properties
          at the top and content below. */}
      <div className="flex-1 flex flex-col lg:flex-row-reverse overflow-hidden">
        <aside
          className="lg:w-[22rem] flex-shrink-0 overflow-y-auto"
          style={{
            borderLeft: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-bg)',
          }}
        >
          <div className="px-6 py-5 space-y-0.5">
            <PropertyRow icon={<CalendarIcon />} label={t('task.dates')}>
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <input
                  type="date"
                  value={task.start_date?.split('T')[0] ?? ''}
                  onChange={(e) => save({ start_date: dateToIso(e.target.value) })}
                  className="bg-transparent rounded px-2 py-1 hover:bg-[var(--color-surface-hover)] outline-none"
                  style={{ color: 'var(--color-text)' }}
                />
                <span style={{ color: 'var(--color-text-muted)' }}>→</span>
                <input
                  type="date"
                  value={task.due_date?.split('T')[0] ?? ''}
                  onChange={(e) => save({ due_date: dateToIso(e.target.value) })}
                  className="bg-transparent rounded px-2 py-1 hover:bg-[var(--color-surface-hover)] outline-none"
                  style={{
                    color: isOverdue ? 'var(--color-danger)' : 'var(--color-text)',
                  }}
                  min={task.start_date?.split('T')[0] ?? undefined}
                />
                {task.start_date && task.due_date && (
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    (
                    {Math.ceil(
                      (new Date(task.due_date).getTime() -
                        new Date(task.start_date).getTime()) /
                        (1000 * 60 * 60 * 24),
                    )}{' '}
                    {t('task.days')})
                  </span>
                )}
              </div>
            </PropertyRow>

            <PropertyRow icon={<TagIcon />} label={t('task.labels')}>
              <div className="flex flex-wrap items-center gap-1.5">
                {taskLabels.map((l) => (
                  <span
                    key={l.id}
                    className="group/lbl inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs"
                    style={{ backgroundColor: `${l.color}22`, color: 'var(--color-text)' }}
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: l.color }}
                    />
                    <span className="truncate">{l.name}</span>
                    <button
                      onClick={() => removeLabel.mutate(l.id)}
                      className="opacity-0 group-hover/lbl:opacity-100 ml-0.5"
                      style={{ color: 'var(--color-text-muted)' }}
                      aria-label={t('common.delete')}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {boardLabels.filter((bl) => !taskLabels.some((l) => l.id === bl.id)).length > 0 && (
                  <select
                    value=""
                    onChange={(e) => { if (e.target.value) addLabel.mutate(e.target.value); }}
                    className="text-xs bg-transparent rounded px-2 py-0.5 hover:bg-[var(--color-surface-hover)] outline-none cursor-pointer"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    <option value="">{t('task.addLabel')}</option>
                    {boardLabels
                      .filter((bl) => !taskLabels.some((l) => l.id === bl.id))
                      .map((bl) => (
                        <option key={bl.id} value={bl.id}>
                          {bl.name}
                        </option>
                      ))}
                  </select>
                )}
                <div className="flex items-center gap-1">
                  <input
                    type="color"
                    value={newLabelColor}
                    onChange={(e) => setNewLabelColor(e.target.value)}
                    className="w-5 h-5 p-0 border-0 rounded cursor-pointer"
                    aria-label={t('task.newLabel')}
                  />
                  <input
                    placeholder={t('task.newLabel')}
                    className="text-xs rounded px-2 py-0.5 outline-none w-28 bg-transparent border focus:border-[var(--color-primary)]"
                    style={{
                      color: 'var(--color-text)',
                      borderColor: 'var(--color-border)',
                    }}
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
            </PropertyRow>

            <PropertyRow icon={<UserIcon />} label={t('task.assignees')}>
              <div className="flex flex-wrap items-center gap-1.5">
                {taskAssignees.map((a) => (
                  <span
                    key={a.id}
                    className="group/asg inline-flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-full text-xs"
                    style={{ backgroundColor: 'var(--color-surface-hover)' }}
                  >
                    <span
                      className="w-5 h-5 rounded-full text-xs flex items-center justify-center font-medium"
                      style={{
                        backgroundColor: 'var(--color-primary)',
                        color: 'var(--color-text-inverse)',
                      }}
                    >
                      {a.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate">{a.name}</span>
                    <button
                      onClick={() => removeAssignee.mutate(a.id)}
                      className="opacity-0 group-hover/asg:opacity-100"
                      style={{ color: 'var(--color-text-muted)' }}
                      aria-label={t('common.delete')}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <div className="relative">
                  <input
                    placeholder={t('task.searchPeople')}
                    className="text-xs rounded px-2 py-1 outline-none w-44 bg-transparent border focus:border-[var(--color-primary)]"
                    style={{
                      color: 'var(--color-text)',
                      borderColor: 'var(--color-border)',
                    }}
                    value={assigneeSearch}
                    onChange={(e) => {
                      setAssigneeSearch(e.target.value);
                      setShowAssigneeDropdown(true);
                    }}
                    onFocus={() => {
                      if (assigneeBlurTimerRef.current) {
                        clearTimeout(assigneeBlurTimerRef.current);
                        assigneeBlurTimerRef.current = null;
                      }
                      setShowAssigneeDropdown(true);
                    }}
                    onBlur={() => {
                      assigneeBlurTimerRef.current = setTimeout(
                        () => setShowAssigneeDropdown(false),
                        200,
                      );
                    }}
                  />
                  {showAssigneeDropdown && filteredUsers.length > 0 && (
                    <div
                      className="absolute top-full left-0 mt-1 rounded z-10 w-72 max-h-48 overflow-y-auto"
                      style={{
                        backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        boxShadow: 'var(--shadow-md)',
                      }}
                    >
                      {filteredUsers.map((u) => (
                        <button
                          key={u.id}
                          className="w-full text-left px-2 py-1.5 text-xs flex items-center gap-2 hover:bg-[var(--color-surface-hover)]"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            addAssignee.mutate(u.id);
                            setAssigneeSearch('');
                            setShowAssigneeDropdown(false);
                          }}
                          style={{ color: 'var(--color-text)' }}
                        >
                          <div
                            className="w-5 h-5 rounded-full text-[9px] flex items-center justify-center font-medium"
                            style={{
                              backgroundColor: 'var(--color-primary)',
                              color: 'var(--color-text-inverse)',
                            }}
                          >
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="truncate">{u.name}</span>
                          <span
                            className="ml-auto truncate"
                            style={{ color: 'var(--color-text-muted)' }}
                          >
                            {u.email}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </PropertyRow>

            {/* Custom Fields — one PropertyRow per field, icon derived from field_type.
                Status & Priority are seeded as custom select fields (migration 0010)
                so they appear here too, matching Notion/Boards semantics. */}
            {(customFieldsData?.items ?? []).map((field) => {
              const values = fieldValuesData?.items ?? [];
              const fv = values.find((v) => v.field_id === field.id);
              const val = fv?.value;
              return (
                <PropertyRow
                  key={field.id}
                  icon={iconForFieldType(field.field_type)}
                  label={field.name}
                >
                  <CustomFieldInput
                    field={field}
                    value={val}
                    users={allUsers}
                    onChange={(v) =>
                      setFieldValue.mutate({ fieldId: field.id, value: v })
                    }
                  />
                </PropertyRow>
              );
            })}

            {/* Inline + Add a property — Mattermost Boards-style. Opens a
                small popover with a name + type picker. New field is
                created via useCreateCustomField on the board; it then
                appears in the list on next cache refresh. */}
            <div className="relative pt-2">
              <button
                type="button"
                onClick={() => setAddPropOpen((v) => !v)}
                className="w-full text-left text-sm rounded-md px-2 py-1.5 hover:bg-[var(--color-surface-hover)]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {t('toolbar.addProperty')}
              </button>
              {addPropOpen && (
                <div
                  className="absolute left-0 top-full mt-1 z-20 w-full rounded-lg p-3 shadow-lg"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <div className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>
                    {t('toolbar.newProperty')}
                  </div>
                  <input
                    autoFocus
                    placeholder={t('toolbar.propertyName')}
                    value={newPropName}
                    onChange={(e) => setNewPropName(e.target.value)}
                    className="w-full text-sm rounded px-2 py-1.5 mb-2 outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
                    style={{
                      backgroundColor: 'var(--color-bg)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text)',
                    }}
                  />
                  <select
                    value={newPropType}
                    onChange={(e) => setNewPropType(e.target.value)}
                    className="w-full text-sm rounded px-2 py-1.5 mb-2 outline-none"
                    style={{
                      backgroundColor: 'var(--color-bg)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text)',
                    }}
                  >
                    <option value="text">{t('boardSettings.type.text')}</option>
                    <option value="checkbox">{t('boardSettings.type.checkbox')}</option>
                    <option value="select">{t('boardSettings.type.select')}</option>
                    <option value="multi_select">{t('boardSettings.type.multi_select')}</option>
                    <option value="date">{t('boardSettings.type.date')}</option>
                    <option value="number">{t('boardSettings.type.number')}</option>
                    <option value="progress">{t('toolbar.progress')}</option>
                    <option value="url">{t('boardSettings.type.url')}</option>
                    <option value="email">{t('boardSettings.type.email')}</option>
                    <option value="phone">{t('boardSettings.type.phone')}</option>
                    <option value="person">{t('boardSettings.type.person')}</option>
                  </select>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={!newPropName.trim() || createCustomField.isPending}
                      onClick={() => {
                        if (!newPropName.trim()) return;
                        createCustomField.mutate(
                          {
                            name: newPropName.trim(),
                            field_type: newPropType,
                          },
                          {
                            onSuccess: () => {
                              setNewPropName('');
                              setNewPropType('text');
                              setAddPropOpen(false);
                            },
                            onError: () => addToast('error', t('common.saveFailed')),
                          },
                        );
                      }}
                    >
                      {t('common.create')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setAddPropOpen(false);
                        setNewPropName('');
                      }}
                    >
                      {t('common.cancel')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>

        <div className="flex-1 overflow-y-auto">
          <div className="px-8 py-6 space-y-7">

          {/* -------- Description -------- */}
          <div>
            <SectionHeading icon={<DocumentIcon />} label={t('task.description')} />
            {editingDesc ? (
              <div>
                <textarea
                  autoFocus
                  className="w-full border rounded-lg p-3 text-sm min-h-[120px] font-mono focus:ring-2 focus:ring-[var(--color-border-focus)] outline-none bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)]"
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
          </div>

          {/* -------- Checklists -------- */}
          {checklists.length > 0 && (
            <div>
              <SectionHeading icon={<CheckSquareIcon />} label={t('task.checklists')} count={checklists.length} />
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
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: pct === 100 ? 'var(--color-success)' : 'var(--color-primary)',
                            }}
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
                            className="w-4 h-4 rounded border-[var(--color-border)] accent-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-border-focus)]"
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
                          className="w-full text-sm bg-transparent border-0 border-b border-transparent hover:border-[var(--color-border)] focus:border-[var(--color-primary)] outline-none py-1 px-1 text-[var(--color-text)]"
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
            </div>
          )}

          {/* Add checklist */}
          <div className="flex gap-2">
            <input
              placeholder={t('task.newChecklist')}
              className="flex-1 text-sm border rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-[var(--color-border-focus)] outline-none bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)]"
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

          {/* -------- Comments -------- */}
          <div>
            <SectionHeading
              icon={<MessageSquareIcon />}
              label={t('task.comments')}
              count={comments.length}
            />
            <div className="space-y-3">
                <textarea
                  className="w-full border rounded-lg p-3 text-sm min-h-[60px] focus:ring-2 focus:ring-[var(--color-border-focus)] outline-none bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)]"
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
                  <div key={c.id} className="flex gap-2.5 py-2 group">
                    <div className="w-7 h-7 rounded-full bg-[var(--color-surface-hover)] flex items-center justify-center text-xs font-bold text-[var(--color-text-secondary)] flex-shrink-0">
                      {c.author_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{c.author_name}</span>
                        <span className="text-xs text-[var(--color-text-muted)]">{new Date(c.created_at).toLocaleString()}</span>
                        {c.edited_at && (
                          <span className="text-xs italic text-[var(--color-text-muted)]">(edited)</span>
                        )}
                        <div className="ml-auto hidden group-hover:flex items-center gap-0.5">
                          <button
                            onClick={() => { setEditingCommentId(c.id); setEditingCommentText(c.body); }}
                            className="p-1 rounded hover:bg-[var(--color-surface-hover)]"
                            style={{ color: 'var(--color-text-muted)' }}
                            title={t('common.edit')}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-3.5 h-3.5">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(t('task.deleteCommentConfirm'))) {
                                deleteComment.mutate(c.id);
                              }
                            }}
                            className="p-1 rounded hover:bg-[var(--color-surface-hover)]"
                            style={{ color: 'var(--color-text-muted)' }}
                            title={t('common.delete')}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-3.5 h-3.5">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      {editingCommentId === c.id ? (
                        <div className="mt-1">
                          <textarea
                            autoFocus
                            className="w-full border rounded-lg p-2 text-sm min-h-[60px] focus:ring-2 focus:ring-[var(--color-border-focus)] outline-none bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)]"
                            value={editingCommentText}
                            onChange={(e) => setEditingCommentText(e.target.value)}
                          />
                          <div className="flex gap-2 mt-1">
                            <Button
                              size="sm"
                              disabled={!editingCommentText.trim() || patchComment.isPending}
                              onClick={() => {
                                patchComment.mutate(
                                  { commentId: c.id, body: editingCommentText },
                                  { onSuccess: () => setEditingCommentId(null) },
                                );
                              }}
                            >
                              {t('task.save')}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingCommentId(null)}>
                              {t('task.cancel')}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-[var(--color-text-secondary)] mt-0.5 markdown-body prose prose-sm max-w-none">
                          <Markdown>{c.body}</Markdown>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
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

/** Notion/Mattermost-Boards style horizontal property row. */
function PropertyRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-1.5 rounded -mx-2 px-2 hover:bg-[var(--color-surface-hover)]">
      <div
        className="flex items-center gap-2 w-36 flex-shrink-0 pt-1 text-xs"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <span className="w-4 h-4 flex-shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="flex-1 min-w-0 text-sm" style={{ color: 'var(--color-text)' }}>
        {children}
      </div>
    </div>
  );
}

/** Section heading with leading icon, used for Description / Checklists / Comments. */
function SectionHeading({
  icon,
  label,
  count,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <h3
      className="flex items-center gap-2 text-sm font-semibold mb-2"
      style={{ color: 'var(--color-text)' }}
    >
      <span className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }}>
        {icon}
      </span>
      <span>{label}</span>
      {count != null && count > 0 && (
        <span
          className="text-xs font-normal px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: 'var(--color-surface-hover)',
            color: 'var(--color-text-muted)',
          }}
        >
          {count}
        </span>
      )}
    </h3>
  );
}

/** Quick visual summary below the title — labels, due date, assignees at a glance. */
function ChipRow({
  labels,
  dueDate,
  isOverdue,
  assignees,
}: {
  labels: { id: string; name: string; color: string }[];
  dueDate: string | null;
  isOverdue: boolean;
  assignees: { id: string; name: string }[];
}) {
  const hasLabels = labels.length > 0;
  const hasDue = !!dueDate;
  const hasAssignees = assignees.length > 0;
  if (!hasLabels && !hasDue && !hasAssignees) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 mt-3">
      {labels.map((l) => (
        <span
          key={l.id}
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs"
          style={{ backgroundColor: `${l.color}22`, color: 'var(--color-text)' }}
        >
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: l.color }}
          />
          <span>{l.name}</span>
        </span>
      ))}
      {hasDue && dueDate && (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
          style={{
            backgroundColor: isOverdue ? 'var(--color-danger-light)' : 'var(--color-surface-hover)',
            color: isOverdue ? 'var(--color-danger)' : 'var(--color-text-secondary)',
          }}
        >
          <span className="w-3 h-3">
            <CalendarIcon />
          </span>
          {new Date(dueDate).toLocaleDateString()}
        </span>
      )}
      {hasAssignees && (
        <div className="flex -space-x-1.5">
          {assignees.slice(0, 5).map((a) => (
            <div
              key={a.id}
              className="w-6 h-6 rounded-full text-xs flex items-center justify-center font-medium"
              style={{
                backgroundColor: 'var(--color-primary)',
                color: 'var(--color-text-inverse)',
                border: '2px solid var(--color-surface)',
              }}
              title={a.name}
            >
              {a.name.charAt(0).toUpperCase()}
            </div>
          ))}
          {assignees.length > 5 && (
            <div
              className="w-6 h-6 rounded-full text-xs flex items-center justify-center font-medium"
              style={{
                backgroundColor: 'var(--color-surface-hover)',
                color: 'var(--color-text-secondary)',
                border: '2px solid var(--color-surface)',
              }}
            >
              +{assignees.length - 5}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Maps a custom field type → leading icon for the PropertyRow. */
function iconForFieldType(fieldType: string): React.ReactNode {
  switch (fieldType) {
    case 'text':
      return <TextIcon />;
    case 'number':
      return <HashIcon />;
    case 'date':
      return <CalendarIcon />;
    case 'url':
      return <LinkIcon />;
    case 'email':
      return <MailIcon />;
    case 'phone':
      return <PhoneIcon />;
    case 'person':
      return <UserIcon />;
    case 'checkbox':
      return <CheckCircleIcon />;
    case 'select':
    case 'multi_select':
      return <ListIcon />;
    default:
      return <CircleIcon />;
  }
}

/* ---------------------------------------------------------------- Icons --- */
/* Inline strokes — 24x24 viewBox, w-full h-full so parent sizes them. */

function svgProps() {
  return {
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor' as const,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'w-full h-full',
  };
}

function TagIcon() {
  return (
    <svg {...svgProps()}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
      <circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg {...svgProps()}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg {...svgProps()}>
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg {...svgProps()}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}

function CheckSquareIcon() {
  return (
    <svg {...svgProps()}>
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  );
}

function MessageSquareIcon() {
  return (
    <svg {...svgProps()}>
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

function ColumnIcon() {
  return (
    <svg {...svgProps()}>
      <rect x="3" y="3" width="7" height="18" rx="1" />
      <rect x="14" y="3" width="7" height="12" rx="1" />
    </svg>
  );
}

function TextIcon() {
  return (
    <svg {...svgProps()}>
      <path d="M4 7V5a1 1 0 011-1h14a1 1 0 011 1v2M9 20h6M12 4v16" />
    </svg>
  );
}

function HashIcon() {
  return (
    <svg {...svgProps()}>
      <path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg {...svgProps()}>
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg {...svgProps()}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 6l-10 7L2 6" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg {...svgProps()}>
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.37 1.9.72 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0122 16.92z" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg {...svgProps()}>
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg {...svgProps()}>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}

function CircleIcon() {
  return (
    <svg {...svgProps()}>
      <circle cx="12" cy="12" r="9" />
    </svg>
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
  users?: { id: string; name: string; email: string; department_names?: string[] }[];
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
      // Stores a user ID; displays resolved name + primary dept so
      // homonymous users are distinguishable. Same formatter used by
      // the assignee chips to keep the workspace consistent.
      const selectedId = (value as string) ?? '';
      const formatUser = (u: (typeof users)[number]) => {
        const dept = u.department_names?.[0];
        return dept ? `${u.name} · ${dept}` : u.name;
      };
      return (
        <select
          className="w-full text-xs border rounded px-1.5 py-1"
          value={selectedId}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">— None —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {formatUser(u)}
            </option>
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
    case 'progress': {
      // Progress — stored as a number 0..100; rendered as a native range
      // slider plus a compact progress bar. No DB migration needed — the
      // backend keeps the `number` column; `progress` is strictly a client
      // rendering hint.
      const raw = typeof value === 'number' ? value : Number(value) || 0;
      const pct = Math.max(0, Math.min(100, Math.round(raw)));
      return (
        <div className="flex items-center gap-2 w-full">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={pct}
            onChange={(e) => onChange(Number(e.target.value))}
            className="flex-1 accent-[var(--color-primary)]"
          />
          <span
            className="text-xs font-medium w-10 text-right"
            style={{ color: 'var(--color-text)' }}
          >
            {pct}%
          </span>
        </div>
      );
    }
    case 'checkbox':
      return (
        <input
          type="checkbox"
          className="w-4 h-4 rounded"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case 'select': {
      const selVal = (value as string) ?? '';
      const selOpt = (field.options ?? []).find((o) => o.label === selVal);
      const selColor = selOpt?.color;
      return (
        <div className="flex items-center gap-2 w-full">
          {selVal && (
            selColor && isSemanticToken(selColor) ? (
              <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${tagClass(selColor as TagVariant)}`}>
                {selVal}
              </span>
            ) : (
              <span
                className="inline-block text-xs font-medium px-2 py-0.5 rounded"
                style={{
                  backgroundColor: selColor ? `${selColor}22` : 'var(--color-surface-hover)',
                  color: selColor ?? 'var(--color-text-secondary)',
                  border: selColor ? `1px solid ${selColor}44` : '1px solid var(--color-border)',
                }}
              >
                {selVal}
              </span>
            )
          )}
          <select
            className="flex-1 text-xs border rounded px-1.5 py-1"
            value={selVal}
            onChange={(e) => onChange(e.target.value || null)}
            style={{
              backgroundColor: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            }}
          >
            <option value="">-</option>
            {(field.options ?? []).map((opt) => (
              <option key={opt.label} value={opt.label}>{opt.label}</option>
            ))}
          </select>
        </div>
      );
    }
    case 'multi_select': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-1">
          {(field.options ?? []).map((opt) => {
            const active = selected.includes(opt.label);
            const optColor = opt.color;
            return (
              <button
                key={opt.label}
                onClick={() => {
                  const next = active
                    ? selected.filter((s) => s !== opt.label)
                    : [...selected, opt.label];
                  onChange(next);
                }}
                className={`px-1.5 py-0.5 rounded text-xs font-medium ${active && optColor && isSemanticToken(optColor) ? tagClass(optColor as TagVariant) : ''}`}
                style={active && optColor && !isSemanticToken(optColor) ? {
                  backgroundColor: `${optColor}22`,
                  color: optColor,
                  border: `1px solid ${optColor}44`,
                } : active && !(optColor && isSemanticToken(optColor)) ? {
                  backgroundColor: 'var(--color-primary-light)',
                  color: 'var(--color-primary-text)',
                } : !(optColor && isSemanticToken(optColor)) ? {
                  backgroundColor: 'var(--color-surface-hover)',
                  color: 'var(--color-text-muted)',
                } : undefined}
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

const SEMANTIC_TOKENS = new Set(['neutral','info','success','warning','orange','danger','critical','accent']);
function isSemanticToken(color: string): boolean {
  return SEMANTIC_TOKENS.has(color);
}

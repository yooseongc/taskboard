import type { ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import {
  useBoard,
  useBoardColumns,
  useBoardTasks,
  useCreateColumn,
  usePatchColumn,
  useDeleteColumn,
} from '../api/boards';
import { useCreateTask, useMoveTask, useDeleteTask } from '../api/tasks';
import {
  useBoardCustomFields,
  useBoardFieldValues,
  type CustomField,
  type TaskFieldValue,
} from '../api/customFields';
import { Spinner } from '../components/Spinner';
import TaskDrawer from '../components/TaskDrawer';
import TableView from '../components/TableView';
import CalendarView, { type CalendarDateField } from '../components/CalendarView';
import BoardSettingsModal from '../components/BoardSettingsModal';
import SavedViewBar from '../components/SavedViewBar';
import type { BoardViewConfig } from '../api/views';
import { useToastStore } from '../stores/toastStore';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import { useTagTheme } from '../theme/constants';
import { tagClass, type TagVariant } from '../theme/constants';
import type { TaskDto, BoardColumn } from '../types/api';

type ViewTab = 'board' | 'table' | 'calendar';

export default function BoardViewPage() {
  const { id } = useParams<{ id: string }>();
  const { data: board, isLoading: boardLoading } = useBoard(id!);
  const { data: columnsData } = useBoardColumns(id!);
  const { data: tasksData } = useBoardTasks(id!);
  // Board View needs the set of fields flagged "Show on card" plus
  // every task's field values so we can render per-task pills without
  // firing N requests. Both queries are cheap (board-scoped, paginated
  // up to "small" limits) and cached via react-query.
  const { data: fieldsData } = useBoardCustomFields(id!);
  const { data: fieldValuesData } = useBoardFieldValues(id!);
  const { t } = useTranslation();
  const moveTask = useMoveTask(id!);
  const deleteTask = useDeleteTask(id!);
  const createColumn = useCreateColumn(id!);
  const patchColumn = usePatchColumn(id!);
  const deleteColumn = useDeleteColumn(id!);
  const createTask = useCreateTask(id!);
  const addToast = useToastStore((s) => s.addToast);

  const [activeView, setActiveView] = useState<ViewTab>('board');
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [calendarDateField, setCalendarDateField] = useState<CalendarDateField>({
    id: 'due_date',
    label: 'Due Date',
    kind: 'builtin',
  });
  const [newColTitle, setNewColTitle] = useState('');
  const [addingColumn, setAddingColumn] = useState(false);
  const [boardSearch, setBoardSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (boardLoading) return <Spinner />;
  if (!board) {
    return (
      <div className="p-12 max-w-md mx-auto text-center">
        <div className="text-4xl mb-3">🔍</div>
        <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
          Board not found
        </h2>
        <p className="text-sm mb-5" style={{ color: 'var(--color-text-muted)' }}>
          This board may have been deleted, or you don't have permission to view it.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg"
          style={{
            backgroundColor: 'var(--color-primary)',
            color: 'var(--color-text-inverse)',
          }}
        >
          ← Back to Boards
        </Link>
      </div>
    );
  }

  const columns = columnsData?.items ?? [];
  const rawTasks = tasksData?.items ?? [];
  // "Show on card" field defs sorted by user-chosen position so pill
  // order on the card matches the order in Board Settings.
  const cardFields: CustomField[] = (fieldsData?.items ?? [])
    .filter((f) => f.show_on_card)
    .slice()
    .sort((a, b) => a.position - b.position);
  // Bucket values by task for O(1) lookup when rendering each card.
  const valuesByTask = new Map<string, TaskFieldValue[]>();
  for (const v of fieldValuesData?.items ?? []) {
    const arr = valuesByTask.get(v.task_id) ?? [];
    arr.push(v);
    valuesByTask.set(v.task_id, arr);
  }

  // Flat map of task_id:field_id → raw value string for CalendarView custom date fields.
  const customFieldValues = new Map<string, string>();
  for (const v of fieldValuesData?.items ?? []) {
    if (v.value !== null && v.value !== undefined) {
      customFieldValues.set(`${v.task_id}:${v.field_id}`, String(v.value));
    }
  }

  // Date field options for the calendar source picker:
  // two builtins + any custom fields of type "date".
  const dateFieldOptions: CalendarDateField[] = [
    { id: 'start_date', label: 'Start Date', kind: 'builtin' },
    { id: 'due_date', label: 'Due Date', kind: 'builtin' },
    ...(fieldsData?.items ?? [])
      .filter((f) => f.field_type === 'date')
      .map((f): CalendarDateField => ({ id: f.id, label: f.name, kind: 'custom' })),
  ];

  // Apply board-level search/filter (only affects board view)
  const tasks = rawTasks.filter((t) => {
    if (boardSearch) {
      const q = boardSearch.toLowerCase();
      // Search covers title + summary (the two card-visible fields). Long-form
      // description lives only in the drawer and is intentionally excluded —
      // matching Markdown body text would surface cards whose visible copy
      // doesn't mention the query, feeling broken to users.
      if (
        !t.title.toLowerCase().includes(q) &&
        !(t.summary ?? '').toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    if (filterPriority && t.priority !== filterPriority) return false;
    return true;
  });

  // Group tasks by column
  const tasksByColumn = new Map<string, TaskDto[]>();
  for (const col of columns) {
    tasksByColumn.set(col.id, []);
  }
  for (const task of tasks) {
    const colTasks = tasksByColumn.get(task.column_id) ?? [];
    colTasks.push(task);
    tasksByColumn.set(task.column_id, colTasks);
  }
  for (const [, colTasks] of tasksByColumn) {
    colTasks.sort((a, b) => a.position - b.position);
  }

  const handleDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    )
      return;

    // Server requires the current task version for optimistic concurrency.
    // We source it from the raw (unfiltered) list so the lookup survives
    // board-level search/filter state.
    const task = rawTasks.find((t) => t.id === draggableId);
    if (!task) return;

    const payload = {
      taskId: draggableId,
      column_id: destination.droppableId,
      position: destination.index,
      version: task.version,
    };
    moveTask.mutate(payload, {
      onError: () =>
        addToast('error', 'Failed to move task', {
          action: { label: 'Retry', onClick: () => moveTask.mutate(payload) },
        }),
    });
  };

  const handleAddColumn = () => {
    if (!newColTitle.trim()) return;
    createColumn.mutate(
      { title: newColTitle, position: columns.length },
      {
        onSuccess: () => {
          setNewColTitle('');
          setAddingColumn(false);
        },
        onError: () => addToast('error', 'Failed to create column'),
      },
    );
  };

  const viewTabs: { key: ViewTab }[] = [
    { key: 'board' },
    { key: 'table' },
    { key: 'calendar' },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div
        className="px-6 py-3"
        style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}
      >
        <Breadcrumbs items={[{ label: 'Boards', to: '/' }, { label: board.title }]} />
        <div className="flex items-center gap-3 mt-1">
          <h1 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>{board.title}</h1>
          {board.description && (
            <span className="text-sm truncate max-w-md" style={{ color: 'var(--color-text-muted)' }}>
              {board.description}
            </span>
          )}
          <button
            onClick={() => setSettingsOpen(true)}
            className="ml-auto p-1.5 rounded hover:bg-[var(--color-surface-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
            style={{ color: 'var(--color-text-secondary)' }}
            aria-label={t('boardSettings.openSettings')}
            title={t('boardSettings.openSettings')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* View Tabs */}
      <div
        className="flex gap-1 px-6 py-1.5"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        {viewTabs.map((tab) => {
          const active = activeView === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveView(tab.key)}
              className="rounded-md px-3 py-1 text-sm font-medium"
              style={{
                backgroundColor: active ? 'var(--color-primary-light)' : 'transparent',
                color: active ? 'var(--color-primary-text)' : 'var(--color-text-secondary)',
              }}
            >
              {t(`board.${tab.key}`)}
            </button>
          );
        })}
      </div>

      {/* Saved Views bar — Round C. Board toolbar state (search +
          priority) is what we persist for the Board view. Selecting a
          saved view replays those two pieces of state. */}
      {activeView === 'board' && (
        <SavedViewBar
          boardId={id!}
          viewType="board"
          currentConfig={{ search: boardSearch, priority: filterPriority }}
          onLoadConfig={(cfg) => {
            const c = cfg as BoardViewConfig;
            setBoardSearch(c.search ?? '');
            setFilterPriority(c.priority ?? '');
          }}
        />
      )}

      {/* Board toolbar (search/filter) */}
      {activeView === 'board' && (
        <div
          className="flex items-center gap-2 px-6 py-2"
          style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}
        >
          <input
            type="text"
            placeholder="Search tasks..."
            value={boardSearch}
            onChange={(e) => setBoardSearch(e.target.value)}
            className="text-sm rounded px-3 py-1 w-56 focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
            style={{
              backgroundColor: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            }}
          />
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="text-sm rounded px-2 py-1"
            style={{
              backgroundColor: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            }}
          >
            <option value="">All priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          {(boardSearch || filterPriority) && (
            <button
              onClick={() => { setBoardSearch(''); setFilterPriority(''); }}
              className="text-xs"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Clear filters ({tasks.length}/{rawTasks.length})
            </button>
          )}
        </div>
      )}

      {/* View Content */}
      {activeView === 'board' && (
        <div className="flex-1 overflow-x-auto p-4">
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex gap-4 h-full">
              {columns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  tasks={tasksByColumn.get(column.id) ?? []}
                  boardId={id!}
                  cardFields={cardFields}
                  valuesByTask={valuesByTask}
                  onTaskClick={setOpenTaskId}
                  onRenameColumn={(title) =>
                    patchColumn.mutate({
                      columnId: column.id,
                      title,
                      version: column.version,
                    })
                  }
                  onRecolorColumn={(color) =>
                    patchColumn.mutate({
                      columnId: column.id,
                      color,
                      version: column.version,
                    })
                  }
                  onDeleteColumn={() => deleteColumn.mutate(column.id)}
                  onCreateTask={(title) =>
                    createTask.mutate({
                      title,
                      column_id: column.id,
                    })
                  }
                />
              ))}

              {/* Add column */}
              <div className="w-64 md:w-72 flex-shrink-0">
                {addingColumn ? (
                  <div
                    className="rounded-lg p-3"
                    style={{ backgroundColor: 'var(--color-surface-hover)' }}
                  >
                    <input
                      autoFocus
                      className="w-full rounded px-2 py-1.5 text-sm mb-2"
                      placeholder={t('board.columnTitle')}
                      value={newColTitle}
                      onChange={(e) => setNewColTitle(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddColumn()}
                      style={{
                        backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text)',
                      }}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleAddColumn}
                        className="px-3 py-1 text-sm rounded"
                        style={{
                          backgroundColor: 'var(--color-primary)',
                          color: 'var(--color-text-inverse)',
                        }}
                      >
                        {t('common.create')}
                      </button>
                      <button
                        onClick={() => setAddingColumn(false)}
                        className="px-3 py-1 text-sm"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingColumn(true)}
                    className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-[var(--color-surface-hover)]"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {t('board.addColumn')}
                  </button>
                )}
              </div>
            </div>
          </DragDropContext>
        </div>
      )}

      {activeView === 'table' && (
        <TableView
          boardId={id!}
          tasks={tasks}
          columns={columns}
          onTaskClick={setOpenTaskId}
          onCreateTask={(title, columnId) =>
            createTask.mutate({ title, column_id: columnId })
          }
          onBulkMove={(taskIds, columnId) => {
            taskIds.forEach((tid, i) => {
              const task = rawTasks.find((t) => t.id === tid);
              if (!task) return;
              moveTask.mutate({
                taskId: tid,
                column_id: columnId,
                position: i,
                version: task.version,
              });
            });
          }}
          onBulkDelete={(taskIds) => {
            taskIds.forEach((tid) => deleteTask.mutate(tid));
          }}
        />
      )}

      {activeView === 'calendar' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Date field source picker */}
          <div
            className="flex items-center gap-2 px-6 py-2 flex-shrink-0"
            style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}
          >
            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Date field:
            </span>
            <select
              value={calendarDateField.id}
              onChange={(e) => {
                const opt = dateFieldOptions.find((o) => o.id === e.target.value);
                if (opt) setCalendarDateField(opt);
              }}
              className="text-sm rounded px-2 py-1"
              style={{
                backgroundColor: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
            >
              {dateFieldOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 overflow-auto">
            <CalendarView
              tasks={tasks}
              onTaskClick={setOpenTaskId}
              dateField={calendarDateField}
              customFieldValues={customFieldValues}
            />
          </div>
        </div>
      )}

      {/* Task Drawer */}
      {openTaskId && (
        <TaskDrawer
          taskId={openTaskId}
          boardId={id!}
          onClose={() => setOpenTaskId(null)}
        />
      )}

      {/* Board Settings Modal */}
      {settingsOpen && (
        <BoardSettingsModal
          boardId={id!}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * Render a single custom-field value as a compact fragment for the
 * kanban card. Returns `null` when the value is empty/unset so the
 * card can skip rendering that pill entirely instead of showing an
 * empty "Name:" label.
 *
 * The renderer intentionally lives here (not in TableView's cell
 * renderer) because kanban cards have a different space budget and
 * formatting preference: dates compact, long strings truncated, and
 * multi_select shown as comma-joined tag names rather than separate
 * badges.
 */
function renderCardFieldValue(
  field: CustomField,
  value: unknown,
): ReactNode {
  if (value === null || value === undefined || value === '') return null;
  switch (field.field_type) {
    case 'checkbox':
      return (
        <span>{value ? '✓' : '✗'}</span>
      );
    case 'date': {
      const d = typeof value === 'string' ? new Date(value) : null;
      if (!d || Number.isNaN(d.getTime())) return null;
      return <span>{d.toLocaleDateString()}</span>;
    }
    case 'number':
      return <span>{String(value)}</span>;
    case 'url': {
      const s = String(value);
      if (!s) return null;
      // Readable trim: drop scheme + trailing slash for display, keep
      // full URL in title attribute (set by the wrapping pill).
      return <span className="truncate max-w-[120px]">{s.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>;
    }
    case 'select': {
      const opt = (field.options ?? []).find((o) => o.label === value);
      const color = opt?.color ?? 'neutral';
      // `color` can be either a palette key (TagVariant) or a raw hex.
      // For raw hex we paint a 2px swatch + label; for palette keys we
      // fall back to the existing tagClass utility.
      if (color.startsWith('#')) {
        return (
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            {String(value)}
          </span>
        );
      }
      return (
        <span className={`rounded px-1 ${tagClass(color as TagVariant)}`}>
          {String(value)}
        </span>
      );
    }
    case 'multi_select': {
      if (!Array.isArray(value) || value.length === 0) return null;
      return <span className="truncate max-w-[160px]">{value.join(', ')}</span>;
    }
    case 'email':
      return (
        <span className="truncate max-w-[160px]" title={String(value)}>
          {String(value)}
        </span>
      );
    case 'phone':
      return <span>{String(value)}</span>;
    case 'person':
      // value is a user ID — show the ID abbreviated; full resolution
      // needs a user list which isn't passed here, so just show it.
      return (
        <span className="truncate max-w-[100px] font-mono text-[10px]" title={String(value)}>
          @{String(value).slice(0, 8)}
        </span>
      );
    case 'text':
    default: {
      const s = String(value);
      if (!s) return null;
      return <span className="truncate max-w-[160px]">{s}</span>;
    }
  }
}

/**
 * Preset palette for one-click column recolor. Users who need a custom
 * hex can still submit any `#rrggbb` via the color input (native
 * `<input type="color">`). Preset values are chosen to stay readable on
 * both the light and dark surface tokens — high enough lightness to not
 * drown card text, but distinct enough to tell columns apart.
 */
const COLUMN_COLOR_PRESETS: Array<{ label: string; value: string | null }> = [
  { label: 'Default', value: null },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Indigo', value: '#6366f1' },
  { label: 'Purple', value: '#8b5cf6' },
  { label: 'Pink', value: '#ec4899' },
  { label: 'Rose', value: '#f43f5e' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Amber', value: '#f59e0b' },
  { label: 'Lime', value: '#84cc16' },
  { label: 'Green', value: '#22c55e' },
  { label: 'Teal', value: '#14b8a6' },
  { label: 'Cyan', value: '#06b6d4' },
];

function KanbanColumn({
  column,
  tasks,
  boardId: _boardId,
  cardFields,
  valuesByTask,
  onTaskClick,
  onRenameColumn,
  onRecolorColumn,
  onDeleteColumn,
  onCreateTask,
}: {
  column: BoardColumn;
  tasks: TaskDto[];
  boardId: string;
  cardFields: CustomField[];
  valuesByTask: Map<string, TaskFieldValue[]>;
  onTaskClick: (id: string) => void;
  onRenameColumn: (title: string) => void;
  onRecolorColumn: (color: string | null) => void;
  onDeleteColumn: () => void;
  onCreateTask: (title: string) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(column.title);
  const [adding, setAdding] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const handleRename = () => {
    if (title.trim() && title !== column.title) {
      onRenameColumn(title);
    }
    setEditing(false);
  };

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) return;
    onCreateTask(newTaskTitle);
    setNewTaskTitle('');
    setAdding(false);
  };

  return (
    <div className="flex flex-col w-64 md:w-72 flex-shrink-0">
      {/* Column Header. When `column.color` is set, we paint a 3px
          accent strip at the top and tint the header background with
          a low-opacity version of the accent so the column is visually
          distinct without impairing text contrast. */}
      <div
        className="flex items-center justify-between rounded-t-lg px-3 py-2"
        style={{
          backgroundColor: column.color
            ? `color-mix(in srgb, ${column.color} 18%, var(--color-surface-hover))`
            : 'var(--color-surface-hover)',
          borderTop: column.color
            ? `3px solid ${column.color}`
            : '3px solid transparent',
        }}
      >
        {editing ? (
          <input
            autoFocus
            className="text-sm font-semibold rounded px-1 py-0.5 w-full mr-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            }}
          />
        ) : (
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            {column.title}
          </h3>
        )}
        <div className="flex items-center gap-1">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{tasks.length}</span>
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="px-1"
              style={{ color: 'var(--color-text-muted)' }}
              aria-label="Column menu"
            >
              ...
            </button>
            {showMenu && (
              <div
                className="absolute right-0 top-6 rounded py-1 z-10 w-44"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  boxShadow: 'var(--shadow-md)',
                }}
              >
                <button
                  onClick={() => {
                    setEditing(true);
                    setShowMenu(false);
                  }}
                  className="block w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--color-surface-hover)]"
                  style={{ color: 'var(--color-text)' }}
                >
                  {t('common.rename')}
                </button>
                <button
                  onClick={() => {
                    setShowColorPicker(true);
                    setShowMenu(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-sm hover:bg-[var(--color-surface-hover)]"
                  style={{ color: 'var(--color-text)' }}
                >
                  <span>{t('board.columnColor', 'Color')}</span>
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{
                      backgroundColor: column.color ?? 'transparent',
                      border: '1px solid var(--color-border)',
                    }}
                    aria-hidden
                  />
                </button>
                <button
                  onClick={() => {
                    onDeleteColumn();
                    setShowMenu(false);
                  }}
                  className="block w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--color-danger-light)]"
                  style={{ color: 'var(--color-danger)' }}
                >
                  {t('common.delete')}
                </button>
              </div>
            )}
            {showColorPicker && (
              <div
                className="absolute right-0 top-6 rounded py-2 px-3 z-20 w-56"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  boxShadow: 'var(--shadow-md)',
                }}
              >
                <div className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
                  {t('board.columnColor', 'Color')}
                </div>
                <div className="grid grid-cols-6 gap-1.5 mb-2">
                  {COLUMN_COLOR_PRESETS.map((preset) => {
                    const active = (column.color ?? null) === preset.value;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          onRecolorColumn(preset.value);
                          setShowColorPicker(false);
                        }}
                        title={preset.label}
                        aria-label={preset.label}
                        className="h-6 w-6 rounded-full flex items-center justify-center"
                        style={{
                          backgroundColor: preset.value ?? 'transparent',
                          border: preset.value
                            ? active
                              ? '2px solid var(--color-text)'
                              : '1px solid var(--color-border)'
                            : '1px dashed var(--color-border)',
                        }}
                      >
                        {!preset.value && (
                          <span
                            className="text-[10px]"
                            style={{ color: 'var(--color-text-muted)' }}
                            aria-hidden
                          >
                            ∅
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    {t('board.columnColorCustom', 'Custom')}
                  </span>
                  <input
                    type="color"
                    value={column.color ?? '#888888'}
                    onChange={(e) => onRecolorColumn(e.target.value)}
                    className="h-6 w-10 cursor-pointer rounded"
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Droppable area */}
      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="flex-1 space-y-2 overflow-y-auto rounded-b-lg p-2 min-h-[100px]"
            style={{
              backgroundColor: snapshot.isDraggingOver
                ? 'var(--color-primary-light)'
                : 'var(--color-bg)',
            }}
          >
            {tasks.map((task, index) => (
              <Draggable key={task.id} draggableId={task.id} index={index}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className="rounded-lg p-3 transition-shadow cursor-pointer"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      color: 'var(--color-text)',
                      border: `1px solid ${snapshot.isDragging ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      boxShadow: snapshot.isDragging ? 'var(--shadow-lg)' : 'var(--shadow-sm)',
                    }}
                    onClick={() => onTaskClick(task.id)}
                  >
                    <TaskCardContent
                      task={task}
                      cardFields={cardFields}
                      fieldValues={valuesByTask.get(task.id) ?? []}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}

            {/* Add task */}
            {adding ? (
              <div
                className="rounded-lg p-2"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <input
                  autoFocus
                  className="w-full text-sm pb-1 outline-none bg-transparent"
                  placeholder={t('board.taskTitle')}
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                  style={{
                    color: 'var(--color-text)',
                    borderBottom: '1px solid var(--color-border)',
                  }}
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleAddTask}
                    className="px-2 py-1 text-xs rounded"
                    style={{
                      backgroundColor: 'var(--color-primary)',
                      color: 'var(--color-text-inverse)',
                    }}
                  >
                    {t('common.create')}
                  </button>
                  <button
                    onClick={() => setAdding(false)}
                    className="px-2 py-1 text-xs"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="w-full text-left text-sm px-2 py-1"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {t('board.addTask')}
              </button>
            )}
          </div>
        )}
      </Droppable>
    </div>
  );
}

function TaskCardContent({
  task,
  cardFields,
  fieldValues,
}: {
  task: TaskDto;
  cardFields: CustomField[];
  fieldValues: TaskFieldValue[];
}) {
  const { priorityClass, statusClass } = useTagTheme();
  // Index field-values by field id for O(1) lookup inside the map below.
  const valueByField = new Map(fieldValues.map((v) => [v.field_id, v.value]));
  const labels = task.labels ?? [];
  const assignees = task.assignees ?? [];
  const checklist = task.checklist_summary ?? { total: 0, checked: 0 };
  const commentCount = task.comment_count ?? 0;
  const isOverdue =
    task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';

  return (
    <>
      {/* Labels as color bars */}
      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {labels.map((l) => (
            <span
              key={l.id}
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0 text-xs font-medium text-white"
              style={{ backgroundColor: l.color }}
            >
              {l.name}
            </span>
          ))}
        </div>
      )}
      <p
        className="text-sm font-medium leading-snug"
        style={{ color: 'var(--color-text)' }}
      >
        {task.title}
      </p>
      {task.summary && (
        <p
          className="text-xs mt-0.5 line-clamp-2 leading-relaxed"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {task.summary}
        </p>
      )}
      {/* Meta row */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${priorityClass(task.priority)}`}
        >
          {task.priority.toUpperCase()}
        </span>
        {task.status !== 'open' && (
          <span
            className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${statusClass(task.status)}`}
          >
            {task.status.replace('_', ' ')}
          </span>
        )}
        {task.due_date && (
          <span
            className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-[var(--color-text-muted)]'}`}
          >
            {isOverdue ? 'Overdue ' : ''}
            {new Date(task.due_date).toLocaleDateString()}
          </span>
        )}
      </div>
      {/* Custom field pills — only for fields the user flagged "Show on
          card" in Board Settings. We deliberately skip fields that have
          no value set on this task (renderCardFieldValue returns null)
          so the card doesn't fill up with empty slots. */}
      {cardFields.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {cardFields.map((field) => {
            const rendered = renderCardFieldValue(field, valueByField.get(field.id));
            if (!rendered) return null;
            return (
              <span
                key={field.id}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
                style={{
                  backgroundColor: 'var(--color-surface-hover)',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)',
                }}
                title={field.name}
              >
                <span
                  className="font-medium"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {field.name}:
                </span>
                {rendered}
              </span>
            );
          })}
        </div>
      )}
      {/* Bottom row: checklist, comments, assignees */}
      {(checklist.total > 0 ||
        commentCount > 0 ||
        assignees.length > 0) && (
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
            {checklist.total > 0 && (
              <span className="flex items-center gap-0.5" title="Checklist">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                {checklist.checked}/{checklist.total}
              </span>
            )}
            {commentCount > 0 && (
              <span className="flex items-center gap-0.5" title="Comments">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
                {commentCount}
              </span>
            )}
          </div>
          {assignees.length > 0 && (
            <div className="flex -space-x-1">
              {assignees.slice(0, 3).map((a) => (
                <div
                  key={a.id}
                  className="w-6 h-6 rounded-full text-xs flex items-center justify-center"
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
              {assignees.length > 3 && (
                <div
                  className="w-6 h-6 rounded-full text-xs flex items-center justify-center"
                  style={{
                    backgroundColor: 'var(--color-surface-hover)',
                    color: 'var(--color-text-secondary)',
                    border: '2px solid var(--color-surface)',
                  }}
                >
                  +{assignees.length - 3}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

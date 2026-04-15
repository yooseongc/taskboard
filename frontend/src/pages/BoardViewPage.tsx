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
  useBoardActivity,
  useCreateColumn,
  usePatchColumn,
  useDeleteColumn,
} from '../api/boards';
import {
  useCreateTask,
  useMoveTask,
  useDeleteTask,
  usePatchTask,
} from '../api/tasks';
import { apiFetch } from '../api/client';
import { useQueryClient } from '@tanstack/react-query';
import {
  useBoardCustomFields,
  useBoardFieldValues,
  type CustomField,
  type TaskFieldValue,
} from '../api/customFields';
import { Spinner } from '../components/Spinner';
import TaskModal from '../components/TaskModal';
import TableView from '../components/TableView';
import CalendarView, { type CalendarDateField } from '../components/CalendarView';
import BoardSettingsModal from '../components/BoardSettingsModal';
import SavedViewBar from '../components/SavedViewBar';
import ViewToolbar from '../components/ViewToolbar';
import AvatarStack from '../components/AvatarStack';
import TaskMetaBadges from '../components/TaskMetaBadges';
import type { BoardViewConfig, TableViewConfig } from '../api/views';
import type { TableViewState } from '../components/TableView';
import { useToastStore } from '../stores/toastStore';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import { useTagTheme } from '../theme/constants';
import { tagClass, type TagVariant } from '../theme/constants';
import type {
  TaskDto,
  BoardColumn,
  GroupByKey,
  ViewDensity,
  UserRef,
  LabelRef,
} from '../types/api';
import {
  groupTasks,
  mutationForGroupChange,
  type GroupContext,
  type TaskGroup,
} from '../lib/groupBy';

type ViewTab = 'board' | 'table' | 'calendar' | 'activity';

export default function BoardViewPage() {
  const { id } = useParams<{ id: string }>();
  const { data: board, isLoading: boardLoading } = useBoard(id!);
  const { data: columnsData } = useBoardColumns(id!);
  const { data: tasksData } = useBoardTasks(id!);
  const { data: activityData } = useBoardActivity(id!);
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
  const patchTask = usePatchTask(id!);
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);

  const [activeView, setActiveView] = useState<ViewTab>('board');
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  // Table View — track current sort/filter state for SavedViewBar snapshot.
  // tableKey is bumped when loading a saved view to remount TableView with new defaultConfig.
  const [activityTaskFilter, setActivityTaskFilter] = useState<string>('');
  const [tableConfig, setTableConfig] = useState<TableViewState>({
    sortKey: 'title',
    sortDir: 'asc',
    filters: [],
    filterMode: 'and',
  });
  const [tableKey, setTableKey] = useState(0);
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
  const [groupBy, setGroupBy] = useState<GroupByKey>({ type: 'column' });
  const [density, setDensity] = useState<ViewDensity>('normal');
  const [tableGroupBy, setTableGroupBy] = useState<GroupByKey>({ type: 'none' });
  const [tableDensity, setTableDensity] = useState<ViewDensity>('normal');
  const [calendarGroupBy, setCalendarGroupBy] = useState<GroupByKey>({
    type: 'none',
  });

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

  // Derive label/user definitions from observed tasks so empty groups
  // still appear even when the board-level label/user fetch hasn't been
  // wired up here. Falls back gracefully — a label not used by any task
  // simply won't show as a group, which is the desired UX.
  const observedLabels = new Map<string, LabelRef>();
  const observedUsers = new Map<string, UserRef>();
  for (const t of rawTasks) {
    for (const l of t.labels ?? []) observedLabels.set(l.id, l);
    for (const u of t.assignees ?? []) observedUsers.set(u.id, u);
  }
  const groupCtx: GroupContext = {
    columns,
    labels: Array.from(observedLabels.values()).map((l) => ({
      id: l.id,
      board_id: id!,
      name: l.name,
      color: l.color,
      created_at: '',
    })),
    users: Array.from(observedUsers.values()),
    fields: fieldsData?.items ?? [],
    fieldValues: fieldValuesData?.items ?? [],
  };
  const sortedTasks = [...tasks].sort((a, b) => a.position - b.position);
  const groups: TaskGroup[] = groupTasks(sortedTasks, groupBy, groupCtx);

  const handleDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    )
      return;

    const task = rawTasks.find((t) => t.id === draggableId);
    if (!task) return;

    // Column-grouped DnD — move task between columns with midpoint
    // position. We compute the target position from neighbours in the
    // destination column so cards don't accidentally collapse onto the
    // same integer position (the old behaviour sent destination.index
    // raw, which worked once but produced duplicate positions once a
    // second card landed at the same index, breaking card ordering).
    if (groupBy.type === 'column') {
      const destTasks = rawTasks
        .filter(
          (t) => t.column_id === destination.droppableId && t.id !== draggableId,
        )
        .sort((a, b) => a.position - b.position);
      const idx = Math.max(0, Math.min(destination.index, destTasks.length));
      const prev = idx > 0 ? destTasks[idx - 1].position : undefined;
      const next = idx < destTasks.length ? destTasks[idx].position : undefined;
      let newPosition: number;
      if (prev === undefined && next === undefined) {
        newPosition = 1024;
      } else if (prev === undefined) {
        newPosition = (next as number) - 1024;
      } else if (next === undefined) {
        newPosition = (prev as number) + 1024;
      } else {
        newPosition = (prev + next) / 2;
      }
      const payload = {
        taskId: draggableId,
        column_id: destination.droppableId,
        position: newPosition,
        version: task.version,
      };
      moveTask.mutate(payload, {
        onError: (err) => {
          console.error('[board DnD] move failed', err);
          const msg = err instanceof Error ? err.message : 'Failed to move task';
          addToast('error', msg, {
            action: { label: 'Retry', onClick: () => moveTask.mutate(payload) },
          });
        },
      });
      return;
    }

    // Non-column grouping — dragging across groups mutates the grouping
    // field itself (status / priority / assignees / labels / custom field).
    const mutation = mutationForGroupChange(
      task,
      groupBy,
      source.droppableId,
      destination.droppableId,
      groupCtx,
    );
    if (!mutation) return;

    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ['board', id!, 'tasks'] });
      qc.invalidateQueries({ queryKey: ['task', draggableId] });
    };

    switch (mutation.kind) {
      case 'patch-task':
        patchTask.mutate(
          { taskId: draggableId, ...mutation.patch, version: task.version },
          {
            onError: () => addToast('error', 'Failed to update task'),
          },
        );
        break;
      case 'add-assignee':
        (async () => {
          try {
            if (mutation.previousUserId) {
              await apiFetch(
                `/api/tasks/${draggableId}/assignees/${mutation.previousUserId}`,
                { method: 'DELETE' },
              );
            }
            await apiFetch(`/api/tasks/${draggableId}/assignees`, {
              method: 'POST',
              body: JSON.stringify({ user_id: mutation.userId }),
            });
            invalidate();
          } catch {
            addToast('error', 'Failed to update assignee');
          }
        })();
        break;
      case 'add-label':
        (async () => {
          try {
            if (mutation.previousLabelId) {
              await apiFetch(
                `/api/tasks/${draggableId}/labels/${mutation.previousLabelId}`,
                { method: 'DELETE' },
              );
            }
            await apiFetch(`/api/tasks/${draggableId}/labels`, {
              method: 'POST',
              body: JSON.stringify({ label_id: mutation.labelId }),
            });
            invalidate();
          } catch {
            addToast('error', 'Failed to update label');
          }
        })();
        break;
      case 'set-field':
        (async () => {
          try {
            await apiFetch(
              `/api/tasks/${draggableId}/fields/${mutation.fieldId}`,
              {
                method: 'PUT',
                body: JSON.stringify({ value: mutation.value }),
              },
            );
            qc.invalidateQueries({
              queryKey: ['board', id!, 'field-values'],
            });
            qc.invalidateQueries({
              queryKey: ['task', draggableId, 'fields'],
            });
            invalidate();
          } catch {
            addToast('error', 'Failed to update field');
          }
        })();
        break;
    }
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
    { key: 'activity' },
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
          currentConfig={{
            search: boardSearch,
            priority: filterPriority,
            groupBy,
            density,
          }}
          onLoadConfig={(cfg) => {
            const c = cfg as BoardViewConfig & {
              groupBy?: GroupByKey;
              density?: ViewDensity;
            };
            setBoardSearch(c.search ?? '');
            setFilterPriority(c.priority ?? '');
            if (c.groupBy) setGroupBy(c.groupBy);
            if (c.density) setDensity(c.density);
          }}
        />
      )}

      {/* Board toolbar (search/group-by/density + priority filter) */}
      {activeView === 'board' && (
        <div
          className="px-6"
          style={{
            borderBottom: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-surface)',
          }}
        >
          <ViewToolbar
            search={boardSearch}
            onSearchChange={setBoardSearch}
            groupBy={groupBy}
            onGroupByChange={setGroupBy}
            groupByOptions={[
              'column',
              'status',
              'priority',
              'assignee',
              'label',
              'custom_field',
            ]}
            customFields={fieldsData?.items ?? []}
            density={density}
            onDensityChange={setDensity}
            leftExtras={
              <>
                <select
                  value={filterPriority}
                  onChange={(e) => setFilterPriority(e.target.value)}
                  className="text-sm rounded-lg px-2 py-1.5"
                  style={{
                    backgroundColor: 'var(--color-surface)',
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
                    onClick={() => {
                      setBoardSearch('');
                      setFilterPriority('');
                    }}
                    className="text-xs"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    Clear ({tasks.length}/{rawTasks.length})
                  </button>
                )}
              </>
            }
          />
        </div>
      )}

      {/* View Content */}
      {activeView === 'board' && (
        <div className="flex-1 overflow-x-auto p-4">
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex gap-4 h-full">
              {groupBy.type === 'column'
                ? columns.map((column) => (
                    <KanbanColumn
                      key={column.id}
                      column={column}
                      tasks={groups.find((g) => g.key === column.id)?.tasks ?? []}
                      boardId={id!}
                      cardFields={cardFields}
                      valuesByTask={valuesByTask}
                      density={density}
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
                  ))
                : groups.map((group) => (
                    <GroupLane
                      key={group.key}
                      group={group}
                      cardFields={cardFields}
                      valuesByTask={valuesByTask}
                      density={density}
                      onTaskClick={setOpenTaskId}
                    />
                  ))}

              {/* Add column — only when grouping by column */}
              {groupBy.type === 'column' && (
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
              )}
            </div>
          </DragDropContext>
        </div>
      )}

      {activeView === 'table' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <SavedViewBar
            boardId={id!}
            viewType="table"
            currentConfig={
              {
                ...tableConfig,
                groupBy: tableGroupBy,
                density: tableDensity,
              } as unknown as Record<string, unknown>
            }
            onLoadConfig={(cfg) => {
              const c = cfg as TableViewConfig & {
                groupBy?: GroupByKey;
                density?: ViewDensity;
              };
              const next: TableViewState = {
                sortKey: (c.sortKey as TableViewState['sortKey']) ?? 'title',
                sortDir: (c.sortDir as TableViewState['sortDir']) ?? 'asc',
                filters: (c.filters as TableViewState['filters']) ?? [],
                filterMode:
                  (c.filterMode as TableViewState['filterMode']) ?? 'and',
              };
              setTableConfig(next);
              if (c.groupBy) setTableGroupBy(c.groupBy);
              if (c.density) setTableDensity(c.density);
              setTableKey((k) => k + 1);
            }}
          />
          <div
            className="px-4"
            style={{ borderBottom: '1px solid var(--color-border)' }}
          >
            <ViewToolbar
              groupBy={tableGroupBy}
              onGroupByChange={setTableGroupBy}
              groupByOptions={[
                'none',
                'column',
                'status',
                'priority',
                'assignee',
                'label',
                'custom_field',
              ]}
              customFields={fieldsData?.items ?? []}
              density={tableDensity}
              onDensityChange={setTableDensity}
            />
          </div>
          <div className="flex-1 overflow-auto">
            <TableView
              key={tableKey}
              boardId={id!}
              tasks={tasks}
              columns={columns}
              onTaskClick={setOpenTaskId}
              defaultConfig={tableConfig}
              onStateChange={setTableConfig}
              groupBy={tableGroupBy}
              density={tableDensity}
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
          </div>
        </div>
      )}

      {activeView === 'calendar' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Calendar toolbar — date field picker + group by */}
          <div
            className="flex items-center gap-3 px-6 flex-shrink-0"
            style={{
              borderBottom: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)',
            }}
          >
            <ViewToolbar
              groupBy={calendarGroupBy}
              onGroupByChange={setCalendarGroupBy}
              groupByOptions={[
                'none',
                'status',
                'priority',
                'assignee',
                'label',
                'custom_field',
              ]}
              customFields={fieldsData?.items ?? []}
              leftExtras={
                <>
                  <span
                    className="text-sm"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    Date:
                  </span>
                  <select
                    value={calendarDateField.id}
                    onChange={(e) => {
                      const opt = dateFieldOptions.find(
                        (o) => o.id === e.target.value,
                      );
                      if (opt) setCalendarDateField(opt);
                    }}
                    className="text-sm rounded-lg px-2 py-1.5"
                    style={{
                      backgroundColor: 'var(--color-surface)',
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
                </>
              }
            />
          </div>
          <div className="flex-1 overflow-auto">
            <CalendarView
              tasks={tasks}
              onTaskClick={setOpenTaskId}
              dateField={calendarDateField}
              customFieldValues={customFieldValues}
              groupBy={calendarGroupBy}
              customFields={fieldsData?.items ?? []}
              allFieldValues={fieldValuesData?.items ?? []}
            />
          </div>
        </div>
      )}

      {activeView === 'activity' && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-5">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                {t('board.activity')}
              </h2>
              {/* Task filter dropdown — client-side since we have all 50 entries */}
              <select
                value={activityTaskFilter}
                onChange={(e) => setActivityTaskFilter(e.target.value)}
                className="ml-auto text-xs rounded px-2 py-1"
                style={{
                  backgroundColor: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                }}
              >
                <option value="">All tasks</option>
                {rawTasks
                  .filter((t) =>
                    (activityData?.items ?? []).some((e) => e.task_id === t.id),
                  )
                  .map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
              </select>
            </div>
            {(activityData?.items ?? []).length === 0 && (
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                No activity yet.
              </p>
            )}
            <div className="space-y-3">
              {(activityData?.items ?? [])
                .filter((e) => !activityTaskFilter || e.task_id === activityTaskFilter)
                .map((entry) => {
                  const taskTitle = entry.task_id
                    ? rawTasks.find((t) => t.id === entry.task_id)?.title
                    : undefined;
                  return (
                    <div key={entry.id} className="flex gap-3 items-start">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                        style={{ backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)' }}
                      >
                        {entry.actor_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm" style={{ color: 'var(--color-text)' }}>
                          <span className="font-medium">{entry.actor_name}</span>{' '}
                          <span style={{ color: 'var(--color-text-secondary)' }}>
                            {activityActionLabel(entry.action)}
                          </span>
                          {taskTitle && (
                            <>
                              {' '}
                              <button
                                className="text-xs underline"
                                style={{ color: 'var(--color-primary)' }}
                                onClick={() => setOpenTaskId(entry.task_id!)}
                              >
                                {taskTitle}
                              </button>
                            </>
                          )}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                          {new Date(entry.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Task Drawer */}
      {openTaskId && (
        <TaskModal
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

/** Convert a backend activity action string to a human-readable label. */
function activityActionLabel(action: string): string {
  const labels: Record<string, string> = {
    'task.created': 'created a task',
    'task.updated': 'updated a task',
    'task.moved_column': 'moved a task to another column',
    'task.reordered': 'reordered a task',
    'task.deleted': 'deleted a task',
    'task.label_added': 'added a label',
    'task.label_removed': 'removed a label',
    'task.assignee_added': 'added an assignee',
    'task.assignee_removed': 'removed an assignee',
    'task.checklist_item_toggled': 'toggled a checklist item',
    'task.commented': 'posted a comment',
    'task.comment_edited': 'edited a comment',
    'board.created': 'created this board',
    'board.updated': 'updated the board',
    'board.member_added': 'added a member',
    'board.member_removed': 'removed a member',
    'column.created': 'added a column',
    'column.updated': 'updated a column',
    'column.deleted': 'deleted a column',
    'column.reordered': 'reordered columns',
    'template.created': 'created a template',
    'template.updated': 'updated a template',
    'template.used': 'used a template',
  };
  return labels[action] ?? action;
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
  density = 'normal',
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
  density?: ViewDensity;
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
                      density={density}
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

/**
 * Lane rendered when the board is grouped by something other than
 * column — status/priority/assignee/label/custom field. Unlike
 * KanbanColumn this lane has no rename/color/delete menus and never
 * creates tasks inline (column is not known). DnD from one lane to
 * another mutates the grouping field via `mutationForGroupChange`.
 */
function GroupLane({
  group,
  cardFields,
  valuesByTask,
  density,
  onTaskClick,
}: {
  group: TaskGroup;
  cardFields: CustomField[];
  valuesByTask: Map<string, TaskFieldValue[]>;
  density: ViewDensity;
  onTaskClick: (id: string) => void;
}) {
  const accent = group.color ?? 'transparent';
  return (
    <div className="flex flex-col w-64 md:w-72 flex-shrink-0">
      <div
        className="flex items-center justify-between rounded-t-lg px-3 py-2"
        style={{
          backgroundColor: group.color
            ? `color-mix(in srgb, ${group.color} 18%, var(--color-surface-hover))`
            : 'var(--color-surface-hover)',
          borderTop: `3px solid ${accent}`,
        }}
      >
        <h3
          className="text-sm font-semibold truncate"
          style={{ color: 'var(--color-text)' }}
          title={group.label}
        >
          {group.label}
        </h3>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {group.tasks.length}
        </span>
      </div>
      <Droppable droppableId={group.key}>
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
            {group.tasks.map((task, index) => (
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
                      boxShadow: snapshot.isDragging
                        ? 'var(--shadow-lg)'
                        : 'var(--shadow-sm)',
                    }}
                    onClick={() => onTaskClick(task.id)}
                  >
                    <TaskCardContent
                      task={task}
                      cardFields={cardFields}
                      fieldValues={valuesByTask.get(task.id) ?? []}
                      density={density}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
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
  density = 'normal',
}: {
  task: TaskDto;
  cardFields: CustomField[];
  fieldValues: TaskFieldValue[];
  density?: ViewDensity;
}) {
  const { priorityClass, statusClass } = useTagTheme();
  const compact = density === 'compact';
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
      {/* Top color strip — derived from the first label, mimicking
          Mattermost Boards cards. Pure decorative so the label chips
          below still disambiguate multi-label cards. */}
      {labels.length > 0 && (
        <div
          className="-mx-3 -mt-3 mb-2 h-[3px] rounded-t-lg"
          style={{ backgroundColor: labels[0].color }}
        />
      )}
      {/* Labels as compact chips */}
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
      {!compact && task.summary && (
        <p
          className="text-xs mt-0.5 line-clamp-2 leading-relaxed"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {task.summary}
        </p>
      )}
      {/* Meta row 1: priority + status (never wraps onto due date) */}
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
      </div>
      {/* Meta row 2: due date (separate line, tokenized overdue color) */}
      {task.due_date && (
        <div
          className={`mt-1.5 text-xs ${isOverdue ? 'font-medium' : ''}`}
          style={{ color: isOverdue ? 'var(--color-danger)' : 'var(--color-text-muted)' }}
        >
          {isOverdue ? 'Overdue ' : ''}
          {new Date(task.due_date).toLocaleDateString()}
        </div>
      )}
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
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs max-w-full"
                style={{
                  backgroundColor: 'var(--color-surface-hover)',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)',
                }}
                title={`${field.name}`}
              >
                <span
                  className="font-medium max-w-[60px] truncate"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {field.name}:
                </span>
                <span className="max-w-[90px] truncate">{rendered}</span>
              </span>
            );
          })}
        </div>
      )}
      {/* Bottom row: checklist/comment meta + assignee avatars */}
      {(checklist.total > 0 ||
        commentCount > 0 ||
        assignees.length > 0) && (
        <div className="mt-2 flex items-center justify-between">
          <TaskMetaBadges task={task} />
          {assignees.length > 0 && (
            <AvatarStack users={assignees} max={3} size="sm" showEmpty={false} />
          )}
        </div>
      )}
    </>
  );
}

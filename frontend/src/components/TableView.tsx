import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import type {
  TaskDto,
  BoardColumn,
  TaskStatus,
  GroupByKey,
  ViewDensity,
  UserRef,
  LabelRef,
} from '../types/api';
import Button from './ui/Button';
import AvatarStack from './AvatarStack';
import TaskMetaBadges from './TaskMetaBadges';
import { tagClass, type TagVariant } from '../theme/constants';
import {
  useBoardCustomFields,
  useBoardFieldValues,
  type CustomField,
  type TaskFieldValue,
} from '../api/customFields';
import { groupTasks, type GroupContext } from '../lib/groupBy';
import ViewToolbar from './ViewToolbar';
import Modal from './ui/Modal';

export interface TableViewState {
  sortKey: SortKey;
  sortDir: SortDir;
  filters: FilterChip[];
  filterMode: FilterMode;
  hiddenColumns?: string[];
  columnWidths?: Record<string, number>;
  columnOrder?: string[];
}

const ALL_COLUMN_IDS = ['title', 'column', 'due_date', 'assignees', 'info'] as const;
type ColumnId = (typeof ALL_COLUMN_IDS)[number];

interface TableViewProps {
  boardId: string;
  tasks: TaskDto[];
  columns: BoardColumn[];
  onTaskClick: (taskId: string) => void;
  onCreateTask?: (title: string, columnId: string) => void;
  onBulkMove?: (taskIds: string[], columnId: string) => void;
  onBulkDelete?: (taskIds: string[]) => void;
  /** Seed initial sort/filter state (e.g. from a loaded saved view). */
  defaultConfig?: Partial<TableViewState>;
  /** Called whenever sort/filter state changes — lets parent snapshot for SavedViewBar. */
  onStateChange?: (state: TableViewState) => void;
  /** Grouping spec. Defaults to `{ type: 'none' }`. */
  groupBy?: GroupByKey;
  onGroupByChange?: (g: GroupByKey) => void;
  /** Row density. Defaults to `normal`. */
  density?: ViewDensity;
  onDensityChange?: (d: ViewDensity) => void;
}

/**
 * One filter the user has added to the toolbar. Operators differ by field
 * type (text supports `contains`/`equals`/`empty`; select supports
 * `equals`/`empty`; checkbox supports `is_true`/`is_false`/`empty`).
 *
 * `value` is stored as a string for select labels and text needles, ignored
 * for empty/is_true/is_false.
 */
export interface FilterChip {
  id: string; // local UUID for React key
  fieldId: string;
  operator: string;
  value: string;
  /** Second value, used by `between` operator (numeric / date range). */
  value2?: string;
}

type FilterMode = 'and' | 'or';

type SortKey = 'title' | 'due_date' | 'column';
type SortDir = 'asc' | 'desc';

/**
 * Evaluate a single FilterChip against one task's value for that field.
 * Returns true if the task PASSES (stays in the filtered set).
 *
 * Operator semantics by field type:
 *   - text / url:    contains | equals | starts_with | ends_with | empty
 *   - number:        equals | gt | lt | gte | lte | between | empty
 *   - date:          equals | before | after | between | empty
 *   - select / ms:   equals | empty
 *   - checkbox:      is_true | is_false | empty
 *
 * `between` consumes both `chip.value` (lower bound) and `chip.value2`
 * (upper bound), inclusive on both ends.
 *
 * Unset value (undefined/null) only matches `empty`; all other operators
 * treat it as a fail so partial data doesn't accidentally satisfy filters.
 */
export function evaluateFilter(
  chip: FilterChip,
  field: CustomField,
  value: unknown,
): boolean {
  if (chip.operator === 'empty') {
    return value === undefined || value === null || value === '';
  }
  if (value === undefined || value === null) return false;

  if (field.field_type === 'checkbox') {
    const bool = value === true || value === 'true' || value === 1;
    if (chip.operator === 'is_true') return bool;
    if (chip.operator === 'is_false') return !bool;
    return false;
  }

  if (field.field_type === 'number') {
    const v = Number(value);
    if (!Number.isFinite(v)) return false;
    const a = Number(chip.value);
    if (chip.operator === 'between') {
      const b = Number(chip.value2);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      return v >= lo && v <= hi;
    }
    if (!Number.isFinite(a)) return false;
    if (chip.operator === 'equals') return v === a;
    if (chip.operator === 'gt') return v > a;
    if (chip.operator === 'lt') return v < a;
    if (chip.operator === 'gte') return v >= a;
    if (chip.operator === 'lte') return v <= a;
    return false;
  }

  if (field.field_type === 'date') {
    // Date values are ISO strings (`YYYY-MM-DD` or full RFC3339). String
    // compare on ISO is chronological — same trick used by sorting elsewhere.
    const v = String(value);
    if (chip.operator === 'between') {
      if (!chip.value || !chip.value2) return false;
      const [lo, hi] =
        chip.value <= chip.value2
          ? [chip.value, chip.value2]
          : [chip.value2, chip.value];
      return v >= lo && v <= hi;
    }
    if (!chip.value) return false;
    if (chip.operator === 'equals') return v.startsWith(chip.value);
    if (chip.operator === 'before') return v < chip.value;
    if (chip.operator === 'after') return v > chip.value;
    return false;
  }

  // text / url / select / fallback
  const stringVal = String(value).toLowerCase();
  const needle = chip.value.trim().toLowerCase();
  if (chip.operator === 'equals') return stringVal === needle;
  if (chip.operator === 'contains') return stringVal.includes(needle);
  if (chip.operator === 'starts_with') return stringVal.startsWith(needle);
  if (chip.operator === 'ends_with') return stringVal.endsWith(needle);
  return false;
}

/** Operators offered for a given field type. Order matters — first is default. */
export function operatorsFor(fieldType: string): string[] {
  if (fieldType === 'checkbox') return ['is_true', 'is_false', 'empty'];
  if (fieldType === 'select' || fieldType === 'multi_select') return ['equals', 'empty'];
  if (fieldType === 'number') return ['equals', 'gt', 'lt', 'gte', 'lte', 'between', 'empty'];
  if (fieldType === 'date') return ['equals', 'before', 'after', 'between', 'empty'];
  // text / url
  return ['contains', 'equals', 'starts_with', 'ends_with', 'empty'];
}

/** Whether the operator needs the secondary `value2` input (between). */
function operatorHasRange(op: string): boolean {
  return op === 'between';
}

/** HTML input type for the value field given the underlying custom field type. */
function valueInputType(fieldType: string): 'text' | 'number' | 'date' {
  if (fieldType === 'number') return 'number';
  if (fieldType === 'date') return 'date';
  return 'text';
}

export default function TableView({
  boardId,
  tasks,
  columns,
  onTaskClick,
  onCreateTask,
  onBulkMove,
  onBulkDelete,
  defaultConfig,
  onStateChange,
  groupBy = { type: 'none' },
  onGroupByChange,
  density = 'normal',
  onDensityChange,
}: TableViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>(defaultConfig?.sortKey ?? 'title');
  const [sortDir, setSortDir] = useState<SortDir>(defaultConfig?.sortDir ?? 'asc');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FilterChip[]>(defaultConfig?.filters ?? []);
  const [filterMode, setFilterMode] = useState<FilterMode>(defaultConfig?.filterMode ?? 'and');
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newColumnId, setNewColumnId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [hiddenColumns, setHiddenColumns] = useState<Set<ColumnId>>(
    new Set((defaultConfig?.hiddenColumns ?? []) as ColumnId[]),
  );
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(
    defaultConfig?.columnWidths ?? {},
  );
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [columnOrder, setColumnOrder] = useState<string[]>(
    defaultConfig?.columnOrder ?? [...ALL_COLUMN_IDS],
  );

  // Report state changes to parent so BoardViewPage can snapshot for SavedViewBar.
  useEffect(() => {
    onStateChange?.({
      sortKey,
      sortDir,
      filters,
      filterMode,
      hiddenColumns: Array.from(hiddenColumns),
      columnWidths,
      columnOrder,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortKey, sortDir, filters, filterMode, hiddenColumns, columnWidths, columnOrder]);
  const { t } = useTranslation();

  // Custom fields and their values for the entire board — feeds the filter
  // builder. Field defs let us populate the operator/value pickers; values
  // let us evaluate filters client-side without N task-level requests.
  const { data: fieldsData } = useBoardCustomFields(boardId);
  const { data: fieldValuesData } = useBoardFieldValues(boardId);
  const realFields = fieldsData?.items ?? [];

  // Built-in task columns are promoted to pseudo custom fields so they
  // appear in the Filter builder alongside user-defined fields. Synthetic
  // IDs are prefixed with `__builtin:` so the evaluator can dispatch them
  // to a per-field extractor without colliding with real UUIDs.
  const builtInFields: CustomField[] = useMemo(() => {
    const columnOpts = columns.map((c) => ({ label: c.id }));
    return [
      { id: '__builtin:title', board_id: boardId, name: 'Title', field_type: 'text', options: [], position: -100, required: false, show_on_card: false, created_at: '' },
      { id: '__builtin:due_date', board_id: boardId, name: 'Due date', field_type: 'date', options: [], position: -97, required: false, show_on_card: false, created_at: '' },
      { id: '__builtin:start_date', board_id: boardId, name: 'Start date', field_type: 'date', options: [], position: -96, required: false, show_on_card: false, created_at: '' },
      { id: '__builtin:column', board_id: boardId, name: 'Status', field_type: 'select', options: columnOpts, position: -95, required: false, show_on_card: false, created_at: '' },
    ];
  }, [boardId, columns]);

  const customFields: CustomField[] = useMemo(
    () => [...builtInFields, ...realFields],
    [builtInFields, realFields],
  );

  /** Extract value for a built-in pseudo-field from a task. Returns the
   * raw primitive so it can flow into the same evaluateFilter as custom
   * field values — date fields stay strings, select fields stay strings.
   */
  const builtInValue = (task: TaskDto, fieldId: string): unknown => {
    switch (fieldId) {
      case '__builtin:title':
        return task.title;
      case '__builtin:due_date':
        return task.due_date ?? null;
      case '__builtin:start_date':
        return task.start_date ?? null;
      case '__builtin:column':
        return task.column_id;
      default:
        return undefined;
    }
  };
  // Index field values by task_id → field_id → value for O(1) lookup during
  // the filter pass below.
  const valuesByTaskField = useMemo(() => {
    const m = new Map<string, Map<string, unknown>>();
    for (const v of fieldValuesData?.items ?? []) {
      let inner = m.get(v.task_id);
      if (!inner) {
        inner = new Map();
        m.set(v.task_id, inner);
      }
      inner.set(v.field_id, v.value);
    }
    return m;
  }, [fieldValuesData]);

  const columnMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of columns) m.set(c.id, c.title);
    return m;
  }, [columns]);

  // Ordered list of visible columns for rendering headers and cells.
  // Merges built-in columns + custom fields, sorted by columnOrder, filtered by hiddenColumns.
  const orderedVisibleColumns = useMemo(() => {
    const sortableIds = new Set<string>(['title', 'column', 'due_date']);
    const labelMap: Record<string, string> = {
      title: t('tableView.colTitle'),
      column: t('tableView.colColumn'),
      due_date: t('tableView.colDueDate'),
      assignees: t('tableView.colAssignees'),
      info: t('tableView.colInfo'),
    };
    const allIds = [...ALL_COLUMN_IDS as readonly string[], ...realFields.map((f) => f.id)];
    const sorted = [
      ...columnOrder.filter((id) => allIds.includes(id)),
      ...allIds.filter((id) => !columnOrder.includes(id)),
    ];
    return sorted
      .filter((id) => !hiddenColumns.has(id as ColumnId))
      .map((id) => ({
        id,
        label: labelMap[id] ?? realFields.find((f) => f.id === id)?.name ?? id,
        sortable: sortableIds.has(id),
        isCustomField: !ALL_COLUMN_IDS.includes(id as any),
      }));
  }, [columnOrder, hiddenColumns, realFields, t]);

  const columnColorMap = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const c of columns) m.set(c.id, c.color ?? null);
    return m;
  }, [columns]);

  const filtered = useMemo(() => {
    let list = [...tasks];
    if (search) {
      const q = search.toLowerCase();
      // Cover title + summary. Description (long-form Markdown) is drawer-only
      // and excluded from search to keep results aligned with what's visible
      // in the table row — users wouldn't understand why a card with no
      // matching cell text appears in results.
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.summary ?? '').toLowerCase().includes(q),
      );
    }
    // Custom filter chips. AND combines all chips; OR keeps a row that
    // satisfies at least one chip. Incomplete chips (no field) are skipped
    // so the user can edit a partially-built chip without rows flickering
    // out under them.
    const activeChips = filters.filter((c) => {
      if (!c.fieldId) return false;
      return customFields.some((f) => f.id === c.fieldId);
    });
    if (activeChips.length > 0) {
      list = list.filter((task) => {
        const evaluators = activeChips.map((chip) => {
          const field = customFields.find((f) => f.id === chip.fieldId)!;
          const value = field.id.startsWith('__builtin:')
            ? builtInValue(task, field.id)
            : valuesByTaskField.get(task.id)?.get(field.id);
          return evaluateFilter(chip, field, value);
        });
        return filterMode === 'or'
          ? evaluators.some(Boolean)
          : evaluators.every(Boolean);
      });
    }
    return list;
  }, [tasks, search, filters, filterMode, customFields, valuesByTaskField]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case 'title':
          return dir * a.title.localeCompare(b.title);
        case 'due_date': {
          const da = a.due_date ?? '';
          const db = b.due_date ?? '';
          return dir * da.localeCompare(db);
        }
        case 'column': {
          const ca = columnMap.get(a.column_id) ?? '';
          const cb = columnMap.get(b.column_id) ?? '';
          return dir * ca.localeCompare(cb);
        }
        default:
          return 0;
      }
    });
    return list;
  }, [filtered, sortKey, sortDir, columnMap]);

  // Derive label/user definitions from observed tasks — same approach as
  // BoardViewPage. Empty groups (definitions with no matching tasks) still
  // appear so the user can see there's nothing in that bucket.
  const grouped = useMemo(() => {
    if (groupBy.type === 'none') return null;
    const obsLabels = new Map<string, LabelRef>();
    const obsUsers = new Map<string, UserRef>();
    for (const t of sorted) {
      for (const l of t.labels ?? []) obsLabels.set(l.id, l);
      for (const u of t.assignees ?? []) obsUsers.set(u.id, u);
    }
    const ctx: GroupContext = {
      columns,
      labels: Array.from(obsLabels.values()).map((l) => ({
        id: l.id,
        board_id: boardId,
        name: l.name,
        color: l.color,
        created_at: '',
      })),
      users: Array.from(obsUsers.values()),
      fields: customFields,
      fieldValues: fieldValuesData?.items ?? [],
    };
    return groupTasks(sorted, groupBy, ctx).filter((g) => g.tasks.length > 0);
  }, [groupBy, sorted, columns, customFields, fieldValuesData, boardId]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col)
      return (
        <span className="ml-1" style={{ color: 'var(--color-text-muted)' }}>
          {'\u2195'}
        </span>
      );
    return <span className="ml-1">{sortDir === 'asc' ? '\u25b2' : '\u25bc'}</span>;
  };

  const inputStyle = {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text)',
  } as const;

  const handleAddTask = () => {
    if (!newTitle.trim() || !newColumnId || !onCreateTask) return;
    onCreateTask(newTitle, newColumnId);
    setNewTitle('');
    setAdding(false);
  };

  const rowPad = density === 'compact' ? 'py-1.5' : 'py-2.5';

  const renderFieldCell = (field: CustomField, value: unknown): React.ReactNode => {
    if (value === undefined || value === null) return '-';
    switch (field.field_type) {
      case 'checkbox':
        return (value === true || value === 'true') ? '✓' : '-';
      case 'date':
        return typeof value === 'string' ? new Date(value).toLocaleDateString() : '-';
      case 'number':
      case 'progress':
        return String(value);
      case 'select': {
        const opt = (field.options ?? []).find((o) => o.label === value);
        const color = (opt as any)?.color as string | undefined;
        return <OptionBadge label={String(value)} color={color} />;
      }
      case 'multi_select': {
        const vals = Array.isArray(value) ? value : [value];
        return (
          <div className="flex flex-wrap gap-1">
            {vals.map((v, i) => {
              const opt = (field.options ?? []).find((o) => o.label === v);
              const color = (opt as any)?.color as string | undefined;
              return <OptionBadge key={i} label={String(v)} color={color} />;
            })}
          </div>
        );
      }
      default:
        return String(value);
    }
  };

  const renderCell = (colId: string, task: TaskDto): React.ReactNode => {
    switch (colId) {
      case 'title':
        return (
          <div>
            {(task.labels ?? []).length > 0 && (
              <div className="flex gap-1 mb-0.5">
                {(task.labels ?? []).map((l) => (
                  <span key={l.id} className="inline-block h-1.5 w-6 rounded-full" style={{ backgroundColor: l.color }} />
                ))}
              </div>
            )}
            <span className="font-medium" style={{ color: 'var(--color-text)' }}>{task.title}</span>
            {density !== 'compact' && task.summary && (
              <span className="text-xs ml-2" style={{ color: 'var(--color-text-secondary)' }}>{task.summary}</span>
            )}
          </div>
        );
      case 'column': {
        const colName = columnMap.get(task.column_id);
        const colColor = columnColorMap.get(task.column_id);
        if (!colName) return '-';
        return (
          <span
            className="inline-block text-xs font-medium px-2 py-0.5 rounded"
            style={{
              backgroundColor: colColor ? `${colColor}22` : 'var(--color-surface-hover)',
              color: colColor ?? 'var(--color-text-secondary)',
              border: colColor ? `1px solid ${colColor}44` : '1px solid var(--color-border)',
            }}
          >
            {colName}
          </span>
        );
      }
      case 'due_date':
        return task.due_date ? new Date(task.due_date).toLocaleDateString() : '-';
      case 'assignees':
        return <AvatarStack users={task.assignees ?? []} max={3} size="md" />;
      case 'info':
        return <TaskMetaBadges task={task} />;
      default: {
        // Custom field
        const field = realFields.find((f) => f.id === colId);
        if (!field) return '-';
        return renderFieldCell(field, valuesByTaskField.get(task.id)?.get(colId));
      }
    }
  };

  const renderTaskRow = (task: TaskDto) => (
    <tr
      key={task.id}
      onClick={() => onTaskClick(task.id)}
      className="hover:bg-[var(--color-surface-active)] cursor-pointer"
    >
      {(onBulkMove || onBulkDelete) && (
        <td
          className={`px-3 w-8 ${rowPad}`}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            aria-label={`Select ${task.title}`}
            checked={selected.has(task.id)}
            onChange={(e) => {
              const next = new Set(selected);
              if (e.target.checked) next.add(task.id);
              else next.delete(task.id);
              setSelected(next);
            }}
          />
        </td>
      )}
      {orderedVisibleColumns.map((col) => (
        <td key={col.id} className={`px-4 ${col.id === 'due_date' ? 'text-xs' : ''} ${rowPad}`} style={col.isCustomField || col.id === 'due_date' ? { color: 'var(--color-text-secondary)' } : undefined}>
          {renderCell(col.id, task)}
        </td>
      ))}
    </tr>
  );

  const filterAddDisabled = customFields.length === 0;

  return (
    <div className="p-4">
      {/* Single unified toolbar: Search · Group · +Filter · Properties ·
          count · Density · +New. All view-scoped controls live in the
          same row so users don't have to scan two stripes for the
          related actions. */}
      <ViewToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t('tableView.searchPlaceholder')}
        groupBy={groupBy}
        onGroupByChange={onGroupByChange}
        groupByOptions={[
          'none',
          'column',
          'status',
          'priority',
          'assignee',
          'label',
          'custom_field',
        ]}
        customFields={customFields.filter((f) => !f.id.startsWith('__builtin:'))}
        density={density}
        onDensityChange={onDensityChange}
        leftExtras={
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const firstField = customFields[0];
                if (!firstField) return;
                setFilters([
                  ...filters,
                  {
                    id: crypto.randomUUID(),
                    fieldId: firstField.id,
                    operator: operatorsFor(firstField.field_type)[0],
                    value: '',
                  },
                ]);
              }}
              disabled={filterAddDisabled}
            >
              + {t('tableView.addFilter')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setPropertiesOpen(true)}
            >
              {t('tableView.properties')}
            </Button>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {t('tableView.count', { count: sorted.length })}
            </span>
          </>
        }
        rightExtras={
          onCreateTask ? (
            <Button size="sm" onClick={() => setAdding(true)}>
              {t('board.addTask')}
            </Button>
          ) : null
        }
      />

      {/* Active filter chips. Each chip is editable in place — change the
          field, operator, or value and the table re-filters live. */}
      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {/* AND/OR mode toggle. Visible only when ≥ 2 chips since a single
              chip's mode is meaningless. Combinator label appears between
              chips below to make the relation explicit. */}
          {filters.length >= 2 && (
            <div
              className="inline-flex rounded text-xs overflow-hidden"
              style={{ border: '1px solid var(--color-border)' }}
            >
              {(['and', 'or'] as FilterMode[]).map((m) => {
                const active = filterMode === m;
                return (
                  <button
                    key={m}
                    onClick={() => setFilterMode(m)}
                    className="px-2 py-0.5 font-medium uppercase"
                    style={{
                      backgroundColor: active
                        ? 'var(--color-primary)'
                        : 'var(--color-surface)',
                      color: active
                        ? 'var(--color-text-inverse)'
                        : 'var(--color-text-secondary)',
                    }}
                  >
                    {t(`tableView.mode.${m}`)}
                  </button>
                );
              })}
            </div>
          )}
          {filters.map((chip, idx) => (
            <span key={chip.id} className="inline-flex items-center gap-2">
              {idx > 0 && (
                <span
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {t(`tableView.mode.${filterMode}`)}
                </span>
              )}
              <FilterChipEditor
                chip={chip}
                fields={customFields}
                onChange={(next) =>
                  setFilters((prev) => prev.map((c) => (c.id === chip.id ? next : c)))
                }
                onRemove={() =>
                  setFilters((prev) => prev.filter((c) => c.id !== chip.id))
                }
              />
            </span>
          ))}
          <button
            onClick={() => setFilters([])}
            className="text-xs hover:underline"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {t('tableView.clearFilters')}
          </button>
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div
          className="flex items-center gap-3 px-4 py-2 mb-3 rounded-lg"
          style={{
            backgroundColor: 'var(--color-primary-light)',
            border: '1px solid var(--color-primary)',
          }}
        >
          <span className="text-sm font-medium" style={{ color: 'var(--color-primary-text)' }}>
            {t('tableView.selectedCount', { count: selected.size })}
          </span>
          {onBulkMove && (
            <select
              onChange={(e) => {
                if (e.target.value) {
                  onBulkMove([...selected], e.target.value);
                  setSelected(new Set());
                }
              }}
              defaultValue=""
              className="text-xs rounded px-2 py-1"
              style={inputStyle}
            >
              <option value="">{t('tableView.moveToColumn')}</option>
              {columns.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          )}
          {onBulkDelete && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (confirm(t('tableView.confirmBulkDelete', { count: selected.size }))) {
                  onBulkDelete([...selected]);
                  setSelected(new Set());
                }
              }}
            >
              {t('common.delete')}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            {t('tableView.clearSelection')}
          </Button>
        </div>
      )}

      {/* Inline add row */}
      {adding && onCreateTask && (
        <div className="flex gap-2 mb-3 items-center">
          <input
            autoFocus
            className="rounded-lg px-3 py-1.5 text-sm flex-1 outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
            placeholder={t('board.taskTitle')}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
            style={inputStyle}
          />
          <select
            className="rounded-lg px-2 py-1.5 text-sm"
            value={newColumnId}
            onChange={(e) => setNewColumnId(e.target.value)}
            style={inputStyle}
          >
            <option value="">{t('tableView.columnPlaceholder')}</option>
            {columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={handleAddTask} disabled={!newTitle.trim() || !newColumnId}>
            {t('common.create')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      )}

      {/* Table */}
      <div
        className="overflow-x-auto rounded-lg"
        style={{ border: '1px solid var(--color-border)' }}
      >
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: 'var(--color-surface-hover)' }}>
            <tr>
              {(onBulkMove || onBulkDelete) && (
                <th className="px-3 py-2.5 w-8">
                  <input
                    type="checkbox"
                    aria-label={t('tableView.selectAll')}
                    checked={sorted.length > 0 && selected.size === sorted.length}
                    ref={(el) => {
                      if (el) el.indeterminate = selected.size > 0 && selected.size < sorted.length;
                    }}
                    onChange={(e) => {
                      if (e.target.checked) setSelected(new Set(sorted.map((t) => t.id)));
                      else setSelected(new Set());
                    }}
                  />
                </th>
              )}
              {orderedVisibleColumns.map((col) => (
                <th
                  key={col.id}
                  onClick={col.sortable ? () => handleSort(col.id as SortKey) : undefined}
                  className={`px-4 py-2.5 text-left font-medium relative group select-none ${col.sortable ? 'cursor-pointer hover:bg-[var(--color-surface-active)]' : ''}`}
                  style={{
                    color: 'var(--color-text-secondary)',
                    width: columnWidths[col.id],
                    minWidth: columnWidths[col.id],
                  }}
                >
                  {col.label}
                  {col.sortable && <SortIcon col={col.id as SortKey} />}
                  <ColumnResizeHandle
                    columnKey={col.id}
                    onResize={(w) =>
                      setColumnWidths((prev) => ({ ...prev, [col.id]: w }))
                    }
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody
            className="divide-y"
            style={{ backgroundColor: 'var(--color-surface)' }}>
            {grouped
              ? grouped.flatMap((group) => {
                  const collapsed = collapsedGroups.has(group.key);
                  const rows: React.ReactNode[] = [
                    <tr
                      key={`group-${group.key}`}
                      className="cursor-pointer select-none"
                      style={{
                        backgroundColor: 'var(--color-surface-hover)',
                        borderTop: group.color
                          ? `2px solid ${group.color}`
                          : undefined,
                      }}
                      onClick={() =>
                        setCollapsedGroups((prev) => {
                          const next = new Set(prev);
                          if (next.has(group.key)) next.delete(group.key);
                          else next.add(group.key);
                          return next;
                        })
                      }
                    >
                      <td
                        colSpan={(onBulkMove || onBulkDelete ? 1 : 0) + (5 + realFields.length - hiddenColumns.size)}
                        className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        <span className="mr-2 inline-block w-3">
                          {collapsed ? '▸' : '▾'}
                        </span>
                        {group.color && (
                          <span
                            className="inline-block w-2 h-2 rounded-full mr-2"
                            style={{ backgroundColor: group.color }}
                          />
                        )}
                        {group.label}
                        <span
                          className="ml-2 font-normal"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          · {group.tasks.length}
                        </span>
                      </td>
                    </tr>,
                  ];
                  if (!collapsed) {
                    for (const task of group.tasks) {
                      rows.push(renderTaskRow(task));
                    }
                  }
                  return rows;
                })
              : sorted.map((task) => renderTaskRow(task))}
            {((grouped && grouped.length === 0) ||
              (!grouped && sorted.length === 0)) && (
              <tr>
                <td
                  colSpan={(onBulkMove || onBulkDelete ? 1 : 0) + (5 + realFields.length - hiddenColumns.size)}
                  className="px-4 py-8 text-center"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {t('tableView.noTasks')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Properties Modal — column visibility + ordering */}
      {propertiesOpen && (
        <Modal
          title={t('tableView.properties')}
          onClose={() => setPropertiesOpen(false)}
          width="max-w-sm"
        >
          <div className="space-y-1">
            <PropertiesDndList
              columnOrder={columnOrder}
              setColumnOrder={setColumnOrder}
              hiddenColumns={hiddenColumns}
              setHiddenColumns={setHiddenColumns}
              realFields={realFields}
              t={t}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * Inline editor for one FilterChip. Three pickers laid out horizontally:
 * field → operator → value. The value control morphs based on field type:
 *
 *   • select / multi_select → dropdown of option labels
 *   • checkbox → no value (true/false is in the operator)
 *   • text / number / url / date → free text input
 *
 * All edits flow through `onChange` so the parent's state is the single
 * source of truth — chip remains controlled.
 */
function FilterChipEditor({
  chip,
  fields,
  onChange,
  onRemove,
}: {
  chip: FilterChip;
  fields: CustomField[];
  onChange: (next: FilterChip) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const field = fields.find((f) => f.id === chip.fieldId);
  const operators = field ? operatorsFor(field.field_type) : [];
  const showValueInput =
    field?.field_type !== 'checkbox' && chip.operator !== 'empty';
  const isSelect =
    field?.field_type === 'select' || field?.field_type === 'multi_select';
  const showRange = operatorHasRange(chip.operator);
  const inputType = field ? valueInputType(field.field_type) : 'text';

  const inputStyle = {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text)',
  } as const;

  return (
    <div
      className="inline-flex items-center gap-1 rounded-lg p-1"
      style={{
        backgroundColor: 'var(--color-surface-hover)',
        border: '1px solid var(--color-border)',
      }}
    >
      <select
        value={chip.fieldId}
        onChange={(e) => {
          const nextField = fields.find((f) => f.id === e.target.value);
          onChange({
            ...chip,
            fieldId: e.target.value,
            operator: nextField ? operatorsFor(nextField.field_type)[0] : 'equals',
            value: '',
            value2: '',
          });
        }}
        className="text-xs rounded px-1.5 py-0.5"
        style={inputStyle}
      >
        {fields.map((f) => (
          <option key={f.id} value={f.id}>{f.name}</option>
        ))}
      </select>
      <select
        value={chip.operator}
        onChange={(e) =>
          onChange({ ...chip, operator: e.target.value, value: '', value2: '' })
        }
        className="text-xs rounded px-1.5 py-0.5"
        style={inputStyle}
      >
        {operators.map((op) => (
          <option key={op} value={op}>
            {t(`tableView.op.${op}`)}
          </option>
        ))}
      </select>
      {showValueInput &&
        (isSelect ? (
          <select
            value={chip.value}
            onChange={(e) => onChange({ ...chip, value: e.target.value })}
            className="text-xs rounded px-1.5 py-0.5"
            style={inputStyle}
          >
            <option value="">--</option>
            {(field?.options ?? []).map((opt) => (
              <option key={opt.label} value={opt.label}>{opt.label}</option>
            ))}
          </select>
        ) : (
          <>
            <input
              type={inputType}
              value={chip.value}
              onChange={(e) => onChange({ ...chip, value: e.target.value })}
              className="text-xs rounded px-1.5 py-0.5 outline-none"
              style={{ ...inputStyle, width: inputType === 'date' ? '8rem' : '6rem' }}
              placeholder="…"
            />
            {showRange && (
              <>
                <span
                  className="text-[10px] uppercase font-semibold"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {t('tableView.and')}
                </span>
                <input
                  type={inputType}
                  value={chip.value2 ?? ''}
                  onChange={(e) => onChange({ ...chip, value2: e.target.value })}
                  className="text-xs rounded px-1.5 py-0.5 outline-none"
                  style={{ ...inputStyle, width: inputType === 'date' ? '8rem' : '6rem' }}
                  placeholder="…"
                />
              </>
            )}
          </>
        ))}
      <button
        onClick={onRemove}
        aria-label={t('common.delete')}
        className="text-xs px-1 hover:opacity-70"
        style={{ color: 'var(--color-text-muted)' }}
      >
        ✕
      </button>
    </div>
  );
}

/**
 * Drag-to-resize grip on the right edge of a <th>. Stops propagation so
 * the click doesn't trigger the column's sort handler. Tracks the
 * initial pointer position + the column's current width on pointerdown
 * and updates width live on pointermove, ending on pointerup.
 */
function ColumnResizeHandle({
  columnKey,
  onResize,
}: {
  columnKey: string;
  onResize: (width: number) => void;
}) {
  const startRef = useRef<{ x: number; width: number; th: HTMLElement } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const th = e.currentTarget.parentElement as HTMLElement | null;
    if (!th) return;
    startRef.current = { x: e.clientX, width: th.offsetWidth, th };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!startRef.current) return;
    const delta = e.clientX - startRef.current.x;
    const next = Math.max(60, startRef.current.width + delta);
    onResize(next);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!startRef.current) return;
    startRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <span
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={(e) => e.stopPropagation()}
      aria-hidden="true"
      className="absolute top-0 right-0 h-full w-1 cursor-col-resize opacity-0 group-hover:opacity-100"
      style={{ backgroundColor: 'var(--color-primary)' }}
      title={`Resize ${columnKey}`}
    />
  );
}

/** Drag-and-drop list for the Properties modal. */
function PropertiesDndList({
  columnOrder,
  setColumnOrder,
  hiddenColumns,
  setHiddenColumns,
  realFields,
  t,
}: {
  columnOrder: string[];
  setColumnOrder: React.Dispatch<React.SetStateAction<string[]>>;
  hiddenColumns: Set<ColumnId>;
  setHiddenColumns: React.Dispatch<React.SetStateAction<Set<ColumnId>>>;
  realFields: CustomField[];
  t: (key: string) => string;
}) {
  const colLabel = (id: string) => {
    switch (id) {
      case 'title': return t('tableView.colTitle');
      case 'column': return t('tableView.colColumn');
      case 'due_date': return t('tableView.colDueDate');
      case 'assignees': return t('tableView.colAssignees');
      case 'info': return t('tableView.colInfo');
      default: {
        const f = realFields.find((rf) => rf.id === id);
        return f?.name ?? id;
      }
    }
  };

  // Build ordered list: start from columnOrder, add any missing items at the end
  const allIds = [...ALL_COLUMN_IDS as readonly string[], ...realFields.map((f) => f.id)];
  const ordered = [
    ...columnOrder.filter((id) => allIds.includes(id)),
    ...allIds.filter((id) => !columnOrder.includes(id)),
  ];

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const list = [...ordered];
    const [moved] = list.splice(result.source.index, 1);
    list.splice(result.destination.index, 0, moved);
    setColumnOrder(list);
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="properties-list">
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
            {ordered.map((id, idx) => {
              const hidden = hiddenColumns.has(id as ColumnId);
              return (
                <Draggable key={id} draggableId={id} index={idx}>
                  {(dragProvided, snapshot) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg"
                      style={{
                        ...dragProvided.draggableProps.style,
                        backgroundColor: snapshot.isDragging
                          ? 'var(--color-primary-light)'
                          : hidden ? 'transparent' : 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        opacity: hidden ? 0.5 : 1,
                      }}
                    >
                      <span
                        {...dragProvided.dragHandleProps}
                        className="text-xs cursor-grab select-none"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        ⠿
                      </span>
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 rounded"
                        checked={!hidden}
                        onChange={() =>
                          setHiddenColumns((prev) => {
                            const next = new Set(prev);
                            if (next.has(id as ColumnId)) next.delete(id as ColumnId);
                            else next.add(id as ColumnId);
                            return next;
                          })
                        }
                      />
                      <span className="flex-1 text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                        {colLabel(id)}
                      </span>
                    </div>
                  )}
                </Draggable>
              );
            })}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}

/** Renders a select option value as a colored badge.
 *  Supports both semantic tokens (info/warning/success/...) and hex colors (#rrggbb). */
const SEMANTIC_TOKENS = new Set(['neutral','info','success','warning','orange','danger','critical','accent']);

function OptionBadge({ label, color }: { label: string; color?: string }) {
  if (color && SEMANTIC_TOKENS.has(color)) {
    return (
      <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${tagClass(color as TagVariant)}`}>
        {label}
      </span>
    );
  }
  // hex color or no color
  return (
    <span
      className="inline-block text-xs font-medium px-2 py-0.5 rounded"
      style={{
        backgroundColor: color ? `${color}22` : 'var(--color-surface-hover)',
        color: color ?? 'var(--color-text-secondary)',
        border: color ? `1px solid ${color}44` : '1px solid var(--color-border)',
      }}
    >
      {label}
    </span>
  );
}

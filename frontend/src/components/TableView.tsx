import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TaskDto, BoardColumn, Priority, TaskStatus } from '../types/api';
import Badge from './ui/Badge';
import Button from './ui/Button';
import { useTagTheme } from '../theme/constants';
import {
  useBoardCustomFields,
  useBoardFieldValues,
  type CustomField,
  type TaskFieldValue,
} from '../api/customFields';

interface TableViewProps {
  boardId: string;
  tasks: TaskDto[];
  columns: BoardColumn[];
  onTaskClick: (taskId: string) => void;
  onCreateTask?: (title: string, columnId: string) => void;
  onBulkMove?: (taskIds: string[], columnId: string) => void;
  onBulkDelete?: (taskIds: string[]) => void;
}

/**
 * One filter the user has added to the toolbar. Operators differ by field
 * type (text supports `contains`/`equals`/`empty`; select supports
 * `equals`/`empty`; checkbox supports `is_true`/`is_false`/`empty`).
 *
 * `value` is stored as a string for select labels and text needles, ignored
 * for empty/is_true/is_false.
 */
interface FilterChip {
  id: string; // local UUID for React key
  fieldId: string;
  operator: string;
  value: string;
  /** Second value, used by `between` operator (numeric / date range). */
  value2?: string;
}

type FilterMode = 'and' | 'or';

type SortKey = 'title' | 'priority' | 'status' | 'due_date' | 'column';
type SortDir = 'asc' | 'desc';

const priorityOrder: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

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
function evaluateFilter(
  chip: FilterChip,
  field: CustomField,
  value: unknown,
): boolean {
  if (chip.operator === 'empty') {
    return value === undefined || value === null || value === '';
  }
  if (value === undefined || value === null) return false;

  if (field.field_type === 'checkbox') {
    if (chip.operator === 'is_true') return value === true;
    if (chip.operator === 'is_false') return value === false;
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
function operatorsFor(fieldType: string): string[] {
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
}: TableViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FilterChip[]>([]);
  const [filterMode, setFilterMode] = useState<FilterMode>('and');
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newColumnId, setNewColumnId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { t } = useTranslation();
  const { priorityClass, statusClass } = useTagTheme();

  // Custom fields and their values for the entire board — feeds the filter
  // builder. Field defs let us populate the operator/value pickers; values
  // let us evaluate filters client-side without N task-level requests.
  const { data: fieldsData } = useBoardCustomFields(boardId);
  const { data: fieldValuesData } = useBoardFieldValues(boardId);
  const customFields = fieldsData?.items ?? [];
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
          return evaluateFilter(
            chip,
            field,
            valuesByTaskField.get(task.id)?.get(field.id),
          );
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
        case 'priority':
          return dir * (priorityOrder[a.priority] - priorityOrder[b.priority]);
        case 'status':
          return dir * a.status.localeCompare(b.status);
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

  return (
    <div className="p-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <input
          type="text"
          placeholder={t('tableView.searchPlaceholder')}
          className="rounded-lg px-3 py-1.5 text-sm w-64 outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={inputStyle}
        />
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
          disabled={customFields.length === 0}
        >
          + {t('tableView.addFilter')}
        </Button>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {t('tableView.count', { count: sorted.length })}
        </span>
        {onCreateTask && (
          <Button size="sm" onClick={() => setAdding(true)} className="ml-auto">
            {t('board.addTask')}
          </Button>
        )}
      </div>

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
              {(
                [
                  ['title', t('tableView.colTitle')],
                  ['column', t('tableView.colColumn')],
                  ['status', t('tableView.colStatus')],
                  ['priority', t('tableView.colPriority')],
                  ['due_date', t('tableView.colDueDate')],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => handleSort(key)}
                  className="px-4 py-2.5 text-left font-medium cursor-pointer hover:bg-[var(--color-surface-active)] select-none"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {label}
                  <SortIcon col={key} />
                </th>
              ))}
              <th
                className="px-4 py-2.5 text-left font-medium"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {t('tableView.colAssignees')}
              </th>
              <th
                className="px-4 py-2.5 text-left font-medium w-16"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {t('tableView.colInfo')}
              </th>
            </tr>
          </thead>
          <tbody
            className="divide-y"
            style={{ backgroundColor: 'var(--color-surface)' }}>
            {sorted.map((task) => (
              <tr
                key={task.id}
                onClick={() => onTaskClick(task.id)}
                className="hover:bg-[var(--color-surface-active)] cursor-pointer"
              >
                {(onBulkMove || onBulkDelete) && (
                  <td className="px-3 py-2.5 w-8" onClick={(e) => e.stopPropagation()}>
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
                <td className="px-4 py-2.5">
                  <div>
                    {/* Labels */}
                    {(task.labels ?? []).length > 0 && (
                      <div className="flex gap-1 mb-0.5">
                        {(task.labels ?? []).map((l) => (
                          <span
                            key={l.id}
                            className="inline-block h-1.5 w-6 rounded-full"
                            style={{ backgroundColor: l.color }}
                          />
                        ))}
                      </div>
                    )}
                    <span className="font-medium" style={{ color: 'var(--color-text)' }}>
                      {task.title}
                    </span>
                    {task.summary && (
                      <span
                        className="text-xs ml-2"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {task.summary}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5" style={{ color: 'var(--color-text-secondary)' }}>
                  {columnMap.get(task.column_id) ?? '-'}
                </td>
                <td className="px-4 py-2.5">
                  <Badge className={statusClass(task.status)}>
                    {task.status.replace('_', ' ')}
                  </Badge>
                </td>
                <td className="px-4 py-2.5">
                  <Badge className={priorityClass(task.priority)}>
                    {task.priority}
                  </Badge>
                </td>
                <td
                  className="px-4 py-2.5 text-xs"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {task.due_date
                    ? new Date(task.due_date).toLocaleDateString()
                    : '-'}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex -space-x-1">
                    {(task.assignees ?? []).slice(0, 3).map((a) => (
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
                    {(task.assignees ?? []).length > 3 && (
                      <div
                        className="w-6 h-6 rounded-full text-xs flex items-center justify-center"
                        style={{
                          backgroundColor: 'var(--color-surface-hover)',
                          color: 'var(--color-text-secondary)',
                          border: '2px solid var(--color-surface)',
                        }}
                      >
                        +{(task.assignees ?? []).length - 3}
                      </div>
                    )}
                    {(task.assignees ?? []).length === 0 && (
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        -
                      </span>
                    )}
                  </div>
                </td>
                <td
                  className="px-4 py-2.5 text-xs"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  <div className="flex gap-2">
                    {(task.checklist_summary?.total ?? 0) > 0 && (
                      <span title={t('tableView.checklistProgress')}>
                        {(task.checklist_summary?.checked ?? 0)}/{(task.checklist_summary?.total ?? 0)}
                      </span>
                    )}
                    {(task.comment_count ?? 0) > 0 && (
                      <span title={t('task.comments')}>
                        {(task.comment_count ?? 0)}c
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={onBulkMove || onBulkDelete ? 8 : 7}
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

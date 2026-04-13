import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TaskDto, BoardColumn, Priority, TaskStatus } from '../types/api';
import Badge from './ui/Badge';
import Button from './ui/Button';
import { useTagTheme } from '../theme/constants';

interface TableViewProps {
  tasks: TaskDto[];
  columns: BoardColumn[];
  onTaskClick: (taskId: string) => void;
  onCreateTask?: (title: string, columnId: string) => void;
  onBulkMove?: (taskIds: string[], columnId: string) => void;
  onBulkDelete?: (taskIds: string[]) => void;
}

type SortKey = 'title' | 'priority' | 'status' | 'due_date' | 'column';
type SortDir = 'asc' | 'desc';

const priorityOrder: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export default function TableView({
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
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterPriority, setFilterPriority] = useState<string>('');
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newColumnId, setNewColumnId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { t } = useTranslation();
  const { priorityClass, statusClass } = useTagTheme();

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
    if (filterStatus) {
      list = list.filter((t) => t.status === filterStatus);
    }
    if (filterPriority) {
      list = list.filter((t) => t.priority === filterPriority);
    }
    return list;
  }, [tasks, search, filterStatus, filterPriority]);

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
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          placeholder={t('tableView.searchPlaceholder')}
          className="rounded-lg px-3 py-1.5 text-sm w-64 outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={inputStyle}
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-lg px-2 py-1.5 text-sm"
          style={inputStyle}
        >
          <option value="">{t('tableView.allStatuses')}</option>
          <option value="open">{t('tableView.statusOpen')}</option>
          <option value="in_progress">{t('tableView.statusInProgress')}</option>
          <option value="done">{t('tableView.statusDone')}</option>
          <option value="archived">{t('tableView.statusArchived')}</option>
        </select>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="rounded-lg px-2 py-1.5 text-sm"
          style={inputStyle}
        >
          <option value="">{t('tableView.allPriorities')}</option>
          <option value="urgent">{t('tableView.priorityUrgent')}</option>
          <option value="high">{t('tableView.priorityHigh')}</option>
          <option value="medium">{t('tableView.priorityMedium')}</option>
          <option value="low">{t('tableView.priorityLow')}</option>
        </select>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {t('tableView.count', { count: sorted.length })}
        </span>
        {onCreateTask && (
          <Button size="sm" onClick={() => setAdding(true)} className="ml-auto">
            {t('board.addTask')}
          </Button>
        )}
      </div>

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

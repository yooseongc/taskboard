import { useState, useMemo } from 'react';
import type { TaskDto, BoardColumn, Priority, TaskStatus } from '../types/api';
import Badge from './ui/Badge';
import Button from './ui/Button';
import { priorityClass } from '../theme/constants';

interface TableViewProps {
  tasks: TaskDto[];
  columns: BoardColumn[];
  onTaskClick: (taskId: string) => void;
  onCreateTask?: (title: string, columnId: string) => void;
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
}: TableViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterPriority, setFilterPriority] = useState<string>('');
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newColumnId, setNewColumnId] = useState('');

  const columnMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of columns) m.set(c.id, c.title);
    return m;
  }, [columns]);

  const filtered = useMemo(() => {
    let list = [...tasks];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((t) => t.title.toLowerCase().includes(q));
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
    if (sortKey !== col) return <span className="ml-1 text-gray-300">\u2195</span>;
    return <span className="ml-1">{sortDir === 'asc' ? '\u25b2' : '\u25bc'}</span>;
  };

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
          placeholder="Search tasks..."
          className="border rounded-lg px-3 py-1.5 text-sm w-64 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border rounded-lg px-2 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
          <option value="archived">Archived</option>
        </select>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="border rounded-lg px-2 py-1.5 text-sm"
        >
          <option value="">All priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <span className="text-xs text-gray-400">{sorted.length} task(s)</span>
        {onCreateTask && (
          <Button size="sm" onClick={() => setAdding(true)} className="ml-auto">
            + Add Task
          </Button>
        )}
      </div>

      {/* Inline add row */}
      {adding && onCreateTask && (
        <div className="flex gap-2 mb-3 items-center">
          <input
            autoFocus
            className="border rounded-lg px-3 py-1.5 text-sm flex-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="Task title..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
          />
          <select
            className="border rounded-lg px-2 py-1.5 text-sm"
            value={newColumnId}
            onChange={(e) => setNewColumnId(e.target.value)}
          >
            <option value="">Column...</option>
            {columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={handleAddTask} disabled={!newTitle.trim() || !newColumnId}>
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {(
                [
                  ['title', 'Title'],
                  ['column', 'Column'],
                  ['status', 'Status'],
                  ['priority', 'Priority'],
                  ['due_date', 'Due Date'],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => handleSort(key)}
                  className="px-4 py-2.5 text-left font-medium text-gray-600 cursor-pointer hover:bg-gray-100 select-none"
                >
                  {label}
                  <SortIcon col={key} />
                </th>
              ))}
              <th className="px-4 py-2.5 text-left font-medium text-gray-600">
                Assignees
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-gray-600 w-16">
                Info
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((task) => (
              <tr
                key={task.id}
                onClick={() => onTaskClick(task.id)}
                className="hover:bg-blue-50 cursor-pointer"
              >
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
                    <span className="font-medium">{task.title}</span>
                    {task.description && (
                      <span className="text-xs text-gray-400 ml-2 truncate">
                        {task.description.slice(0, 40)}
                        {task.description.length > 40 ? '...' : ''}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-gray-500">
                  {columnMap.get(task.column_id) ?? '-'}
                </td>
                <td className="px-4 py-2.5">
                  <Badge className={
                    task.status === 'done' ? 'bg-green-100 text-green-700' :
                    task.status === 'in_progress' ? 'bg-amber-100 text-amber-700' :
                    task.status === 'open' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-500'
                  }>
                    {task.status.replace('_', ' ')}
                  </Badge>
                </td>
                <td className="px-4 py-2.5">
                  <Badge className={priorityClass(task.priority)}>
                    {task.priority}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-gray-500 text-xs">
                  {task.due_date
                    ? new Date(task.due_date).toLocaleDateString()
                    : '-'}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex -space-x-1">
                    {(task.assignees ?? []).slice(0, 3).map((a) => (
                      <div
                        key={a.id}
                        className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center border-2 border-white"
                        title={a.name}
                      >
                        {a.name.charAt(0).toUpperCase()}
                      </div>
                    ))}
                    {(task.assignees ?? []).length > 3 && (
                      <div className="w-6 h-6 rounded-full bg-gray-300 text-gray-600 text-xs flex items-center justify-center border-2 border-white">
                        +{(task.assignees ?? []).length - 3}
                      </div>
                    )}
                    {(task.assignees ?? []).length === 0 && (
                      <span className="text-xs text-gray-300">-</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-400">
                  <div className="flex gap-2">
                    {(task.checklist_summary?.total ?? 0) > 0 && (
                      <span title="Checklist progress">
                        {(task.checklist_summary?.checked ?? 0)}/{(task.checklist_summary?.total ?? 0)}
                      </span>
                    )}
                    {(task.comment_count ?? 0) > 0 && (
                      <span title="Comments">
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
                  colSpan={7}
                  className="px-4 py-8 text-center text-gray-400"
                >
                  No tasks found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useState, useMemo } from 'react';
import type { TaskDto, BoardColumn, Priority, TaskStatus } from '../types/api';

interface TableViewProps {
  tasks: TaskDto[];
  columns: BoardColumn[];
  onTaskClick: (taskId: string) => void;
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
}: TableViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterPriority, setFilterPriority] = useState<string>('');

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
    if (sortKey !== col) return null;
    return <span className="ml-1">{sortDir === 'asc' ? '\u25b2' : '\u25bc'}</span>;
  };

  const priorityBadge = (p: Priority) => {
    const colors: Record<Priority, string> = {
      urgent: 'bg-red-100 text-red-700',
      high: 'bg-orange-100 text-orange-700',
      medium: 'bg-yellow-100 text-yellow-700',
      low: 'bg-green-100 text-green-700',
    };
    return (
      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${colors[p]}`}>
        {p}
      </span>
    );
  };

  return (
    <div className="p-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search tasks..."
          className="border rounded px-3 py-1.5 text-sm w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border rounded px-2 py-1.5 text-sm"
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
          className="border rounded px-2 py-1.5 text-sm"
        >
          <option value="">All priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

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
                  className="px-4 py-2 text-left font-medium text-gray-600 cursor-pointer hover:bg-gray-100 select-none"
                >
                  {label}
                  <SortIcon col={key} />
                </th>
              ))}
              <th className="px-4 py-2 text-left font-medium text-gray-600">
                Assignees
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
                <td className="px-4 py-2 font-medium">{task.title}</td>
                <td className="px-4 py-2 text-gray-500">
                  {columnMap.get(task.column_id) ?? '-'}
                </td>
                <td className="px-4 py-2">
                  <span className="text-xs capitalize">
                    {task.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-2">{priorityBadge(task.priority)}</td>
                <td className="px-4 py-2 text-gray-500">
                  {task.due_date
                    ? new Date(task.due_date).toLocaleDateString()
                    : '-'}
                </td>
                <td className="px-4 py-2 text-gray-500 text-xs">
                  {task.assignees.map((a) => a.name).join(', ') || '-'}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={6}
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

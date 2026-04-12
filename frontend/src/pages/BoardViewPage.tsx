import { useParams, Link } from 'react-router-dom';
import { useBoard, useBoardColumns, useBoardTasks } from '../api/boards';
import { Spinner } from '../components/Spinner';
import type { TaskDto, BoardColumn } from '../types/api';

export default function BoardViewPage() {
  const { id } = useParams<{ id: string }>();
  const { data: board, isLoading: boardLoading } = useBoard(id!);
  const { data: columnsData } = useBoardColumns(id!);
  const { data: tasksData } = useBoardTasks(id!);

  if (boardLoading) return <Spinner />;
  if (!board) return <p>Board not found</p>;

  const columns = columnsData?.items ?? [];
  const tasks = tasksData?.items ?? [];

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
  // Sort each column's tasks by position
  for (const [, colTasks] of tasksByColumn) {
    colTasks.sort((a, b) => a.position - b.position);
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 border-b bg-white px-6 py-4">
        <Link to="/" className="text-gray-400 hover:text-gray-600">
          &larr; Boards
        </Link>
        <h1 className="text-xl font-bold">{board.title}</h1>
      </div>

      {/* View Tabs (Board/Table/Calendar) */}
      <div className="flex gap-2 border-b bg-white px-6 py-2">
        <button className="rounded-md bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700">
          Board
        </button>
        <button
          className="rounded-md px-3 py-1 text-sm text-gray-500 hover:bg-gray-100"
          disabled
        >
          Table
        </button>
        <button
          className="rounded-md px-3 py-1 text-sm text-gray-500 hover:bg-gray-100"
          disabled
        >
          Calendar
        </button>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-4 h-full">
          {columns.map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              tasks={tasksByColumn.get(column.id) ?? []}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function KanbanColumn({
  column,
  tasks,
}: {
  column: BoardColumn;
  tasks: TaskDto[];
}) {
  return (
    <div className="flex flex-col w-72 flex-shrink-0">
      {/* Column Header */}
      <div className="flex items-center justify-between rounded-t-lg bg-gray-100 px-3 py-2">
        <h3 className="text-sm font-semibold text-gray-700">{column.title}</h3>
        <span className="text-xs text-gray-400">{tasks.length}</span>
      </div>

      {/* Cards */}
      <div className="flex-1 space-y-2 overflow-y-auto rounded-b-lg bg-gray-50 p-2">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}

function TaskCard({ task }: { task: TaskDto }) {
  const priorityColors: Record<string, string> = {
    urgent: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-green-100 text-green-700',
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
      <p className="text-sm font-medium">{task.title}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {task.priority && (
          <span
            className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${priorityColors[task.priority] ?? ''}`}
          >
            {task.priority}
          </span>
        )}
        {task.due_date && (
          <span className="text-xs text-gray-400">
            Due {new Date(task.due_date).toLocaleDateString()}
          </span>
        )}
      </div>
      {((task.labels && task.labels.length > 0) ||
        (task.assignees && task.assignees.length > 0)) && (
        <div className="mt-2 flex items-center gap-2">
          {task.labels?.map((l) => (
            <span
              key={l.id}
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: l.color }}
            />
          ))}
          {task.assignees && task.assignees.length > 0 && (
            <span className="text-xs text-gray-400">
              {task.assignees.length} assignee(s)
            </span>
          )}
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
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
import { useCreateTask, useMoveTask } from '../api/tasks';
import { Spinner } from '../components/Spinner';
import TaskDrawer from '../components/TaskDrawer';
import TableView from '../components/TableView';
import CalendarView from '../components/CalendarView';
import { useToastStore } from '../stores/toastStore';
import { priorityClass } from '../theme/constants';
import type { TaskDto, BoardColumn } from '../types/api';

type ViewTab = 'board' | 'table' | 'calendar';

export default function BoardViewPage() {
  const { id } = useParams<{ id: string }>();
  const { data: board, isLoading: boardLoading } = useBoard(id!);
  const { data: columnsData } = useBoardColumns(id!);
  const { data: tasksData } = useBoardTasks(id!);
  const moveTask = useMoveTask(id!);
  const createColumn = useCreateColumn(id!);
  const patchColumn = usePatchColumn(id!);
  const deleteColumn = useDeleteColumn(id!);
  const createTask = useCreateTask(id!);
  const addToast = useToastStore((s) => s.addToast);

  const [activeView, setActiveView] = useState<ViewTab>('board');
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [newColTitle, setNewColTitle] = useState('');
  const [addingColumn, setAddingColumn] = useState(false);

  if (boardLoading) return <Spinner />;
  if (!board) return <p className="p-8 text-gray-500">Board not found</p>;

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

    moveTask.mutate(
      {
        taskId: draggableId,
        column_id: destination.droppableId,
        position: destination.index,
      },
      {
        onError: () => addToast('error', 'Failed to move task'),
      },
    );
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

  const viewTabs: { key: ViewTab; label: string }[] = [
    { key: 'board', label: 'Board' },
    { key: 'table', label: 'Table' },
    { key: 'calendar', label: 'Calendar' },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 border-b bg-white px-6 py-3">
        <Link to="/" className="text-gray-400 hover:text-gray-600 text-sm">
          &larr; Boards
        </Link>
        <h1 className="text-lg font-bold">{board.title}</h1>
        {board.description && (
          <span className="text-sm text-gray-400 truncate max-w-md">
            {board.description}
          </span>
        )}
      </div>

      {/* View Tabs */}
      <div className="flex gap-1 border-b bg-white px-6 py-1.5">
        {viewTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveView(tab.key)}
            className={`rounded-md px-3 py-1 text-sm font-medium ${
              activeView === tab.key
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

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
                  onTaskClick={setOpenTaskId}
                  onRenameColumn={(title) =>
                    patchColumn.mutate({
                      columnId: column.id,
                      title,
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
              <div className="w-72 flex-shrink-0">
                {addingColumn ? (
                  <div className="bg-gray-100 rounded-lg p-3">
                    <input
                      autoFocus
                      className="w-full border rounded px-2 py-1.5 text-sm mb-2"
                      placeholder="Column title..."
                      value={newColTitle}
                      onChange={(e) => setNewColTitle(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddColumn()}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleAddColumn}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => setAddingColumn(false)}
                        className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingColumn(true)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    + Add column
                  </button>
                )}
              </div>
            </div>
          </DragDropContext>
        </div>
      )}

      {activeView === 'table' && (
        <TableView
          tasks={tasks}
          columns={columns}
          onTaskClick={setOpenTaskId}
          onCreateTask={(title, columnId) =>
            createTask.mutate({ title, column_id: columnId })
          }
        />
      )}

      {activeView === 'calendar' && (
        <div className="flex-1">
          <CalendarView tasks={tasks} onTaskClick={setOpenTaskId} />
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
    </div>
  );
}

function KanbanColumn({
  column,
  tasks,
  boardId: _boardId,
  onTaskClick,
  onRenameColumn,
  onDeleteColumn,
  onCreateTask,
}: {
  column: BoardColumn;
  tasks: TaskDto[];
  boardId: string;
  onTaskClick: (id: string) => void;
  onRenameColumn: (title: string) => void;
  onDeleteColumn: () => void;
  onCreateTask: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(column.title);
  const [adding, setAdding] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [showMenu, setShowMenu] = useState(false);

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
    <div className="flex flex-col w-72 flex-shrink-0">
      {/* Column Header */}
      <div className="flex items-center justify-between rounded-t-lg bg-gray-100 px-3 py-2">
        {editing ? (
          <input
            autoFocus
            className="text-sm font-semibold bg-white border rounded px-1 py-0.5 w-full mr-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
          />
        ) : (
          <h3 className="text-sm font-semibold text-gray-700">
            {column.title}
          </h3>
        )}
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400">{tasks.length}</span>
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="text-gray-400 hover:text-gray-600 px-1"
            >
              ...
            </button>
            {showMenu && (
              <div className="absolute right-0 top-6 bg-white border rounded shadow-lg py-1 z-10 w-32">
                <button
                  onClick={() => {
                    setEditing(true);
                    setShowMenu(false);
                  }}
                  className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  Rename
                </button>
                <button
                  onClick={() => {
                    onDeleteColumn();
                    setShowMenu(false);
                  }}
                  className="block w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
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
            className={`flex-1 space-y-2 overflow-y-auto rounded-b-lg p-2 min-h-[100px] ${
              snapshot.isDraggingOver ? 'bg-blue-50' : 'bg-gray-50'
            }`}
          >
            {tasks.map((task, index) => (
              <Draggable key={task.id} draggableId={task.id} index={index}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className={`rounded-lg border bg-white p-3 shadow-sm transition-shadow cursor-pointer ${
                      snapshot.isDragging
                        ? 'shadow-lg border-blue-300'
                        : 'border-gray-200 hover:shadow-md'
                    }`}
                    onClick={() => onTaskClick(task.id)}
                  >
                    <TaskCardContent task={task} />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}

            {/* Add task */}
            {adding ? (
              <div className="bg-white border rounded-lg p-2">
                <input
                  autoFocus
                  className="w-full text-sm border-b pb-1 outline-none"
                  placeholder="Task title..."
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleAddTask}
                    className="px-2 py-1 text-xs bg-blue-600 text-white rounded"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setAdding(false)}
                    className="px-2 py-1 text-xs text-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="w-full text-left text-sm text-gray-400 hover:text-gray-600 px-2 py-1"
              >
                + Add task
              </button>
            )}
          </div>
        )}
      </Droppable>
    </div>
  );
}

function TaskCardContent({ task }: { task: TaskDto }) {
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
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0 text-[10px] font-medium text-white"
              style={{ backgroundColor: l.color }}
            >
              {l.name}
            </span>
          ))}
        </div>
      )}
      <p className="text-sm font-medium leading-snug">{task.title}</p>
      {task.description && (
        <p className="text-xs text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
          {task.description}
        </p>
      )}
      {/* Meta row */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${priorityClass(task.priority)}`}
        >
          {task.priority.toUpperCase()}
        </span>
        {task.status !== 'open' && (
          <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500">
            {task.status.replace('_', ' ')}
          </span>
        )}
        {task.due_date && (
          <span
            className={`text-[10px] ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}
          >
            {isOverdue ? 'Overdue ' : ''}
            {new Date(task.due_date).toLocaleDateString()}
          </span>
        )}
      </div>
      {/* Bottom row: checklist, comments, assignees */}
      {(checklist.total > 0 ||
        commentCount > 0 ||
        assignees.length > 0) && (
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] text-gray-400">
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
                  className="w-6 h-6 rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center border-2 border-white"
                  title={a.name}
                >
                  {a.name.charAt(0).toUpperCase()}
                </div>
              ))}
              {assignees.length > 3 && (
                <div className="w-6 h-6 rounded-full bg-gray-300 text-gray-600 text-[10px] flex items-center justify-center border-2 border-white">
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

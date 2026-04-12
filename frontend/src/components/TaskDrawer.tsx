import { useState } from 'react';
import {
  useTask,
  useTaskComments,
  useTaskChecklists,
  usePatchTask,
  useCreateComment,
  useCreateChecklist,
  useAddChecklistItem,
  usePatchChecklistItem,
  useAddAssignee,
  useRemoveAssignee,
  useAddLabel,
  useRemoveLabel,
} from '../api/tasks';
import { useBoardLabels } from '../api/boards';
import { useUsers } from '../api/users';
import { useToastStore } from '../stores/toastStore';
import { Spinner } from './Spinner';
import type { Priority, TaskStatus } from '../types/api';

interface TaskDrawerProps {
  taskId: string;
  boardId: string;
  onClose: () => void;
}

const priorities: Priority[] = ['low', 'medium', 'high', 'urgent'];
const statuses: TaskStatus[] = ['open', 'in_progress', 'done', 'archived'];

const priorityColors: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low: 'bg-green-100 text-green-700 border-green-200',
};

export default function TaskDrawer({
  taskId,
  boardId,
  onClose,
}: TaskDrawerProps) {
  const { data: task, isLoading } = useTask(taskId);
  const { data: commentsData } = useTaskComments(taskId);
  const { data: checklistsData } = useTaskChecklists(taskId);
  const { data: labelsData } = useBoardLabels(boardId);
  const { data: usersData } = useUsers();
  const patchTask = usePatchTask(boardId);
  const createComment = useCreateComment(taskId);
  const createChecklist = useCreateChecklist(taskId);
  const addChecklistItem = useAddChecklistItem(taskId);
  const patchChecklistItem = usePatchChecklistItem(taskId);
  const addAssignee = useAddAssignee(taskId, boardId);
  const removeAssignee = useRemoveAssignee(taskId, boardId);
  const addLabel = useAddLabel(taskId, boardId);
  const removeLabel = useRemoveLabel(taskId, boardId);
  const addToast = useToastStore((s) => s.addToast);

  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [newItemTexts, setNewItemTexts] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'details' | 'comments' | 'activity'>('details');

  if (isLoading || !task) {
    return (
      <DrawerShell onClose={onClose}>
        <Spinner />
      </DrawerShell>
    );
  }

  const comments = commentsData?.items ?? [];
  const checklists = checklistsData?.items ?? [];
  const boardLabels = labelsData?.items ?? [];
  const allUsers = usersData?.items ?? [];

  const handleSaveTitle = () => {
    if (title.trim() && title !== task.title) {
      patchTask.mutate(
        { taskId, title, version: task.version },
        {
          onError: () => addToast('error', 'Failed to update title'),
        },
      );
    }
    setEditingTitle(false);
  };

  const handleSaveDescription = () => {
    patchTask.mutate(
      {
        taskId,
        description: description || null,
        version: task.version,
      },
      {
        onError: () => addToast('error', 'Failed to update description'),
      },
    );
    setEditingDesc(false);
  };

  const handleChangePriority = (p: string) => {
    patchTask.mutate({ taskId, priority: p, version: task.version });
  };

  const handleChangeStatus = (s: string) => {
    patchTask.mutate({ taskId, status: s, version: task.version });
  };

  const handleDateChange = (field: 'start_date' | 'due_date', value: string) => {
    patchTask.mutate({
      taskId,
      [field]: value || null,
      version: task.version,
    });
  };

  const handleAddComment = () => {
    if (!commentText.trim()) return;
    createComment.mutate(commentText, {
      onSuccess: () => setCommentText(''),
      onError: () => addToast('error', 'Failed to add comment'),
    });
  };

  const handleAddChecklist = () => {
    if (!newChecklistTitle.trim()) return;
    createChecklist.mutate(newChecklistTitle, {
      onSuccess: () => setNewChecklistTitle(''),
      onError: () => addToast('error', 'Failed to add checklist'),
    });
  };

  return (
    <DrawerShell onClose={onClose}>
      {/* Title */}
      <div className="px-6 py-4 border-b">
        {editingTitle ? (
          <input
            autoFocus
            className="w-full text-lg font-semibold border-b border-blue-400 outline-none pb-1"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleSaveTitle}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
          />
        ) : (
          <h2
            className="text-lg font-semibold cursor-pointer hover:text-blue-600"
            onClick={() => {
              setTitle(task.title);
              setEditingTitle(true);
            }}
          >
            {task.title}
          </h2>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b px-6">
        {(['details', 'comments', 'activity'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {activeTab === 'details' && (
          <>
            {/* Priority & Status */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Priority
                </label>
                <select
                  value={task.priority}
                  onChange={(e) => handleChangePriority(e.target.value)}
                  className={`w-full px-2 py-1.5 text-sm rounded border ${priorityColors[task.priority] ?? 'border-gray-200'}`}
                >
                  {priorities.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Status
                </label>
                <select
                  value={task.status}
                  onChange={(e) => handleChangeStatus(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm rounded border border-gray-200"
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {s.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={task.start_date?.split('T')[0] ?? ''}
                  onChange={(e) => handleDateChange('start_date', e.target.value)}
                  className="w-full px-2 py-1.5 text-sm rounded border border-gray-200"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Due Date
                </label>
                <input
                  type="date"
                  value={task.due_date?.split('T')[0] ?? ''}
                  onChange={(e) => handleDateChange('due_date', e.target.value)}
                  className="w-full px-2 py-1.5 text-sm rounded border border-gray-200"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Description
              </label>
              {editingDesc ? (
                <div>
                  <textarea
                    autoFocus
                    className="w-full border border-gray-200 rounded p-2 text-sm min-h-[80px]"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={handleSaveDescription}
                      className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingDesc(false)}
                      className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p
                  className="text-sm text-gray-600 cursor-pointer hover:bg-gray-50 p-2 rounded min-h-[40px]"
                  onClick={() => {
                    setDescription(task.description ?? '');
                    setEditingDesc(true);
                  }}
                >
                  {task.description || 'Click to add description...'}
                </p>
              )}
            </div>

            {/* Labels */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Labels
              </label>
              <div className="flex flex-wrap gap-1 mb-2">
                {task.labels.map((l) => (
                  <span
                    key={l.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-white"
                    style={{ backgroundColor: l.color }}
                  >
                    {l.name}
                    <button
                      onClick={() => removeLabel.mutate(l.id)}
                      className="hover:text-gray-200"
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
              {boardLabels.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) addLabel.mutate(e.target.value);
                  }}
                  className="text-xs border border-gray-200 rounded px-2 py-1"
                >
                  <option value="">+ Add label</option>
                  {boardLabels
                    .filter((bl) => !task.labels.some((l) => l.id === bl.id))
                    .map((bl) => (
                      <option key={bl.id} value={bl.id}>
                        {bl.name}
                      </option>
                    ))}
                </select>
              )}
            </div>

            {/* Assignees */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Assignees
              </label>
              <div className="space-y-1 mb-2">
                {task.assignees.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span>{a.name}</span>
                    <button
                      onClick={() => removeAssignee.mutate(a.id)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) addAssignee.mutate(e.target.value);
                }}
                className="text-xs border border-gray-200 rounded px-2 py-1"
              >
                <option value="">+ Add assignee</option>
                {allUsers
                  .filter((u) => !task.assignees.some((a) => a.id === u.id))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
              </select>
            </div>

            {/* Checklists */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">
                Checklists
              </label>
              {checklists.map((cl) => (
                <div key={cl.id} className="mb-3 border rounded p-2">
                  <h4 className="text-sm font-medium mb-1">{cl.title}</h4>
                  {cl.items.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-center gap-2 text-sm py-0.5"
                    >
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={(e) =>
                          patchChecklistItem.mutate({
                            checklistId: cl.id,
                            itemId: item.id,
                            checked: e.target.checked,
                          })
                        }
                      />
                      <span className={item.checked ? 'line-through text-gray-400' : ''}>
                        {item.title}
                      </span>
                    </label>
                  ))}
                  <div className="flex gap-1 mt-1">
                    <input
                      placeholder="New item..."
                      className="flex-1 text-xs border rounded px-2 py-1"
                      value={newItemTexts[cl.id] ?? ''}
                      onChange={(e) =>
                        setNewItemTexts((prev) => ({
                          ...prev,
                          [cl.id]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newItemTexts[cl.id]?.trim()) {
                          addChecklistItem.mutate({
                            checklistId: cl.id,
                            title: newItemTexts[cl.id],
                          });
                          setNewItemTexts((prev) => ({
                            ...prev,
                            [cl.id]: '',
                          }));
                        }
                      }}
                    />
                  </div>
                </div>
              ))}
              <div className="flex gap-1">
                <input
                  placeholder="New checklist title..."
                  className="flex-1 text-xs border rounded px-2 py-1"
                  value={newChecklistTitle}
                  onChange={(e) => setNewChecklistTitle(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === 'Enter' && handleAddChecklist()
                  }
                />
                <button
                  onClick={handleAddChecklist}
                  className="text-xs bg-gray-100 px-2 py-1 rounded hover:bg-gray-200"
                >
                  Add
                </button>
              </div>
            </div>
          </>
        )}

        {activeTab === 'comments' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <textarea
                className="flex-1 border rounded p-2 text-sm min-h-[60px]"
                placeholder="Write a comment..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
              />
            </div>
            <button
              onClick={handleAddComment}
              disabled={createComment.isPending || !commentText.trim()}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {createComment.isPending ? 'Posting...' : 'Post Comment'}
            </button>

            <div className="space-y-3 mt-4">
              {comments.map((c) => (
                <div key={c.id} className="border-b pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">{c.author_name}</span>
                    <span className="text-xs text-gray-400">
                      {new Date(c.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{c.body}</p>
                </div>
              ))}
              {comments.length === 0 && (
                <p className="text-sm text-gray-400">No comments yet.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <p className="text-sm text-gray-400">
            Activity history is available on the board activity feed.
          </p>
        )}
      </div>
    </DrawerShell>
  );
}

function DrawerShell({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />
      {/* Drawer panel */}
      <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-white shadow-xl z-50 flex flex-col">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 z-10"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        {children}
      </div>
    </>
  );
}

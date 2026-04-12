import { useState } from 'react';
import {
  useDepartments,
  useDepartmentMembers,
  useCreateDepartment,
  usePatchDepartment,
  useDeleteDepartment,
  useAddDepartmentMember,
  useRemoveDepartmentMember,
} from '../api/departments';
import { useUsers } from '../api/users';
import { Spinner } from '../components/Spinner';
import { useToastStore } from '../stores/toastStore';
import { usePermissions } from '../hooks/usePermissions';
import type { Department } from '../types/api';

export default function OrgPage() {
  const { data, isLoading } = useDepartments();
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const createDept = useCreateDepartment();
  const addToast = useToastStore((s) => s.addToast);
  const { canManageDepartments } = usePermissions();

  const departments = data?.items ?? [];
  const selectedDept = departments.find((d) => d.id === selectedDeptId) ?? null;

  const roots = departments.filter((d) => !d.parent_id);
  const childrenOf = (parentId: string) =>
    departments.filter((d) => d.parent_id === parentId);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Organization</h1>
        {canManageDepartments && (
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            + New Department
          </button>
        )}
      </div>

      {isLoading && <Spinner />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Department Tree — 1/3 */}
        <div className="bg-white rounded-lg border p-4 lg:col-span-1">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Departments
          </h2>
          {roots.length === 0 && (
            <p className="text-sm text-gray-400">No departments yet.</p>
          )}
          {roots.map((dept) => (
            <DeptNode
              key={dept.id}
              dept={dept}
              childrenOf={childrenOf}
              selected={selectedDeptId}
              onSelect={setSelectedDeptId}
              depth={0}
            />
          ))}
        </div>

        {/* Detail Panel — 2/3 */}
        <div className="bg-white rounded-lg border p-4 lg:col-span-2">
          {selectedDept ? (
            <DeptDetailPanel
              dept={selectedDept}
              canManage={canManageDepartments}
            />
          ) : (
            <p className="text-sm text-gray-400 py-8 text-center">
              Select a department to view details.
            </p>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateDeptModal
          departments={departments}
          onClose={() => setShowCreate(false)}
          onCreate={(name, slug, parentId) => {
            createDept.mutate(
              { name, slug, parent_id: parentId || null },
              {
                onSuccess: () => {
                  addToast('success', 'Department created');
                  setShowCreate(false);
                },
                onError: () => addToast('error', 'Failed to create department'),
              },
            );
          }}
          isPending={createDept.isPending}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Department Tree Node (recursive, supports 5+ levels)
// ---------------------------------------------------------------------------

function DeptNode({
  dept,
  childrenOf,
  selected,
  onSelect,
  depth,
}: {
  dept: Department;
  childrenOf: (id: string) => Department[];
  selected: string | null;
  onSelect: (id: string) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const children = childrenOf(dept.id);
  const isSelected = selected === dept.id;
  const hasChildren = children.length > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-sm cursor-pointer ${
          isSelected
            ? 'bg-blue-50 text-blue-700 font-medium'
            : 'hover:bg-gray-50 text-gray-700'
        }`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => onSelect(dept.id)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 flex-shrink-0"
          >
            <svg
              className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M6 6l8 4-8 4V6z" />
            </svg>
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}
        <span className="truncate flex-1">{dept.name}</span>
        {depth > 0 && (
          <span className="text-xs text-gray-300 flex-shrink-0">L{depth}</span>
        )}
      </div>
      {expanded &&
        children.map((child) => (
          <DeptNode
            key={child.id}
            dept={child}
            childrenOf={childrenOf}
            selected={selected}
            onSelect={onSelect}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Department Detail Panel (header + members table)
// ---------------------------------------------------------------------------

function DeptDetailPanel({
  dept,
  canManage,
}: {
  dept: Department;
  canManage: boolean;
}) {
  const patchDept = usePatchDepartment();
  const deleteDept = useDeleteDepartment();
  const addToast = useToastStore((s) => s.addToast);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(dept.name);

  const handleRename = () => {
    if (name.trim() && name !== dept.name) {
      patchDept.mutate(
        { id: dept.id, name },
        { onError: () => addToast('error', 'Failed to rename') },
      );
    }
    setEditing(false);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b">
        <div>
          {editing ? (
            <input
              autoFocus
              className="text-lg font-semibold border-b border-blue-400 outline-none"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            />
          ) : (
            <h2 className="text-lg font-semibold">{dept.name}</h2>
          )}
          <div className="flex gap-3 text-xs text-gray-400 mt-0.5">
            <span>slug: {dept.slug}</span>
            <span>depth: {dept.depth}</span>
            <span>path: {dept.path}</span>
          </div>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <button
              onClick={() => {
                setName(dept.name);
                setEditing(true);
              }}
              className="px-3 py-1.5 text-xs border rounded hover:bg-gray-50"
            >
              Rename
            </button>
            <button
              onClick={() => {
                deleteDept.mutate(dept.id, {
                  onSuccess: () => addToast('success', 'Department deleted'),
                  onError: () => addToast('error', 'Failed to delete'),
                });
              }}
              className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Members Table */}
      <MembersTable departmentId={dept.id} canManage={canManage} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Members Table
// ---------------------------------------------------------------------------

function MembersTable({
  departmentId,
  canManage,
}: {
  departmentId: string;
  canManage: boolean;
}) {
  const { data, isLoading } = useDepartmentMembers(departmentId);
  const { data: usersData } = useUsers();
  const addMember = useAddDepartmentMember();
  const removeMember = useRemoveDepartmentMember();
  const addToast = useToastStore((s) => s.addToast);
  const [addUserId, setAddUserId] = useState('');

  const members = data?.items ?? [];
  const allUsers = usersData?.items ?? [];

  const handleAdd = () => {
    if (!addUserId) return;
    addMember.mutate(
      { departmentId, user_id: addUserId, role: 'Member' },
      {
        onSuccess: () => {
          addToast('success', 'Member added');
          setAddUserId('');
        },
        onError: () => addToast('error', 'Failed to add member'),
      },
    );
  };

  const handleRemove = (userId: string) => {
    removeMember.mutate(
      { departmentId, userId },
      {
        onSuccess: () => addToast('success', 'Member removed'),
        onError: () => addToast('error', 'Failed to remove member'),
      },
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Members ({members.length})
        </h3>
      </div>

      {isLoading && <Spinner />}

      {members.length > 0 ? (
        <div className="overflow-x-auto rounded border border-gray-200 mb-4">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">
                  Name
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">
                  Email
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">
                  Role
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">
                  Joined
                </th>
                {canManage && (
                  <th className="px-3 py-2 text-right font-medium text-gray-600 w-20">
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {members.map((m) => (
                <tr key={m.user_id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">{m.user_name}</td>
                  <td className="px-3 py-2 text-gray-500">{m.user_email}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-1.5 py-0.5 text-xs rounded ${
                        m.role_in_department === 'DepartmentAdmin'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {m.role_in_department}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-400 text-xs">
                    {new Date(m.joined_at).toLocaleDateString()}
                  </td>
                  {canManage && (
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => handleRemove(m.user_id)}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !isLoading && (
          <p className="text-sm text-gray-400 mb-4">No members yet.</p>
        )
      )}

      {canManage && (
        <div className="flex gap-2">
          <select
            value={addUserId}
            onChange={(e) => setAddUserId(e.target.value)}
            className="flex-1 border rounded px-2 py-1.5 text-sm"
          >
            <option value="">Add member...</option>
            {allUsers
              .filter((u) => !members.some((m) => m.user_id === u.id))
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={!addUserId || addMember.isPending}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Department Modal
// ---------------------------------------------------------------------------

function CreateDeptModal({
  departments,
  onClose,
  onCreate,
  isPending,
}: {
  departments: Department[];
  onClose: () => void;
  onCreate: (name: string, slug: string, parentId: string) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [parentId, setParentId] = useState('');

  // Sort departments by path for indented display
  const sorted = [...departments].sort((a, b) => a.path.localeCompare(b.path));

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
          <h2 className="text-lg font-semibold mb-4">Create Department</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name *
              </label>
              <input
                autoFocus
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slug || slug === nameToSlug(name)) {
                    setSlug(nameToSlug(e.target.value));
                  }
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Slug *
              </label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Parent Department
              </label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">None (root)</option>
                {sorted.map((d) => (
                  <option key={d.id} value={d.id}>
                    {'\u00A0'.repeat(d.depth * 3)}{d.depth > 0 ? '└ ' : ''}{d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600"
            >
              Cancel
            </button>
            <button
              onClick={() => onCreate(name, slug, parentId)}
              disabled={!name.trim() || !slug.trim() || isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isPending ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

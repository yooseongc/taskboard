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
  const patchDept = usePatchDepartment();
  const deleteDept = useDeleteDepartment();
  const addToast = useToastStore((s) => s.addToast);
  const { canManageDepartments } = usePermissions();

  const departments = data?.items ?? [];

  // Build tree
  const roots = departments.filter((d) => !d.parent_id);
  const childrenOf = (parentId: string) =>
    departments.filter((d) => d.parent_id === parentId);

  const handleDelete = (id: string) => {
    deleteDept.mutate(id, {
      onSuccess: () => addToast('success', 'Department deleted'),
      onError: () => addToast('error', 'Failed to delete department'),
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-center justify-between mb-8">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Department Tree */}
        <div className="bg-white rounded-lg border p-4">
          <h2 className="text-sm font-semibold text-gray-500 mb-3">
            Department Tree
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
              onDelete={handleDelete}
              onRename={(id, name) =>
                patchDept.mutate({ id, name })
              }
              depth={0}
            />
          ))}
        </div>

        {/* Members Panel */}
        <div className="bg-white rounded-lg border p-4">
          {selectedDeptId ? (
            <MembersPanel departmentId={selectedDeptId} />
          ) : (
            <p className="text-sm text-gray-400">
              Select a department to view members.
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

function DeptNode({
  dept,
  childrenOf,
  selected,
  onSelect,
  onDelete,
  onRename,
  depth,
}: {
  dept: Department;
  childrenOf: (id: string) => Department[];
  selected: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  depth: number;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(dept.name);
  const children = childrenOf(dept.id);
  const isSelected = selected === dept.id;

  const handleRename = () => {
    if (name.trim() && name !== dept.name) {
      onRename(dept.id, name);
    }
    setEditing(false);
  };

  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div
        className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer group ${
          isSelected ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
        }`}
        onClick={() => onSelect(dept.id)}
      >
        <span className="text-gray-400">{children.length > 0 ? '\u25b6' : '\u2022'}</span>
        {editing ? (
          <input
            autoFocus
            className="border rounded px-1 py-0.5 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex-1">{dept.name}</span>
        )}
        <span className="text-xs text-gray-400">{dept.slug}</span>
        <div className="hidden group-hover:flex gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(dept.id);
            }}
            className="text-xs text-red-400 hover:text-red-600"
          >
            Del
          </button>
        </div>
      </div>
      {children.map((child) => (
        <DeptNode
          key={child.id}
          dept={child}
          childrenOf={childrenOf}
          selected={selected}
          onSelect={onSelect}
          onDelete={onDelete}
          onRename={onRename}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

function MembersPanel({ departmentId }: { departmentId: string }) {
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
      <h2 className="text-sm font-semibold text-gray-500 mb-3">Members</h2>

      {isLoading && <Spinner />}

      <div className="space-y-2 mb-4">
        {members.map((m) => (
          <div
            key={m.user_id}
            className="flex items-center justify-between text-sm py-1"
          >
            <div>
              <span className="font-medium">{m.user_name}</span>
              <span className="text-gray-400 ml-2 text-xs">{m.user_email}</span>
              <span className="text-gray-400 ml-2 text-xs">({m.role})</span>
            </div>
            <button
              onClick={() => handleRemove(m.user_id)}
              className="text-xs text-red-400 hover:text-red-600"
            >
              Remove
            </button>
          </div>
        ))}
        {members.length === 0 && !isLoading && (
          <p className="text-sm text-gray-400">No members.</p>
        )}
      </div>

      <div className="flex gap-2">
        <select
          value={addUserId}
          onChange={(e) => setAddUserId(e.target.value)}
          className="flex-1 border rounded px-2 py-1.5 text-sm"
        >
          <option value="">Select user to add...</option>
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
    </div>
  );
}

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
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
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

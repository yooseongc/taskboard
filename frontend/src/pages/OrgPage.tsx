import { useState } from 'react';
import { useDepartments, useDepartmentMembers } from '../api/departments';
import { Spinner } from '../components/Spinner';
import Badge from '../components/ui/Badge';
import { roleClass } from '../theme/constants';
import type { Department } from '../types/api';

export default function OrgPage() {
  const { data, isLoading } = useDepartments();
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);

  const departments = data?.items ?? [];
  const selectedDept = departments.find((d) => d.id === selectedDeptId) ?? null;

  const roots = departments.filter((d) => !d.parent_id);
  const childrenOf = (parentId: string) =>
    departments.filter((d) => d.parent_id === parentId);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Organization</h1>
          <p className="text-sm text-gray-400 mt-1">
            Departments and members are synced from Active Directory (read-only)
          </p>
        </div>
      </div>

      {isLoading && <Spinner />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Department Tree */}
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

        {/* Detail Panel */}
        <div className="bg-white rounded-lg border p-4 lg:col-span-2">
          {selectedDept ? (
            <DeptDetailPanel dept={selectedDept} />
          ) : (
            <p className="text-sm text-gray-400 py-8 text-center">
              Select a department to view details.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

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

function DeptDetailPanel({ dept }: { dept: Department }) {
  return (
    <div>
      <div className="mb-4 pb-3 border-b">
        <h2 className="text-lg font-semibold">{dept.name}</h2>
        <div className="flex gap-3 text-xs text-gray-400 mt-0.5">
          <span>slug: {dept.slug}</span>
          <span>depth: {dept.depth}</span>
          <span>path: {dept.path}</span>
        </div>
      </div>
      <MembersTable departmentId={dept.id} />
    </div>
  );
}

function MembersTable({ departmentId }: { departmentId: string }) {
  const { data, isLoading } = useDepartmentMembers(departmentId);
  const members = data?.items ?? [];

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Members ({members.length})
      </h3>

      {isLoading && <Spinner />}

      {members.length > 0 ? (
        <div className="overflow-x-auto rounded border border-gray-200">
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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {members.map((m) => (
                <tr key={m.user_id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">{m.user_name}</td>
                  <td className="px-3 py-2 text-gray-500">{m.user_email}</td>
                  <td className="px-3 py-2">
                    <Badge className={roleClass(m.role_in_department)}>
                      {m.role_in_department}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-gray-400 text-xs">
                    {new Date(m.joined_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !isLoading && (
          <p className="text-sm text-gray-400">No members.</p>
        )
      )}
    </div>
  );
}

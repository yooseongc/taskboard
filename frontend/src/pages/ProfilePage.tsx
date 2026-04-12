import { useState } from 'react';
import { useMe, usePatchUser } from '../api/users';
import { Spinner } from '../components/Spinner';
import { useToastStore } from '../stores/toastStore';
import { useAuthStore } from '../stores/authStore';

export default function ProfilePage() {
  const { data: me, isLoading } = useMe();
  const patchUser = usePatchUser();
  const addToast = useToastStore((s) => s.addToast);
  const setUser = useAuthStore((s) => s.setUser);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState('');

  if (isLoading || !me) return <Spinner />;

  const handleSaveName = () => {
    if (name.trim() && name !== me.name) {
      patchUser.mutate(
        { id: me.id, name },
        {
          onSuccess: () => {
            addToast('success', 'Name updated');
            setUser({ ...me, name });
            setEditingName(false);
          },
          onError: () => addToast('error', 'Failed to update name'),
        },
      );
    } else {
      setEditingName(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-2xl font-bold mb-8">Profile</h1>

      <div className="bg-white rounded-lg border p-6 space-y-6">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold">
            {me.name.charAt(0).toUpperCase()}
          </div>
          <div>
            {editingName ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  className="border rounded px-2 py-1 text-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                />
                <button
                  onClick={handleSaveName}
                  className="px-2 py-1 text-xs bg-blue-600 text-white rounded"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingName(false)}
                  className="px-2 py-1 text-xs text-gray-500"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <h2
                className="text-xl font-semibold cursor-pointer hover:text-blue-600"
                onClick={() => {
                  setName(me.name);
                  setEditingName(true);
                }}
              >
                {me.name}
              </h2>
            )}
            <p className="text-sm text-gray-500">{me.email}</p>
          </div>
        </div>

        {/* Info rows */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="block text-xs font-medium text-gray-500">
              Roles
            </span>
            <div className="flex flex-wrap gap-1 mt-1">
              {me.roles.map((r) => (
                <span
                  key={r}
                  className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs"
                >
                  {r}
                </span>
              ))}
            </div>
          </div>
          <div>
            <span className="block text-xs font-medium text-gray-500">
              Status
            </span>
            <span
              className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                me.active
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              {me.active ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div>
            <span className="block text-xs font-medium text-gray-500">
              Email Verified
            </span>
            <span className="text-sm mt-1">
              {me.email_verified ? 'Yes' : 'No'}
            </span>
          </div>
          <div>
            <span className="block text-xs font-medium text-gray-500">
              Joined
            </span>
            <span className="text-sm mt-1">
              {new Date(me.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

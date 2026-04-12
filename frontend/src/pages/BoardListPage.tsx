import { Link } from 'react-router-dom';
import { useBoards } from '../api/boards';
import { useAuthStore } from '../stores/authStore';
import { Spinner } from '../components/Spinner';

export default function BoardListPage() {
  const { data, isLoading, isError } = useBoards();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">My Boards</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">
            {user?.name || user?.email}
          </span>
          <button
            onClick={logout}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Board Grid */}
      {isLoading && <Spinner />}
      {isError && <p className="text-red-500">Failed to load boards.</p>}
      {data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((board) => (
            <Link
              key={board.id}
              to={`/boards/${board.id}`}
              className="block rounded-lg border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <h2 className="text-lg font-semibold">{board.title}</h2>
              {board.description && (
                <p className="mt-2 text-sm text-gray-500 line-clamp-2">
                  {board.description}
                </p>
              )}
              <div className="mt-4 text-xs text-gray-400">
                v{board.version} &middot;{' '}
                {new Date(board.created_at).toLocaleDateString()}
              </div>
            </Link>
          ))}
          {data.items.length === 0 && (
            <p className="col-span-full text-center text-gray-400 py-12">
              No boards yet. Create one to get started.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

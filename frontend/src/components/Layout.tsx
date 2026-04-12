import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { getLogoutUrl } from '../auth/oidc';
import { usePermissions } from '../hooks/usePermissions';
import { ToastContainer } from './Toast';

const navItems = [
  { path: '/', label: 'Boards', icon: 'M4 6h16M4 12h16M4 18h16', adminOnly: false },
  {
    path: '/templates',
    label: 'Templates',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    adminOnly: false,
  },
  {
    path: '/org',
    label: 'Organization',
    icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
    adminOnly: false,
  },
  {
    path: '/admin/users',
    label: 'User Admin',
    icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
    adminOnly: true,
  },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { isSystemAdmin } = usePermissions();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside
        className={`${sidebarOpen ? 'w-56' : 'w-0 overflow-hidden'} flex-shrink-0 bg-gray-900 text-gray-300 flex flex-col transition-all duration-200`}
      >
        <div className="flex items-center gap-2 px-4 py-4 border-b border-gray-800">
          <span className="text-lg font-bold text-white">Taskboard</span>
        </div>
        <nav className="flex-1 py-2">
          {navItems.filter((item) => !item.adminOnly || isSystemAdmin).map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-800 ${active ? 'bg-gray-800 text-white' : ''}`}
              >
                <svg
                  className="w-5 h-5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d={item.icon}
                  />
                </svg>
                {item.label}
              </Link>
            );
          })}
        </nav>
        {/* User section */}
        <div className="border-t border-gray-800 p-3">
          <div className="flex items-center gap-2">
            <Link
              to="/profile"
              className="flex items-center gap-2 flex-1 min-w-0 text-sm hover:text-white"
            >
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {user?.name?.charAt(0)?.toUpperCase() ?? '?'}
              </div>
              <div className="truncate">
                <div className="text-sm font-medium text-white truncate">
                  {user?.name ?? 'User'}
                </div>
                <div className="text-xs text-gray-400 truncate">
                  {user?.email}
                </div>
              </div>
            </Link>
            <button
              onClick={() => {
                logout();
                window.location.href = getLogoutUrl();
              }}
              className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded flex-shrink-0"
              title="Logout"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-12 bg-white border-b flex items-center px-4 gap-3 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto bg-gray-50">
          <Outlet />
        </main>
      </div>

      <ToastContainer />
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { getLogoutUrl } from '../auth/oidc';
import { usePermissions } from '../hooks/usePermissions';
import { useBoards } from '../api/boards';
import { useDepartments } from '../api/departments';
import { useBoardViews, type ViewType } from '../api/views';
import { ToastContainer } from './Toast';
import CommandPalette from './CommandPalette';
import OnboardingTour from './OnboardingTour';
import AccentColorSync from './AccentColorSync';

const navItems = [
  { path: '/', labelKey: 'nav.boards', icon: 'M4 6h16M4 12h16M4 18h16', adminOnly: false },
  {
    path: '/templates',
    labelKey: 'nav.templates',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    adminOnly: false,
  },
  {
    path: '/directory',
    labelKey: 'nav.directory',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
    adminOnly: false,
  },
  {
    path: '/settings',
    labelKey: 'nav.settings',
    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    adminOnly: false,
  },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [boardsExpanded, setBoardsExpanded] = useState(true);
  const { isSystemAdmin } = usePermissions();
  const { t } = useTranslation();
  const { data: boardsData } = useBoards(30);
  const { data: deptsData } = useDepartments();

  // Group boards by their first department for sidebar sections
  const boardGroups = useMemo(() => {
    const boards = boardsData?.items ?? [];
    const depts = deptsData?.items ?? [];
    const deptMap = new Map(depts.map((d) => [d.id, d.name]));
    const groups = new Map<string, { name: string; boards: typeof boards }>();
    const ungrouped: typeof boards = [];

    for (const board of boards) {
      const deptId = board.department_ids?.[0];
      if (deptId && deptMap.has(deptId)) {
        const name = deptMap.get(deptId)!;
        const existing = groups.get(deptId);
        if (existing) existing.boards.push(board);
        else groups.set(deptId, { name, boards: [board] });
      } else {
        ungrouped.push(board);
      }
    }
    return { groups: [...groups.values()], ungrouped };
  }, [boardsData, deptsData]);

  // Ctrl+K / Cmd+K opens command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="flex h-screen relative">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-30"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      {/* Sidebar */}
      <aside
        className={`${sidebarOpen ? 'w-56' : 'w-0 overflow-hidden'} flex-shrink-0 flex flex-col transition-all duration-200 fixed md:relative inset-y-0 left-0 z-40`}
        style={{
          backgroundColor: 'var(--color-sidebar-bg)',
          color: 'var(--color-sidebar-text)',
        }}
      >
        <div
          className="flex items-center gap-2 px-4 py-4"
          style={{ borderBottom: '1px solid var(--color-sidebar-border)' }}
        >
          <span className="text-lg font-bold" style={{ color: 'var(--color-sidebar-text-active)' }}>
            {t('app.name')}
          </span>
        </div>
        <nav className="flex-1 py-2 overflow-y-auto" aria-label="Main navigation">
          {navItems.filter((item) => !item.adminOnly || isSystemAdmin).map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className="flex items-center gap-3 px-4 py-2 text-sm"
                style={{
                  backgroundColor: active ? 'var(--color-sidebar-hover)' : undefined,
                  color: active ? 'var(--color-sidebar-text-active)' : undefined,
                }}
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
                {t(item.labelKey)}
              </Link>
            );
          })}

          {/* My Boards — grouped by team/department */}
          {(boardsData?.items?.length ?? 0) > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setBoardsExpanded((v) => !v)}
                className="w-full flex items-center gap-2 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider hover:bg-[var(--color-sidebar-hover)]"
                style={{ color: 'var(--color-sidebar-text)' }}
              >
                <svg
                  className={`w-3 h-3 flex-shrink-0 transition-transform ${boardsExpanded ? 'rotate-90' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                {t('nav.myBoards')}
              </button>
              {boardsExpanded && (
                <div>
                  {/* Team/dept sections */}
                  {boardGroups.groups.map((group) => (
                    <div key={group.name}>
                      <div
                        className="px-4 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider truncate"
                        style={{ color: 'var(--color-sidebar-text)', opacity: 0.5 }}
                        title={group.name}
                      >
                        {group.name}
                      </div>
                      {group.boards.map((board) => {
                        const active = location.pathname === `/boards/${board.id}`;
                        return (
                          <BoardNavLink key={board.id} boardId={board.id} title={board.title} active={active} />
                        );
                      })}
                    </div>
                  ))}
                  {/* Ungrouped (no team association) */}
                  {boardGroups.ungrouped.map((board) => {
                    const active = location.pathname === `/boards/${board.id}`;
                    return (
                      <BoardNavLink key={board.id} boardId={board.id} title={board.title} active={active} />
                    );
                  })}
                </div>
              )}
            </div>
          )}
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
        <header
          className="h-12 flex items-center px-4 gap-3 flex-shrink-0"
          style={{ backgroundColor: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}
        >
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            aria-expanded={sidebarOpen}
            className="p-1.5 rounded focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
            style={{ color: 'var(--color-text-secondary)' }}
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
          <button
            onClick={() => setPaletteOpen(true)}
            className="ml-auto flex items-center gap-2 px-2.5 py-1 rounded text-xs"
            style={{
              backgroundColor: 'var(--color-surface-hover)',
              color: 'var(--color-text-muted)',
              border: '1px solid var(--color-border)',
            }}
            aria-label="Open command palette"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span>Search</span>
            <kbd className="px-1 rounded" style={{ backgroundColor: 'var(--color-bg)' }}>Ctrl+K</kbd>
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto" style={{ backgroundColor: 'var(--color-bg)' }}>
          <Outlet />
        </main>
      </div>

      <ToastContainer />
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      <OnboardingTour />
      <AccentColorSync />
    </div>
  );
}

function BoardNavLink({
  boardId,
  title,
  active,
}: {
  boardId: string;
  title: string;
  active: boolean;
}) {
  // Expand automatically when the board is currently open; otherwise the
  // user can toggle the chevron. Keeping this as local state (rather than
  // URL-driven) avoids touching BoardViewPage's tab logic.
  const [expanded, setExpanded] = useState(active);
  useEffect(() => {
    if (active) setExpanded(true);
  }, [active]);

  return (
    <div>
      <div
        className="flex items-center gap-1 pl-3 pr-3 py-1.5 text-sm group"
        style={{
          backgroundColor: active ? 'var(--color-sidebar-hover)' : undefined,
          color: active ? 'var(--color-sidebar-text-active)' : 'var(--color-sidebar-text)',
        }}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-shrink-0 p-0.5 opacity-60 hover:opacity-100"
          aria-label={expanded ? 'Collapse views' : 'Expand views'}
        >
          <svg
            className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <Link
          to={`/boards/${boardId}`}
          className="flex items-center gap-2 flex-1 min-w-0 truncate"
          title={title}
          style={{ color: 'inherit' }}
        >
          <span
            className="w-2 h-2 rounded-sm flex-shrink-0"
            style={{
              backgroundColor: active ? 'var(--color-primary)' : 'currentColor',
              opacity: active ? 1 : 0.4,
            }}
          />
          <span className="truncate">{title}</span>
        </Link>
      </div>
      {expanded && <BoardViewList boardId={boardId} />}
    </div>
  );
}

/**
 * Loads and renders the saved views for a board as sidebar sub-items.
 * Each entry deep-links to `/boards/:id?view=:viewId`; BoardViewPage
 * reads that query param on mount to pre-select the view type + load
 * its config. Fetch is cheap (board-scoped, already warm after the
 * board page visits it) and react-query caches the response.
 */
function BoardViewList({ boardId }: { boardId: string }) {
  const { data } = useBoardViews(boardId);
  const location = useLocation();
  const views = data?.items ?? [];
  const query = new URLSearchParams(location.search);
  const activeViewId = query.get('view') ?? '';

  if (views.length === 0) return null;

  return (
    <div className="mt-0.5 mb-1">
      {views.map((v) => {
        const isActive =
          location.pathname === `/boards/${boardId}` && activeViewId === v.id;
        return (
          <Link
            key={v.id}
            to={`/boards/${boardId}?view=${v.id}`}
            className="flex items-center gap-2 pl-12 pr-4 py-1 text-xs truncate"
            title={v.name}
            style={{
              color: isActive
                ? 'var(--color-sidebar-text-active)'
                : 'var(--color-sidebar-text)',
              opacity: isActive ? 1 : 0.75,
              backgroundColor: isActive ? 'var(--color-sidebar-hover)' : undefined,
            }}
          >
            <span className="flex-shrink-0" aria-hidden>
              {viewTypeIcon(v.view_type)}
            </span>
            <span className="truncate">{v.name}</span>
          </Link>
        );
      })}
    </div>
  );
}

function viewTypeIcon(type: ViewType): string {
  switch (type) {
    case 'board':
      return '▦';
    case 'table':
      return '☰';
    case 'calendar':
      return '📅';
  }
}

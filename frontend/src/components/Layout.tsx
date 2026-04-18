import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { getLogoutUrl } from '../auth/oidc';
import { useAppConfig } from '../api/config';
import { usePermissions } from '../hooks/usePermissions';
import { useMyBoards, useToggleBoardPin } from '../api/boards';
import { useBoardViews, type ViewType } from '../api/views';
import { usePreferences, usePatchPreferences } from '../api/preferences';
import { ToastContainer } from './Toast';
import CommandPalette from './CommandPalette';
import OnboardingTour from './OnboardingTour';
import AccentColorSync from './AccentColorSync';
import NotificationBell from './NotificationBell';

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 360;
const SIDEBAR_DEFAULT = 224;
const SIDEBAR_KEY_STEP = 16;

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
  const { data: myBoardsData } = useMyBoards('all');
  const { data: appConfig } = useAppConfig();
  const isPersonal = appConfig?.mode === 'personal';

  // Sidebar width is a user preference stored in the free-form `preferences`
  // JSONB bag. We clamp to [180, 360] px — narrower clips the brand text,
  // wider steals meaningful space from the main canvas on common laptop
  // screens. The hook is only active on desktop (md:relative); mobile
  // still uses the full-height drawer toggle.
  const { data: prefs } = usePreferences();
  const patchPrefs = usePatchPreferences();
  const storedWidth = (prefs?.preferences as { sidebar_width?: number } | undefined)?.sidebar_width;
  const [sidebarWidth, setSidebarWidth] = useState<number>(SIDEBAR_DEFAULT);
  useEffect(() => {
    if (typeof storedWidth === 'number' && storedWidth >= SIDEBAR_MIN && storedWidth <= SIDEBAR_MAX) {
      setSidebarWidth(storedWidth);
    }
  }, [storedWidth]);
  const dragStartRef = useRef<{ x: number; startWidth: number } | null>(null);
  const startResize = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragStartRef.current = { x: e.clientX, startWidth: sidebarWidth };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      const onMove = (ev: MouseEvent) => {
        const start = dragStartRef.current;
        if (!start) return;
        const next = Math.max(
          SIDEBAR_MIN,
          Math.min(SIDEBAR_MAX, start.startWidth + (ev.clientX - start.x)),
        );
        setSidebarWidth(next);
      };
      const onUp = () => {
        const start = dragStartRef.current;
        dragStartRef.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        // Persist only if the width actually changed — avoids needless
        // PATCH round-trips on a stray click on the handle.
        if (start && start.startWidth !== sidebarWidthRef.current) {
          patchPrefs.mutate({
            preferences: {
              ...(prefs?.preferences ?? {}),
              sidebar_width: sidebarWidthRef.current,
            },
          });
        }
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [sidebarWidth, prefs, patchPrefs],
  );
  // Mirror in a ref so the mouseup handler reads the latest value without
  // re-binding the effect.
  const sidebarWidthRef = useRef(sidebarWidth);
  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);
  const onResizeKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const delta = e.key === 'ArrowLeft' ? -SIDEBAR_KEY_STEP : SIDEBAR_KEY_STEP;
      const next = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, sidebarWidth + delta));
      setSidebarWidth(next);
      patchPrefs.mutate({
        preferences: { ...(prefs?.preferences ?? {}), sidebar_width: next },
      });
    },
    [sidebarWidth, prefs, patchPrefs],
  );

  // ROLES.md §5: 4 buckets — favorites + department + personal + invited.
  // A pinned board appears in both "Favorites" and its native bucket.
  // Personal mode collapses this to just favorites + personal (no teams,
  // no invitations, so the empty buckets would just be noise).
  const boardBuckets = useMemo(() => {
    const all = myBoardsData?.items ?? [];
    return {
      favorites: all.filter((b) => b.pinned),
      department: isPersonal ? [] : all.filter((b) => b.bucket === 'department'),
      personal: all.filter((b) => b.bucket === 'personal'),
      invited: isPersonal ? [] : all.filter((b) => b.bucket === 'invited'),
    };
  }, [myBoardsData, isPersonal]);
  const totalBoards = (myBoardsData?.items ?? []).length;

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

  // Close the mobile drawer when the route changes so a navigation click
  // doesn't leave the backdrop blocking the page. Desktop layouts
  // (`>= md`) ignore the change because the sidebar is static there.
  useEffect(() => {
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, [location.pathname]);

  // Close drawer on ESC (mobile only).
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && window.innerWidth < 768) setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);
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
      {/* Sidebar — width is user-resizable on desktop (see resize handle
          below). On mobile it collapses to 0 and the drawer pattern takes
          over via the fixed positioning + backdrop above. */}
      <aside
        className={`${sidebarOpen ? '' : 'w-0 overflow-hidden'} flex-shrink-0 flex flex-col transition-[width] duration-200 fixed md:relative inset-y-0 left-0 z-40`}
        style={{
          width: sidebarOpen ? `${sidebarWidth}px` : 0,
          backgroundColor: 'var(--color-sidebar-bg)',
          color: 'var(--color-sidebar-text)',
        }}
      >
        {/* NavBrand — flex-shrink-0 pins it to the top regardless of how
            many items are in the nav below. `select-none` so dragging from
            the brand (e.g. while adjusting the sidebar) doesn't accidentally
            highlight the app name. */}
        <div
          className="flex-shrink-0 flex items-center gap-2 px-4 py-4 select-none"
          style={{ borderBottom: '1px solid var(--color-sidebar-border)' }}
        >
          <span className="text-lg font-bold" style={{ color: 'var(--color-sidebar-text-active)' }}>
            {t('app.name')}
          </span>
        </div>
        {/* `min-h-0` lets this flex child shrink below its intrinsic content
            size so the inner overflow-y-auto actually engages. */}
        <nav className="flex-1 min-h-0 py-2 overflow-y-auto" aria-label="Main navigation">
          {navItems
            .filter((item) => !item.adminOnly || isSystemAdmin)
            // Personal mode: hide the directory link — there are no other
            // users or departments to browse.
            .filter((item) => !(isPersonal && item.path === '/directory'))
            .map((item) => {
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

          {/* My Boards — 4-bucket grouping (ROLES.md §5) */}
          {totalBoards > 0 && (
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
                  <BoardBucketSection
                    label={t('boards.bucket.favorites', '★ 즐겨찾기')}
                    boards={boardBuckets.favorites}
                    pathname={location.pathname}
                  />
                  {!isPersonal && (
                    <BoardBucketSection
                      label={t('boards.bucket.department', '부서 보드')}
                      boards={boardBuckets.department}
                      pathname={location.pathname}
                    />
                  )}
                  <BoardBucketSection
                    label={isPersonal ? t('boards.bucket.all', '내 보드') : t('boards.bucket.personal', '개인 보드')}
                    boards={boardBuckets.personal}
                    pathname={location.pathname}
                  />
                  {!isPersonal && (
                    <BoardBucketSection
                      label={t('boards.bucket.invited', '초대받은 보드')}
                      boards={boardBuckets.invited}
                      pathname={location.pathname}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </nav>
        {/* User section */}
        <div
          className="p-3"
          style={{ borderTop: '1px solid var(--color-sidebar-border)' }}
        >
          <div className="flex items-center gap-2">
            <Link
              to="/profile"
              className="flex items-center gap-2 flex-1 min-w-0 text-sm"
              style={{ color: 'var(--color-sidebar-text)' }}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{
                  backgroundColor: 'var(--color-primary)',
                  color: 'var(--color-text-inverse)',
                }}
              >
                {user?.name?.charAt(0)?.toUpperCase() ?? '?'}
              </div>
              <div className="truncate">
                <div
                  className="text-sm font-medium truncate"
                  style={{ color: 'var(--color-sidebar-text-active)' }}
                >
                  {user?.name ?? 'User'}
                </div>
                <div
                  className="text-xs truncate"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {user?.email}
                </div>
              </div>
            </Link>
            {!isPersonal && (
              <button
                onClick={() => {
                  logout();
                  window.location.href = getLogoutUrl();
                }}
                className="p-1.5 rounded flex-shrink-0 hover:bg-[var(--color-sidebar-hover)]"
                style={{ color: 'var(--color-text-muted)' }}
                title="Logout"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            )}
          </div>
        </div>
        {/* Resize handle — desktop only (hidden on mobile drawer) and only
            while the sidebar is open. 4 px hit area with a hover tint so the
            affordance reads without cluttering the border.
            role=separator + aria-valuenow makes screen readers announce the
            current width; Arrow keys nudge it in 16 px steps. */}
        {sidebarOpen && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-valuemin={SIDEBAR_MIN}
            aria-valuemax={SIDEBAR_MAX}
            aria-valuenow={sidebarWidth}
            aria-label="Resize sidebar"
            tabIndex={0}
            onMouseDown={startResize}
            onKeyDown={onResizeKeyDown}
            className="hidden md:block absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-[var(--color-primary)]/40 focus:bg-[var(--color-primary)]/60 focus:outline-none transition-colors"
          />
        )}
      </aside>

      {/* Main area — `min-w-0` is what lets flex children shrink below
           their content's natural width. Without it, a wide kanban row
           would push the whole layout to overflow the viewport instead
           of scrolling inside `<main>`. */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
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
          <div className="ml-auto flex items-center gap-2">
          <NotificationBell />
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex items-center gap-2 px-2.5 py-1 rounded text-xs"
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
          </div>
        </header>

        {/* Page content. `overflow-auto` gives both axes so page-level
             content wider than main (e.g. a table with many custom fields)
             surfaces a bottom scrollbar instead of being clipped. */}
        <main
          className="flex-1 overflow-auto min-w-0"
          style={{ backgroundColor: 'var(--color-bg)' }}
        >
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
  pinned = false,
}: {
  boardId: string;
  title: string;
  active: boolean;
  pinned?: boolean;
}) {
  // Expand automatically when the board is currently open; otherwise the
  // user can toggle the chevron. Keeping this as local state (rather than
  // URL-driven) avoids touching BoardViewPage's tab logic.
  const [expanded, setExpanded] = useState(active);
  useEffect(() => {
    if (active) setExpanded(true);
  }, [active]);
  const togglePin = useToggleBoardPin();

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
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); togglePin.mutate(boardId); }}
          className={`flex-shrink-0 p-0.5 text-xs transition-opacity ${pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
          style={{ color: pinned ? '#fbbf24' : 'var(--color-sidebar-text)' }}
          title={pinned ? '즐겨찾기 해제' : '즐겨찾기'}
          aria-label={pinned ? 'Unpin' : 'Pin'}
        >
          {pinned ? '★' : '☆'}
        </button>
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

/** Renders one of the four sidebar board sections (favorites/dept/personal/invited). */
function BoardBucketSection({
  label,
  boards,
  pathname,
}: {
  label: string;
  boards: Array<{ id: string; title: string; pinned: boolean }>;
  pathname: string;
}) {
  if (boards.length === 0) return null;
  return (
    <div>
      <div
        className="px-4 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider truncate"
        style={{ color: 'var(--color-sidebar-text)', opacity: 0.5 }}
        title={label}
      >
        {label} <span style={{ opacity: 0.6 }}>({boards.length})</span>
      </div>
      {boards.map((board) => {
        const active = pathname === `/boards/${board.id}`;
        return (
          <BoardNavLink
            key={board.id}
            boardId={board.id}
            title={board.title}
            active={active}
            pinned={board.pinned}
          />
        );
      })}
    </div>
  );
}

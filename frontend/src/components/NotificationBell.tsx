import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
  type NotificationSummary,
} from '../api/notifications';

/** Compact header bell with unread badge. Clicking opens a popover of the
 *  10 most recent unread rows; each row deep-links to the source
 *  (TaskDrawer or board page) and marks itself read on click. */
export default function NotificationBell() {
  const { data: countData } = useUnreadNotificationCount();
  const { data: listData, isLoading } = useNotifications({ unread: true });
  const markRead = useMarkNotificationRead();
  const unread = countData?.unread ?? 0;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const recent: NotificationSummary[] =
    listData?.pages.flatMap((p) => p.items).slice(0, 10) ?? [];

  const onRowClick = (n: NotificationSummary) => {
    setOpen(false);
    markRead.mutate({ id: n.id, read: true });
    const dest = notificationHref(n);
    if (dest) navigate(dest);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
        aria-expanded={open}
        className="relative p-1.5 rounded focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
            style={{
              backgroundColor: 'var(--color-danger, #ef4444)',
              color: 'var(--color-text-inverse)',
            }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-40 w-80 max-w-[90vw] rounded-lg shadow-lg"
          style={{
            backgroundColor: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
          }}
        >
          <div
            className="flex items-center justify-between px-3 py-2"
            style={{ borderBottom: '1px solid var(--color-border)' }}
          >
            <span
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--color-text-muted)' }}
            >
              알림
            </span>
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs"
              style={{ color: 'var(--color-primary)' }}
            >
              모두 보기
            </Link>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {isLoading && (
              <div className="px-3 py-6 text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
                로딩 중…
              </div>
            )}
            {!isLoading && recent.length === 0 && (
              <div className="px-3 py-6 text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
                읽지 않은 알림이 없어요.
              </div>
            )}
            {recent.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => onRowClick(n)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-surface-hover)]"
                style={{ borderBottom: '1px solid var(--color-border)' }}
              >
                <div className="font-medium line-clamp-2" style={{ color: 'var(--color-text)' }}>
                  {renderNotificationLine(n)}
                </div>
                <div className="mt-0.5 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  {relativeTime(n.created_at)}
                  {n.board_title ? ` · ${n.board_title}` : ''}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Display helpers — also used by NotificationsPage, re-exported.
// ---------------------------------------------------------------------------

export function renderNotificationLine(n: NotificationSummary): string {
  const who = n.actor_name ?? '누군가';
  const task = n.task_title ?? '작업';
  switch (n.kind) {
    case 'deadline_soon':
      return `${task} 의 기한이 24시간 안에 다가와요.`;
    case 'deadline_overdue':
      return `${task} 이(가) 기한을 지났어요.`;
    case 'assigned':
      return `${who} 님이 ${task} 을(를) 나에게 할당했어요.`;
    case 'mentioned':
      return `${who} 님이 ${task} 에서 나를 언급했어요.`;
    case 'board_activity':
    default:
      return `${who} 님이 ${task} 을(를) 업데이트했어요.`;
  }
}

export function notificationHref(n: NotificationSummary): string | null {
  if (n.board_id && n.task_id) {
    return `/boards/${n.board_id}?task=${n.task_id}`;
  }
  if (n.board_id) {
    return `/boards/${n.board_id}`;
  }
  return null;
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}초 전`;
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}일 전`;
  return d.toLocaleDateString();
}

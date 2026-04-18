import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
  type NotificationSummary,
} from '../api/notifications';
import NotificationRow, { notificationHref } from './NotificationRow';

/** Compact header bell with unread badge. Clicking opens a popover of the
 *  10 most recent unread rows; each row deep-links to the source
 *  (TaskDrawer or board page) and marks itself read on click.
 *  Row rendering is delegated to the shared NotificationRow so the popover
 *  stays visually consistent with the /notifications page. */
export default function NotificationBell() {
  const { t } = useTranslation();
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

  const onRowActivate = (n: NotificationSummary) => {
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
        aria-label={
          unread > 0
            ? t('notifications.bellUnreadLabel', { count: unread })
            : t('notifications.bellLabel')
        }
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
          className="absolute right-0 top-full mt-1 z-40 w-80 max-w-[90vw] rounded-lg shadow-lg overflow-hidden"
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
              {t('notifications.title')}
            </span>
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs"
              style={{ color: 'var(--color-primary)' }}
            >
              {t('notifications.viewAll')}
            </Link>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {isLoading && (
              <div className="px-3 py-6 text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {t('notifications.loading')}
              </div>
            )}
            {!isLoading && recent.length === 0 && <EmptyState compact />}
            {recent.map((n) => (
              <NotificationRow
                key={n.id}
                notification={n}
                onActivate={() => onRowActivate(n)}
                compact
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Shared empty state — small illustration + hint copy. Takes `compact`
 *  so the popover's smaller footprint doesn't get dwarfed by full-size
 *  typography from the page. */
export function EmptyState({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <div
      className="flex flex-col items-center justify-center text-center"
      style={{ padding: compact ? '1.75rem 1rem' : '3rem 1.5rem' }}
    >
      <div
        className="rounded-full flex items-center justify-center mb-3"
        style={{
          width: compact ? 40 : 56,
          height: compact ? 40 : 56,
          backgroundColor: 'var(--color-surface-hover)',
          color: 'var(--color-text-muted)',
        }}
        aria-hidden
      >
        <svg
          className={compact ? 'w-5 h-5' : 'w-7 h-7'}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5"
          />
        </svg>
      </div>
      <div
        className={compact ? 'text-xs' : 'text-sm font-medium'}
        style={{ color: 'var(--color-text)' }}
      >
        {t('notifications.emptyUnread')}
      </div>
      {!compact && (
        <div
          className="mt-1 text-xs max-w-xs"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {t('notifications.emptyHint')}
        </div>
      )}
    </div>
  );
}

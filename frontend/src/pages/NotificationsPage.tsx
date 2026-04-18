import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  type NotificationSummary,
} from '../api/notifications';
import NotificationRow, { notificationHref } from '../components/NotificationRow';
import { EmptyState } from '../components/NotificationBell';
import Button from '../components/ui/Button';

type Tab = 'unread' | 'all';

export default function NotificationsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('unread');
  const list = useNotifications({ unread: tab === 'unread' });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const navigate = useNavigate();

  const items: NotificationSummary[] = useMemo(
    () => list.data?.pages.flatMap((p) => p.items) ?? [],
    [list.data],
  );

  const activate = (n: NotificationSummary) => {
    if (!n.read_at) markRead.mutate({ id: n.id, read: true });
    const dest = notificationHref(n);
    if (dest) navigate(dest);
  };

  const toggleRead = (n: NotificationSummary) => {
    markRead.mutate({ id: n.id, read: !n.read_at });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 md:px-6 py-6">
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
          {t('notifications.title')}
        </h1>
        <div
          className="ml-auto flex items-center gap-1 rounded-lg p-0.5"
          style={{ backgroundColor: 'var(--color-surface-hover)' }}
        >
          <TabButton active={tab === 'unread'} onClick={() => setTab('unread')}>
            {t('notifications.tabUnread')}
          </TabButton>
          <TabButton active={tab === 'all'} onClick={() => setTab('all')}>
            {t('notifications.tabAll')}
          </TabButton>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => markAll.mutate()}
          disabled={markAll.isPending}
        >
          {t('notifications.markAllRead')}
        </Button>
      </div>

      {list.isLoading && (
        <div className="py-10 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {t('notifications.loading')}
        </div>
      )}
      {!list.isLoading && items.length === 0 && (
        <div
          className="rounded-lg"
          style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}
        >
          <EmptyState />
        </div>
      )}

      {items.length > 0 && (
        <ul
          className="rounded-lg overflow-hidden"
          style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}
        >
          {items.map((n, i) => (
            <li key={n.id} style={{ borderTop: i === 0 ? 'none' : undefined }}>
              <NotificationRow
                notification={n}
                onActivate={() => activate(n)}
                onToggleRead={toggleRead}
              />
            </li>
          ))}
        </ul>
      )}

      {list.hasNextPage && (
        <div className="flex justify-center mt-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => list.fetchNextPage()}
            disabled={list.isFetchingNextPage}
          >
            {list.isFetchingNextPage
              ? t('notifications.loading')
              : t('notifications.loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-medium px-2.5 py-1 rounded"
      style={{
        backgroundColor: active ? 'var(--color-surface)' : 'transparent',
        color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.04)' : undefined,
      }}
    >
      {children}
    </button>
  );
}

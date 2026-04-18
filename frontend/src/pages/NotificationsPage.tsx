import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  type NotificationSummary,
} from '../api/notifications';
import {
  notificationHref,
  renderNotificationLine,
} from '../components/NotificationBell';

type Tab = 'unread' | 'all';

export default function NotificationsPage() {
  const [tab, setTab] = useState<Tab>('unread');
  const list = useNotifications({ unread: tab === 'unread' });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const navigate = useNavigate();

  const items: NotificationSummary[] = useMemo(
    () => list.data?.pages.flatMap((p) => p.items) ?? [],
    [list.data],
  );

  const onRowClick = (n: NotificationSummary) => {
    if (!n.read_at) markRead.mutate({ id: n.id, read: true });
    const dest = notificationHref(n);
    if (dest) navigate(dest);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 md:px-6 py-6">
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
          알림
        </h1>
        <div
          className="ml-auto flex items-center gap-1 rounded-lg p-0.5"
          style={{ backgroundColor: 'var(--color-surface-hover)' }}
        >
          <TabButton active={tab === 'unread'} onClick={() => setTab('unread')}>
            안읽음
          </TabButton>
          <TabButton active={tab === 'all'} onClick={() => setTab('all')}>
            전체
          </TabButton>
        </div>
        <button
          type="button"
          onClick={() => markAll.mutate()}
          disabled={markAll.isPending}
          className="text-xs px-2.5 py-1 rounded"
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
          }}
        >
          모두 읽음
        </button>
      </div>

      {list.isLoading && (
        <div className="py-10 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
          불러오는 중…
        </div>
      )}
      {!list.isLoading && items.length === 0 && (
        <div className="py-10 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {tab === 'unread' ? '읽지 않은 알림이 없어요.' : '알림이 아직 없어요.'}
        </div>
      )}

      <ul
        className="rounded-lg overflow-hidden"
        style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}
      >
        {items.map((n, i) => {
          const unread = !n.read_at;
          return (
            <li
              key={n.id}
              style={{
                borderTop: i === 0 ? 'none' : '1px solid var(--color-border)',
              }}
            >
              <button
                type="button"
                onClick={() => onRowClick(n)}
                className="w-full text-left px-4 py-3 flex gap-3 items-start hover:bg-[var(--color-surface-hover)]"
              >
                <span
                  aria-hidden
                  className="mt-1 w-2 h-2 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: unread ? 'var(--color-primary)' : 'transparent',
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div
                    className="text-sm"
                    style={{
                      color: 'var(--color-text)',
                      fontWeight: unread ? 600 : 400,
                    }}
                  >
                    {renderNotificationLine(n)}
                  </div>
                  <div
                    className="mt-1 text-xs flex items-center gap-2"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    <span>{formatDate(n.created_at)}</span>
                    {n.board_title && (
                      <>
                        <span>·</span>
                        <span className="truncate">{n.board_title}</span>
                      </>
                    )}
                    <span>·</span>
                    <KindBadge kind={n.kind} />
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {list.hasNextPage && (
        <div className="flex justify-center mt-4">
          <button
            type="button"
            onClick={() => list.fetchNextPage()}
            disabled={list.isFetchingNextPage}
            className="text-sm px-3 py-1.5 rounded"
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            }}
          >
            {list.isFetchingNextPage ? '불러오는 중…' : '더 보기'}
          </button>
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

function KindBadge({ kind }: { kind: NotificationSummary['kind'] }) {
  const label: Record<NotificationSummary['kind'], string> = {
    deadline_soon: '기한 임박',
    deadline_overdue: '기한 초과',
    board_activity: '활동',
    mentioned: '멘션',
    assigned: '할당',
  };
  return (
    <span
      className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{
        backgroundColor: 'var(--color-surface-hover)',
        color: 'var(--color-text-muted)',
      }}
    >
      {label[kind]}
    </span>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMe } from '../api/users';
import { useDepartments } from '../api/departments';
import { useMyBoards } from '../api/boards';
import { useAppConfig } from '../api/config';
import { usePreferences } from '../api/preferences';
import { Spinner } from '../components/Spinner';
import Badge from '../components/ui/Badge';
import { roleClass } from '../theme/constants';

export default function ProfilePage() {
  const { t } = useTranslation();
  const { data: me, isLoading } = useMe();
  const { data: config } = useAppConfig();
  const { data: depts } = useDepartments();
  const { data: myBoards } = useMyBoards('all');
  const { data: prefs } = usePreferences();

  const deptEntries = useMemo(() => {
    if (!me || !depts) return [];
    const all = depts.items ?? [];
    return me.department_ids
      .map((id) => all.find((d) => d.id === id))
      .filter((d): d is NonNullable<typeof d> => !!d);
  }, [me, depts]);

  const boardCounts = useMemo(() => {
    const items = myBoards?.items ?? [];
    return {
      total: items.length,
      favorites: items.filter((b) => b.pinned).length,
      personal: items.filter((b) => b.bucket === 'personal').length,
      department: items.filter((b) => b.bucket === 'department').length,
      invited: items.filter((b) => b.bucket === 'invited').length,
    };
  }, [myBoards]);

  if (isLoading || !me) return <Spinner />;

  const isPersonal = config?.mode === 'personal';
  const themePref = (prefs?.preferences as { primaryColor?: string } | undefined)?.primaryColor;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 space-y-5">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
        {t('profile.title')}
      </h1>

      {/* Hero card */}
      <div className="surface-raised p-6">
        <div className="flex items-center gap-5">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold flex-shrink-0"
            style={{
              backgroundColor: themePref ?? 'var(--color-primary)',
              color: 'var(--color-text-inverse)',
            }}
          >
            {me.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold truncate" style={{ color: 'var(--color-text)' }}>
              {me.name}
            </h2>
            <p className="text-sm truncate" style={{ color: 'var(--color-text-secondary)' }}>
              {me.email}
            </p>
            <div className="flex flex-wrap gap-1 mt-2">
              {me.roles.map((r) => (
                <Badge key={r} className={roleClass(r)}>
                  {r}
                </Badge>
              ))}
              <Badge variant={me.active ? 'success' : 'neutral'}>
                {me.active ? t('directory.active') : t('directory.inactive')}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Departments — hidden in personal mode (no teams exist) */}
      {!isPersonal && (
        <div className="surface-raised p-6">
          <h3
            className="text-xs font-semibold uppercase tracking-wider mb-3"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {t('profile.departments', '소속 부서')}
          </h3>
          {deptEntries.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {t('profile.noDepartments', '아직 어떤 부서에도 속해있지 않아요.')}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {deptEntries.map((d) => (
                <span
                  key={d.id}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm"
                  style={{
                    backgroundColor: 'var(--color-surface-hover)',
                    color: 'var(--color-text)',
                    border: '1px solid var(--color-border)',
                  }}
                  title={d.slug}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {d.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Activity / stats */}
      <div className="surface-raised p-6">
        <h3
          className="text-xs font-semibold uppercase tracking-wider mb-3"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {t('profile.activity', '내 활동')}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile label={t('profile.boardsTotal', '전체 보드')} value={boardCounts.total} />
          <StatTile label={t('profile.boardsFavorites', '즐겨찾기')} value={boardCounts.favorites} />
          {!isPersonal && (
            <>
              <StatTile label={t('profile.boardsDepartment', '부서 보드')} value={boardCounts.department} />
              <StatTile label={t('profile.boardsInvited', '초대 보드')} value={boardCounts.invited} />
            </>
          )}
          {isPersonal && (
            <StatTile label={t('profile.boardsPersonal', '개인 보드')} value={boardCounts.personal} />
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <Link
            to="/notifications"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5"
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            }}
          >
            🔔 {t('profile.viewNotifications', '알림 센터')}
          </Link>
          <Link
            to="/settings"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5"
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            }}
          >
            ⚙️ {t('profile.openSettings', '환경설정')}
          </Link>
        </div>
      </div>

      {/* Account meta */}
      <div className="surface-raised p-6">
        <h3
          className="text-xs font-semibold uppercase tracking-wider mb-3"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {t('profile.account', '계정')}
        </h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <ProfileField
            label={t('profile.emailVerified')}
            value={me.email_verified ? t('profile.yes') : t('profile.no')}
          />
          <ProfileField
            label={t('profile.joined')}
            value={new Date(me.created_at).toLocaleDateString()}
          />
          <ProfileField
            label={t('profile.lastUpdated', '마지막 갱신')}
            value={new Date(me.updated_at).toLocaleString()}
          />
          <ProfileField
            label={t('profile.externalId', '외부 ID')}
            value={me.external_id}
            mono
          />
        </dl>

        {/* Only show the "managed via AD" hint in SSO mode — it confuses
            personal-mode users (there's no AD) and regular SSO users don't
            need it flagged on their own profile either, but keeping it as
            a subtle footer matches the existing copy. */}
        {!isPersonal && (
          <p
            className="text-xs mt-4 pt-3"
            style={{
              color: 'var(--color-text-muted)',
              borderTop: '1px solid var(--color-border)',
            }}
          >
            {t('profile.adManaged')}
          </p>
        )}
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="rounded-lg px-4 py-3"
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div className="text-2xl font-bold tabular-nums" style={{ color: 'var(--color-text)' }}>
        {value}
      </div>
      <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </div>
    </div>
  );
}

function ProfileField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt
        className="text-xs font-medium mb-0.5"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {label}
      </dt>
      <dd
        className={mono ? 'font-mono text-xs truncate' : 'truncate'}
        style={{ color: 'var(--color-text)' }}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

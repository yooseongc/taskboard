import { useTranslation } from 'react-i18next';
import { useMe } from '../api/users';
import { Spinner } from '../components/Spinner';
import Badge from '../components/ui/Badge';
import { roleClass } from '../theme/constants';

export default function ProfilePage() {
  const { t } = useTranslation();
  const { data: me, isLoading } = useMe();

  if (isLoading || !me) return <Spinner />;

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-2xl font-bold mb-8">{t('profile.title')}</h1>

      <div className="surface-raised p-6 space-y-6">
        {/* Avatar + Name */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold">
            {me.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-semibold">{me.name}</h2>
            <p className="text-sm text-[var(--color-text-secondary)]">{me.email}</p>
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
              {t('profile.roles')}
            </span>
            <div className="flex flex-wrap gap-1">
              {me.roles.map((r) => (
                <Badge key={r} className={roleClass(r)}>
                  {r}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <span className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
              {t('profile.status')}
            </span>
            <Badge
              className={
                me.active
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-700'
              }
            >
              {me.active ? t('directory.active') : t('directory.inactive')}
            </Badge>
          </div>
          <div>
            <span className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
              {t('profile.emailVerified')}
            </span>
            <span>{me.email_verified ? t('profile.yes') : t('profile.no')}</span>
          </div>
          <div>
            <span className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
              {t('profile.joined')}
            </span>
            <span>{new Date(me.created_at).toLocaleDateString()}</span>
          </div>
        </div>

        <p className="text-xs text-[var(--color-text-muted)] pt-2 border-t">
          {t('profile.adManaged')}
        </p>
      </div>
    </div>
  );
}

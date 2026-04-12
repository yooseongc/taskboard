import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDevLogin } from '../api/auth';
import { useAuthStore } from '../stores/authStore';
import { startOidcLogin } from '../auth/oidc';
import Button from '../components/ui/Button';

export default function LoginPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('alice@example.com');
  const [ssoLoading, setSsoLoading] = useState(false);
  const navigate = useNavigate();
  const devLogin = useDevLogin();
  const { login, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSsoLogin = async () => {
    setSsoLoading(true);
    try {
      await startOidcLogin();
    } catch (err) {
      console.error('SSO login failed:', err);
      setSsoLoading(false);
    }
  };

  const handleDevLogin = async () => {
    try {
      const result = await devLogin.mutateAsync(email);
      login(result.token);
      navigate('/', { replace: true });
    } catch (err) {
      console.error('Dev login failed:', err);
    }
  };

  const devAuthEnabled = import.meta.env.VITE_DEV_AUTH_ENABLED === '1';

  return (
    <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="w-full max-w-sm space-y-6 p-8 surface-raised">
        <div className="text-center">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>{t('auth.title')}</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>{t('auth.subtitle')}</p>
        </div>

        <Button
          size="lg"
          className="w-full"
          onClick={handleSsoLogin}
          disabled={ssoLoading}
        >
          {ssoLoading ? t('auth.redirecting') : t('auth.sso')}
        </Button>

        {devAuthEnabled && (
          <>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full" style={{ borderTop: '1px solid var(--color-border)' }} />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-3" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-muted)' }}>
                  {t('auth.devOnly')}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
                style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
              />
              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={handleDevLogin}
                disabled={devLogin.isPending}
              >
                {devLogin.isPending ? t('auth.loggingIn') : t('auth.devLogin')}
              </Button>
              {devLogin.isError && (
                <p className="text-xs text-center" style={{ color: 'var(--color-danger)' }}>
                  {t('auth.loginFailed')}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

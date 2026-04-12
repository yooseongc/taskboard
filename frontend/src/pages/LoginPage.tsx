import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDevLogin } from '../api/auth';
import { useAuthStore } from '../stores/authStore';
import { startOidcLogin } from '../auth/oidc';
import Button from '../components/ui/Button';

export default function LoginPage() {
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
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm space-y-6 rounded-xl bg-white p-8 shadow-lg">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Taskboard</h1>
          <p className="text-sm text-gray-400 mt-1">Sign in to continue</p>
        </div>

        <Button
          size="lg"
          className="w-full"
          onClick={handleSsoLogin}
          disabled={ssoLoading}
        >
          {ssoLoading ? 'Redirecting...' : 'Sign in with SSO'}
        </Button>

        {devAuthEnabled && (
          <>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-3 text-gray-400">
                  Development Only
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Button
                variant="secondary"
                size="lg"
                className="w-full border-amber-300 text-amber-700 hover:bg-amber-50"
                onClick={handleDevLogin}
                disabled={devLogin.isPending}
              >
                {devLogin.isPending ? 'Logging in...' : 'Dev Login'}
              </Button>
              {devLogin.isError && (
                <p className="text-red-500 text-xs text-center">
                  Login failed. Check backend.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

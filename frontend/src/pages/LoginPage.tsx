import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDevLogin } from '../api/auth';
import { useAuthStore } from '../stores/authStore';

export default function LoginPage() {
  const [email, setEmail] = useState('alice@example.com');
  const navigate = useNavigate();
  const devLogin = useDevLogin();
  const { login, isAuthenticated } = useAuthStore();

  if (isAuthenticated) {
    navigate('/', { replace: true });
    return null;
  }

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
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-6 rounded-lg bg-white p-8 shadow-lg">
        <h1 className="text-2xl font-bold text-center">Taskboard</h1>

        {/* OIDC Login (placeholder) */}
        <button
          className="w-full rounded-lg bg-blue-600 px-4 py-3 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
          disabled
        >
          Sign in with SSO
        </button>

        {devAuthEnabled && (
          <>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-2 text-gray-500">Dev Login</span>
              </div>
            </div>

            <div className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={handleDevLogin}
                disabled={devLogin.isPending}
                className="w-full rounded-lg bg-amber-500 px-4 py-2 text-white font-medium hover:bg-amber-600 disabled:opacity-50"
              >
                {devLogin.isPending ? 'Logging in...' : 'Dev Login'}
              </button>
              {devLogin.isError && (
                <p className="text-red-500 text-sm text-center">
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

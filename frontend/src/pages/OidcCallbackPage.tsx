import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { handleOidcCallback } from '../auth/oidc';
import { useAuthStore } from '../stores/authStore';
import { Spinner } from '../components/Spinner';

export default function OidcCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setError(
        `Login denied: ${errorParam} — ${searchParams.get('error_description') ?? ''}`,
      );
      return;
    }

    if (!code || !state) {
      setError('Missing authorization code or state parameter.');
      return;
    }

    let cancelled = false;

    handleOidcCallback(code, state)
      .then(({ access_token }) => {
        if (!cancelled) {
          login(access_token);
          navigate('/', { replace: true });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('OIDC callback error:', err);
          setError(err.message ?? 'Token exchange failed');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [searchParams, login, navigate]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <p className="text-red-600 font-medium">Authentication Error</p>
          <p className="text-sm text-gray-600">{error}</p>
          <a
            href="/login"
            className="inline-block px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Back to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-2">
        <Spinner />
        <p className="text-sm text-gray-500">Completing sign-in...</p>
      </div>
    </div>
  );
}

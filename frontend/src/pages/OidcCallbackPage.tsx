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
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: 'var(--color-bg)' }}>
        <div className="surface-raised p-8 max-w-md text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h2 className="font-semibold text-lg mb-2" style={{ color: 'var(--color-danger)' }}>로그인 오류</h2>
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
            로그인 과정에서 문제가 발생했습니다. 다시 시도해주세요.
          </p>
          <details className="text-left mb-4">
            <summary className="text-xs cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
              상세 정보
            </summary>
            <pre className="text-xs mt-2 p-2 rounded overflow-auto" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
              {error}
            </pre>
          </details>
          <a
            href="/login"
            className="inline-block px-4 py-2 text-sm rounded-lg"
            style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-text-inverse)' }}
          >
            로그인 페이지로 돌아가기
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="text-center space-y-2">
        <Spinner />
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>로그인 처리 중...</p>
      </div>
    </div>
  );
}

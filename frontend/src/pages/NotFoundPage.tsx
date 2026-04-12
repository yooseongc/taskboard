import { Link } from 'react-router-dom';

function NotFoundPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      <div className="text-center max-w-md">
        <h1 className="text-6xl font-bold mb-2" style={{ color: 'var(--color-text-muted)' }}>
          404
        </h1>
        <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
          페이지를 찾을 수 없습니다
        </h2>
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          요청하신 페이지가 존재하지 않거나, 이동되었을 수 있습니다.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg"
          style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-text-inverse)' }}
        >
          ← 보드로 돌아가기
        </Link>
      </div>
    </div>
  );
}

export default NotFoundPage;

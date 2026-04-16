import type { UserRef } from '../types/api';

interface Props {
  users: UserRef[];
  max?: number;
  size?: 'sm' | 'md';
  showEmpty?: boolean;
}

export default function AvatarStack({
  users,
  max = 3,
  showEmpty = true,
}: Props) {
  const list = users ?? [];
  const visible = list.slice(0, max);
  const overflow = list.length - visible.length;

  if (list.length === 0) {
    return showEmpty ? (
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        -
      </span>
    ) : null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((a) => (
        <span
          key={a.id}
          className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: 'var(--color-primary-light)',
            color: 'var(--color-primary-text)',
          }}
          title={a.email}
        >
          <span
            className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
            style={{
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-text-inverse)',
            }}
          >
            {a.name.charAt(0).toUpperCase()}
          </span>
          {a.name}
        </span>
      ))}
      {overflow > 0 && (
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: 'var(--color-surface-hover)',
            color: 'var(--color-text-secondary)',
          }}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}

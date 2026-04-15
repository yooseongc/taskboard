import type { UserRef } from '../types/api';

interface Props {
  users: UserRef[];
  max?: number;
  size?: 'sm' | 'md';
  showEmpty?: boolean;
}

const SIZE_CLASSES = {
  sm: 'w-5 h-5 text-[10px]',
  md: 'w-6 h-6 text-xs',
} as const;

export default function AvatarStack({
  users,
  max = 3,
  size = 'md',
  showEmpty = true,
}: Props) {
  const list = users ?? [];
  const visible = list.slice(0, max);
  const overflow = list.length - visible.length;
  const sz = SIZE_CLASSES[size];

  if (list.length === 0) {
    return showEmpty ? (
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        -
      </span>
    ) : null;
  }

  return (
    <div className="flex -space-x-1">
      {visible.map((a) => (
        <div
          key={a.id}
          className={`${sz} rounded-full flex items-center justify-center font-medium`}
          style={{
            backgroundColor: 'var(--color-primary)',
            color: 'var(--color-text-inverse)',
            border: '2px solid var(--color-surface)',
          }}
          title={a.name}
        >
          {a.name.charAt(0).toUpperCase()}
        </div>
      ))}
      {overflow > 0 && (
        <div
          className={`${sz} rounded-full flex items-center justify-center font-medium`}
          style={{
            backgroundColor: 'var(--color-surface-hover)',
            color: 'var(--color-text-secondary)',
            border: '2px solid var(--color-surface)',
          }}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}

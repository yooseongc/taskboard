interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: boolean;
}

export default function Skeleton({ className = '', width, height, rounded }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse ${className}`}
      style={{
        width,
        height,
        backgroundColor: 'var(--color-surface-hover)',
        borderRadius: rounded ? '9999px' : 'var(--radius-md)',
      }}
    />
  );
}

export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3"
          width={i === lines - 1 ? '70%' : '100%'}
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="surface-raised p-5">
      <Skeleton className="h-4 mb-3" width="60%" />
      <Skeleton className="h-3 mb-2" width="90%" />
      <Skeleton className="h-3" width="75%" />
    </div>
  );
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

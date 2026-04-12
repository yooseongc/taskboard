interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {icon && (
        <div className="mb-4" style={{ color: 'var(--color-text-muted)' }}>
          {icon}
        </div>
      )}
      <h3
        className="text-lg font-semibold mb-2"
        style={{ color: 'var(--color-text)' }}
      >
        {title}
      </h3>
      {description && (
        <p
          className="text-sm max-w-md mb-5"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {description}
        </p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}

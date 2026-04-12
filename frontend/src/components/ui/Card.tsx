interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export default function Card({ children, className = '', hover, onClick }: CardProps) {
  return (
    <div
      className={`${hover ? 'cursor-pointer' : ''} ${className}`}
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        transition: 'box-shadow 0.15s',
        ...(hover ? {} : {}),
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (hover) (e.currentTarget.style.boxShadow = 'var(--shadow-md)');
      }}
      onMouseLeave={(e) => {
        if (hover) (e.currentTarget.style.boxShadow = 'var(--shadow-sm)');
      }}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`px-5 py-4 ${className}`}
      style={{ borderBottom: '1px solid var(--color-border)' }}
    >
      {children}
    </div>
  );
}

export function CardBody({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}

import { Link } from 'react-router-dom';

interface Crumb {
  label: string;
  to?: string;
}

export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center text-sm">
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <span key={i} className="flex items-center">
            {item.to && !last ? (
              <Link
                to={item.to}
                className="hover:underline"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {item.label}
              </Link>
            ) : (
              <span
                style={{
                  color: last ? 'var(--color-text)' : 'var(--color-text-secondary)',
                  fontWeight: last ? 600 : 400,
                }}
              >
                {item.label}
              </span>
            )}
            {!last && (
              <span className="mx-2" style={{ color: 'var(--color-text-muted)' }}>
                /
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

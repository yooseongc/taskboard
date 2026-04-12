import type { ButtonHTMLAttributes } from 'react';

const base =
  'inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed';

const variants = {
  primary:
    'bg-[var(--color-primary)] text-[var(--color-text-inverse)] hover:bg-[var(--color-primary-hover)] focus:ring-[var(--color-primary)]',
  secondary:
    'bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] focus:ring-[var(--color-border)]',
  danger:
    'bg-[var(--color-surface)] text-[var(--color-danger)] border border-[var(--color-danger)]/30 hover:bg-[var(--color-danger-light)] focus:ring-[var(--color-danger)]',
  ghost:
    'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]',
  success:
    'bg-[var(--color-success)] text-[var(--color-text-inverse)] hover:opacity-90 focus:ring-[var(--color-success)]',
};

const sizes = {
  sm: 'px-2.5 py-1 text-xs rounded-[var(--radius-md)]',
  md: 'px-4 py-2 text-sm rounded-[var(--radius-lg)]',
  lg: 'px-5 py-2.5 text-sm rounded-[var(--radius-lg)]',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

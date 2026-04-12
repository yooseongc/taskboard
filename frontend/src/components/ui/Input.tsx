import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

const inputBase =
  'w-full text-sm outline-none transition-colors';

const inputStyle = {
  backgroundColor: 'var(--color-surface)',
  borderColor: 'var(--color-border)',
  borderWidth: '1px',
  borderRadius: 'var(--radius-lg)',
  color: 'var(--color-text)',
  padding: '0.5rem 0.75rem',
};

const focusClass =
  'focus:ring-2 focus:ring-[var(--color-border-focus)] focus:border-[var(--color-border-focus)]';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}

export function Input({ label, hint, className = '', ...props }: InputProps) {
  return (
    <div>
      {label && (
        <label
          className="block text-sm font-medium mb-1"
          style={{ color: 'var(--color-text)' }}
        >
          {label}
        </label>
      )}
      <input
        className={`${inputBase} ${focusClass} ${className}`}
        style={inputStyle}
        {...props}
      />
      {hint && (
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          {hint}
        </p>
      )}
    </div>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export function Textarea({ label, className = '', ...props }: TextareaProps) {
  return (
    <div>
      {label && (
        <label
          className="block text-sm font-medium mb-1"
          style={{ color: 'var(--color-text)' }}
        >
          {label}
        </label>
      )}
      <textarea
        className={`${inputBase} ${focusClass} min-h-[60px] ${className}`}
        style={inputStyle}
        {...props}
      />
    </div>
  );
}

interface SelectProps extends InputHTMLAttributes<HTMLSelectElement> {
  label?: string;
  children: React.ReactNode;
}

export function Select({ label, className = '', children, ...props }: SelectProps) {
  return (
    <div>
      {label && (
        <label
          className="block text-sm font-medium mb-1"
          style={{ color: 'var(--color-text)' }}
        >
          {label}
        </label>
      )}
      <select
        className={`${inputBase} ${focusClass} ${className}`}
        style={inputStyle}
        {...(props as React.SelectHTMLAttributes<HTMLSelectElement>)}
      >
        {children}
      </select>
    </div>
  );
}

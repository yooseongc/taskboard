// Design token references.
// These map to CSS custom properties defined in index.css.
// Using inline styles with var() for token-based theming.

export const PRIORITY_STYLES: Record<string, { bg: string; text: string }> = {
  urgent: { bg: 'bg-[var(--color-priority-urgent-bg)]', text: 'text-[var(--color-priority-urgent-text)]' },
  high: { bg: 'bg-[var(--color-priority-high-bg)]', text: 'text-[var(--color-priority-high-text)]' },
  medium: { bg: 'bg-[var(--color-priority-medium-bg)]', text: 'text-[var(--color-priority-medium-text)]' },
  low: { bg: 'bg-[var(--color-priority-low-bg)]', text: 'text-[var(--color-priority-low-text)]' },
};

export const ROLE_STYLES: Record<string, { bg: string; text: string }> = {
  SystemAdmin: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300' },
  DepartmentAdmin: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300' },
  Member: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' },
  Viewer: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-500 dark:text-gray-400' },
};

export const PRIORITY_EVENT_COLORS: Record<string, string> = {
  urgent: '#dc2626',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#16a34a',
};

export function priorityClass(priority: string): string {
  const s = PRIORITY_STYLES[priority];
  return s ? `${s.bg} ${s.text}` : 'bg-gray-100 text-gray-600';
}

export function roleClass(role: string): string {
  const s = ROLE_STYLES[role];
  return s ? `${s.bg} ${s.text}` : 'bg-gray-100 text-gray-600';
}

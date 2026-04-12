// Centralized style constants to eliminate duplication across pages.

export const PRIORITY_STYLES: Record<string, { bg: string; text: string }> = {
  urgent: { bg: 'bg-red-100', text: 'text-red-700' },
  high: { bg: 'bg-orange-100', text: 'text-orange-700' },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  low: { bg: 'bg-green-100', text: 'text-green-700' },
};

export const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  open: { bg: 'bg-blue-100', text: 'text-blue-700' },
  in_progress: { bg: 'bg-amber-100', text: 'text-amber-700' },
  done: { bg: 'bg-green-100', text: 'text-green-700' },
  archived: { bg: 'bg-gray-100', text: 'text-gray-500' },
};

export const ROLE_STYLES: Record<string, { bg: string; text: string }> = {
  SystemAdmin: { bg: 'bg-red-100', text: 'text-red-700' },
  DepartmentAdmin: { bg: 'bg-purple-100', text: 'text-purple-700' },
  Member: { bg: 'bg-blue-100', text: 'text-blue-700' },
  Viewer: { bg: 'bg-gray-100', text: 'text-gray-500' },
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

// Tag / badge color system (tokens).
//
// The physical color values live in index.css as `--tag-<family>-{bg,text}`
// and flip automatically between light and dark mode via the `.dark` override.
// This module owns the *semantic* mapping — "what family does an urgent
// priority or a SystemAdmin role resolve to" — so renaming a role or
// re-tuning the palette touches at most one file.
//
// Priority and status mappings are *user-configurable* and live in
// `stores/tagColorStore.ts`. Role and active/inactive remain fixed for
// security/semantic reasons.

import { useTagColorStore } from '../stores/tagColorStore';

/**
 * 8 semantic families, see STYLE_GUIDE.md § Tag Palette for visual reference.
 * Values must match the CSS variable suffixes in index.css.
 */
export type TagVariant =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'orange'
  | 'danger'
  | 'critical'
  | 'accent';

/**
 * Class composition for a given variant. Must be a static lookup rather
 * than a template literal — Tailwind's JIT can only pick up class strings
 * that appear verbatim in source, so `bg-[var(--tag-${variant}-bg)]`
 * silently produces no CSS rule and badges render transparent. Keep all
 * eight variants spelled out literally here.
 */
const TAG_CLASSES: Record<TagVariant, string> = {
  neutral:  'bg-[var(--tag-neutral-bg)] text-[var(--tag-neutral-text)]',
  info:     'bg-[var(--tag-info-bg)] text-[var(--tag-info-text)]',
  success:  'bg-[var(--tag-success-bg)] text-[var(--tag-success-text)]',
  warning:  'bg-[var(--tag-warning-bg)] text-[var(--tag-warning-text)]',
  orange:   'bg-[var(--tag-orange-bg)] text-[var(--tag-orange-text)]',
  danger:   'bg-[var(--tag-danger-bg)] text-[var(--tag-danger-text)]',
  critical: 'bg-[var(--tag-critical-bg)] text-[var(--tag-critical-text)]',
  accent:   'bg-[var(--tag-accent-bg)] text-[var(--tag-accent-text)]',
};

export function tagClass(variant: TagVariant): string {
  return TAG_CLASSES[variant];
}

// ---------------------------------------------------------------------------
// Domain → variant aliases
// ---------------------------------------------------------------------------
//
// `roleClass` and `activeClass` are static: role color expresses a permission
// level that should be visually identical across users, and active/inactive
// is a low-variation binary.
//
// `priorityClass` / `statusClass` come in two flavors:
//   • Pure functions below — resolve against the STYLE_GUIDE defaults.
//     Use these from non-React contexts (e.g., raster drawing, memoized
//     selectors outside React tree) where subscription isn't an option.
//   • React hook `useTagTheme()` below — reactive to the user's saved
//     preferences. Component render paths must use this so that changing a
//     color in Settings re-paints existing badges without a reload.

const ROLE_VARIANT: Record<string, TagVariant> = {
  SystemAdmin: 'critical',
  DepartmentAdmin: 'accent',
  TeamAdmin: 'info',
  Member: 'neutral',
  Viewer: 'neutral',
};

export function priorityClass(priority: string): string {
  // Non-reactive fallback. Reads the current store snapshot at call time so
  // raster consumers (CalendarView style getters, etc.) still honor user
  // customization even though they won't re-render without tree invalidation.
  const map = useTagColorStore.getState().priorityMap;
  return tagClass(map[priority] ?? 'neutral');
}

export function statusClass(status: string): string {
  const map = useTagColorStore.getState().statusMap;
  return tagClass(map[status] ?? 'neutral');
}

export function roleClass(role: string): string {
  return tagClass(ROLE_VARIANT[role] ?? 'neutral');
}

export function activeClass(active: boolean): string {
  return tagClass(active ? 'success' : 'neutral');
}

/**
 * Reactive variant of the domain resolvers. Use from React components that
 * render priority/status chips so the UI live-updates when the user tweaks
 * their color assignments in Settings.
 */
export function useTagTheme() {
  const priorityMap = useTagColorStore((s) => s.priorityMap);
  const statusMap = useTagColorStore((s) => s.statusMap);
  return {
    priorityClass: (p: string) => tagClass(priorityMap[p] ?? 'neutral'),
    statusClass: (s: string) => tagClass(statusMap[s] ?? 'neutral'),
    roleClass,
    activeClass,
  };
}

// ---------------------------------------------------------------------------
// Legacy exports (kept for any remaining ad-hoc callers).
// Prefer `tagClass(variant)` for new code.
// ---------------------------------------------------------------------------

export const PRIORITY_EVENT_COLORS: Record<string, string> = {
  urgent: '#dc2626',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#16a34a',
};

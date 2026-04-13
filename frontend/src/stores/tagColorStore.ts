import { create } from 'zustand';
import type { TagVariant } from '../theme/constants';

// User-customizable color assignment for priority and status chips.
//
// The 8 semantic families in the STYLE_GUIDE (neutral / info / success /
// warning / orange / danger / critical / accent) form the entire choice
// space — free-form hex is intentionally not offered, so the palette stays
// consistent across the product and dark-mode contrast guarantees hold.
//
// Role color is *not* customizable: permission levels should look the same
// for every user so a SystemAdmin badge is never mistaken for a Member one.
//
// Persistence shape (stored in user_preferences.preferences JSONB):
//   "priorityColors": { "urgent": "critical", "high": "orange", ... }
//   "statusColors":   { "open": "info",       "in_progress": "warning", ... }
//
// Unknown keys or values falling outside TagVariant are dropped on hydrate.

export const DEFAULT_PRIORITY_MAP: Record<string, TagVariant> = {
  urgent: 'critical',
  high: 'orange',
  medium: 'warning',
  low: 'success',
};

export const DEFAULT_STATUS_MAP: Record<string, TagVariant> = {
  open: 'info',
  in_progress: 'warning',
  done: 'success',
  archived: 'neutral',
};

const VALID_VARIANTS: readonly TagVariant[] = [
  'neutral',
  'info',
  'success',
  'warning',
  'orange',
  'danger',
  'critical',
  'accent',
];

function isTagVariant(v: unknown): v is TagVariant {
  return typeof v === 'string' && (VALID_VARIANTS as readonly string[]).includes(v);
}

/**
 * Project a raw JSONB object into a variant map. Invalid keys or values
 * collapse to the default — we never throw, since the server payload is
 * effectively untyped.
 */
function sanitize(
  raw: unknown,
  defaults: Record<string, TagVariant>,
): Record<string, TagVariant> {
  if (!raw || typeof raw !== 'object') return { ...defaults };
  const source = raw as Record<string, unknown>;
  const out = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const val = source[key];
    if (isTagVariant(val)) out[key] = val;
  }
  return out;
}

interface TagColorState {
  priorityMap: Record<string, TagVariant>;
  statusMap: Record<string, TagVariant>;
  /** Replace a single priority level's variant. */
  setPriority: (level: string, variant: TagVariant) => void;
  /** Replace a single status value's variant. */
  setStatus: (status: string, variant: TagVariant) => void;
  /** Replace both maps in bulk — used by the hydrator on prefs load. */
  hydrate: (priority: unknown, status: unknown) => void;
  /** Revert to STYLE_GUIDE defaults. */
  reset: () => void;
}

export const useTagColorStore = create<TagColorState>((set) => ({
  priorityMap: { ...DEFAULT_PRIORITY_MAP },
  statusMap: { ...DEFAULT_STATUS_MAP },
  setPriority: (level, variant) =>
    set((s) => ({ priorityMap: { ...s.priorityMap, [level]: variant } })),
  setStatus: (status, variant) =>
    set((s) => ({ statusMap: { ...s.statusMap, [status]: variant } })),
  hydrate: (priority, status) =>
    set({
      priorityMap: sanitize(priority, DEFAULT_PRIORITY_MAP),
      statusMap: sanitize(status, DEFAULT_STATUS_MAP),
    }),
  reset: () =>
    set({
      priorityMap: { ...DEFAULT_PRIORITY_MAP },
      statusMap: { ...DEFAULT_STATUS_MAP },
    }),
}));

import { useEffect } from 'react';
import { usePreferences } from '../api/preferences';

/**
 * Mount-time adapter that restores the user's saved accent color
 * (`preferences.primaryColor`) onto `document.documentElement` as soon as the
 * authenticated preferences land.
 *
 * Lives in Layout — not in SettingsPage — so the color survives a hard
 * refresh or a navigation to any other route. Previously the restore
 * happened only on Settings mount, which created the surprising UX where
 * users had to "enter Settings" for their saved color to take effect.
 *
 * Renders nothing. Writes both `--color-primary` and the derived
 * `--color-primary-hover` / `--color-primary-light` so dependent tokens move
 * with the base color (they're flat CSS vars, not computed from another var).
 */
export default function AccentColorSync() {
  const { data: prefs } = usePreferences();

  useEffect(() => {
    const bag = (prefs?.preferences ?? {}) as Record<string, unknown>;
    const color = bag.primaryColor;
    if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) return;

    const root = document.documentElement.style;
    root.setProperty('--color-primary', color);
    root.setProperty('--color-primary-hover', adjustBrightness(color, -15));
    root.setProperty('--color-primary-light', adjustBrightness(color, 80));
  }, [prefs]);

  return null;
}

/**
 * Shift a `#RRGGBB` color toward white (positive percent) or black (negative).
 * Mirrors SettingsPage's `adjustBrightness` — kept as a private copy here so
 * the provider stays self-contained and doesn't drag a component-scoped
 * helper into a mount-time path.
 */
function adjustBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + Math.round(2.55 * percent)));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + Math.round(2.55 * percent)));
  const b = Math.min(255, Math.max(0, (num & 0xff) + Math.round(2.55 * percent)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

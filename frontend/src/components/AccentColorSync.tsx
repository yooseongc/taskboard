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
    const root = document.documentElement;

    // Accent color
    const color = bag.primaryColor;
    if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) {
      root.style.setProperty('--color-primary', color);
      root.style.setProperty('--color-primary-hover', adjustBrightness(color, -15));
      root.style.setProperty('--color-primary-light', adjustBrightness(color, 80));
    }

    // Sidebar color. User-picked hex overrides the default sidebar bg,
    // but we also recompute readable text tokens from luminance so a dark
    // pick in light mode (or vice-versa) doesn't leave the labels invisible.
    const sidebar = bag.sidebarColor;
    if (typeof sidebar === 'string' && /^#[0-9a-fA-F]{6}$/.test(sidebar)) {
      root.style.setProperty('--color-sidebar-bg', sidebar);
      const isDarkBg = relativeLuminance(sidebar) < 0.5;
      if (isDarkBg) {
        // Dark bg → light text. Bump hover/border toward white.
        root.style.setProperty('--color-sidebar-text', 'rgba(255,255,255,0.75)');
        root.style.setProperty('--color-sidebar-text-active', '#ffffff');
        root.style.setProperty('--color-sidebar-hover', adjustBrightness(sidebar, 12));
        root.style.setProperty('--color-sidebar-border', adjustBrightness(sidebar, 12));
      } else {
        // Light bg → dark text. Warm charcoal matches the Notion body color.
        root.style.setProperty('--color-sidebar-text', 'rgba(55,53,47,0.75)');
        root.style.setProperty('--color-sidebar-text-active', '#37352f');
        root.style.setProperty('--color-sidebar-hover', adjustBrightness(sidebar, -6));
        root.style.setProperty('--color-sidebar-border', 'rgba(55,53,47,0.09)');
      }
    }

    // Global density
    const density = bag.density;
    if (typeof density === 'string') {
      root.setAttribute('data-density', density);
    }
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

/** WCAG relative luminance for `#RRGGBB`. 0 (black) to 1 (white). */
function relativeLuminance(hex: string): number {
  const num = parseInt(hex.replace('#', ''), 16);
  const channel = (raw: number) => {
    const v = raw / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const r = channel((num >> 16) & 0xff);
  const g = channel((num >> 8) & 0xff);
  const b = channel(num & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

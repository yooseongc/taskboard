import { useEffect } from 'react';
import { usePreferences } from '../api/preferences';
import { useTagColorStore } from '../stores/tagColorStore';

/**
 * Mount-time adapter that pulls `priorityColors` / `statusColors` out of the
 * authenticated user's preferences and loads them into the tag-color store.
 *
 * Renders nothing. Sits inside the auth-guarded layout so it only runs once
 * we have a real user context — anonymous visitors see the default palette.
 *
 * Changes made in Settings are pushed back via `usePatchPreferences` +
 * `useTagColorStore.set*`, then reflected here again on next refetch.
 */
export default function TagColorSync() {
  const { data: prefs } = usePreferences();
  const hydrate = useTagColorStore((s) => s.hydrate);

  useEffect(() => {
    if (!prefs) return;
    const bag = (prefs.preferences ?? {}) as Record<string, unknown>;
    hydrate(bag.priorityColors, bag.statusColors);
  }, [prefs, hydrate]);

  return null;
}

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreferences, usePatchPreferences } from '../api/preferences';
import { useTheme } from '../theme/ThemeProvider';
import { Spinner } from '../components/Spinner';
import Badge from '../components/ui/Badge';
import { useToastStore } from '../stores/toastStore';
import {
  useTagColorStore,
  DEFAULT_PRIORITY_MAP,
  DEFAULT_STATUS_MAP,
} from '../stores/tagColorStore';
import { tagClass, type TagVariant } from '../theme/constants';
import Button from '../components/ui/Button';

const TAG_VARIANTS: TagVariant[] = [
  'neutral',
  'info',
  'success',
  'warning',
  'orange',
  'danger',
  'critical',
  'accent',
];

const PRIORITY_LEVELS = ['urgent', 'high', 'medium', 'low'] as const;
const STATUS_VALUES = ['open', 'in_progress', 'done', 'archived'] as const;

const themeKeys = ['light', 'dark', 'system'] as const;

const locales = [
  { value: 'ko', label: '한국어', flag: '🇰🇷' },
  { value: 'en', label: 'English', flag: '🇺🇸' },
];

const presetColors = [
  { name: 'Blue (Default)', value: '#2563eb' },
  { name: 'Violet', value: '#7c3aed' },
  { name: 'Emerald', value: '#059669' },
  { name: 'Rose', value: '#e11d48' },
  { name: 'Amber', value: '#d97706' },
  { name: 'Cyan', value: '#0891b2' },
];

export default function SettingsPage() {
  const { data, isLoading } = usePreferences();
  const patchPrefs = usePatchPreferences();
  const { theme, setTheme, resolved } = useTheme();
  const addToast = useToastStore((s) => s.addToast);
  const { i18n, t } = useTranslation();
  const [customColor, setCustomColor] = useState('');

  const currentLocale = data?.locale ?? 'ko';
  const currentPrimary = (data?.preferences as Record<string, unknown> | undefined)
    ?.primaryColor as string | undefined;

  // Restore the user's saved accent color on first prefs load so it survives a refresh.
  useEffect(() => {
    if (currentPrimary) {
      document.documentElement.style.setProperty('--color-primary', currentPrimary);
      document.documentElement.style.setProperty(
        '--color-primary-hover',
        adjustBrightness(currentPrimary, -15),
      );
      document.documentElement.style.setProperty(
        '--color-primary-light',
        adjustBrightness(currentPrimary, 80),
      );
    }
  }, [currentPrimary]);

  if (isLoading) return <Spinner />;

  const handleThemeChange = (next: typeof theme) => {
    setTheme(next);
    patchPrefs.mutate({ theme: next });
  };

  const handleLocaleChange = (locale: string) => {
    i18n.changeLanguage(locale);
    localStorage.setItem('taskboard_locale', locale);
    patchPrefs.mutate(
      { locale },
      { onSuccess: () => addToast('success', t('settings.langHint')) },
    );
  };

  const priorityMap = useTagColorStore((s) => s.priorityMap);
  const statusMap = useTagColorStore((s) => s.statusMap);
  const setPriorityVariant = useTagColorStore((s) => s.setPriority);
  const setStatusVariant = useTagColorStore((s) => s.setStatus);
  const resetTagColors = useTagColorStore((s) => s.reset);

  /**
   * Persist a single priority/status color change. Optimistic store update
   * happens first (via the caller), so the UI paints instantly; this then
   * merges the full current map into the JSONB bag server-side so partial
   * writes don't wipe the sibling field. We intentionally re-read from
   * `useTagColorStore.getState()` rather than closure state to avoid a stale
   * value sneaking in between two rapid clicks.
   */
  const savePriorityColor = (level: string, variant: TagVariant) => {
    setPriorityVariant(level, variant);
    const next = { ...useTagColorStore.getState().priorityMap, [level]: variant };
    patchPrefs.mutate({
      preferences: {
        ...(data?.preferences ?? {}),
        priorityColors: next,
      },
    });
  };

  const saveStatusColor = (status: string, variant: TagVariant) => {
    setStatusVariant(status, variant);
    const next = { ...useTagColorStore.getState().statusMap, [status]: variant };
    patchPrefs.mutate({
      preferences: {
        ...(data?.preferences ?? {}),
        statusColors: next,
      },
    });
  };

  const handleResetTagColors = () => {
    resetTagColors();
    patchPrefs.mutate(
      {
        preferences: {
          ...(data?.preferences ?? {}),
          priorityColors: DEFAULT_PRIORITY_MAP,
          statusColors: DEFAULT_STATUS_MAP,
        },
      },
      { onSuccess: () => addToast('success', t('settings.tagColorsReset')) },
    );
  };

  const handlePrimaryColor = (color: string) => {
    document.documentElement.style.setProperty('--color-primary', color);
    document.documentElement.style.setProperty(
      '--color-primary-hover',
      adjustBrightness(color, -15),
    );
    document.documentElement.style.setProperty(
      '--color-primary-light',
      adjustBrightness(color, 80),
    );
    patchPrefs.mutate(
      { preferences: { primaryColor: color } },
      { onSuccess: () => addToast('success', 'Accent color updated') },
    );
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-2xl font-bold mb-8" style={{ color: 'var(--color-text)' }}>
        {t('settings.title')}
      </h1>

      {/* Theme */}
      <section className="surface-raised p-5 mb-6">
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text)' }}>
          {t('settings.appearance')}
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {themeKeys.map((key) => (
            <button
              key={key}
              onClick={() => handleThemeChange(key)}
              className="p-3 rounded-lg text-left transition-all"
              style={{
                border: `2px solid ${theme === key ? 'var(--color-primary)' : 'var(--color-border)'}`,
                backgroundColor: theme === key ? 'var(--color-surface-active)' : 'var(--color-surface)',
              }}
            >
              <div
                className="w-full h-12 rounded mb-2"
                style={{
                  background:
                    key === 'dark' ? '#1e293b'
                    : key === 'light' ? '#ffffff'
                    : 'linear-gradient(to right, #ffffff, #1e293b)',
                  border: key === 'light' ? '1px solid var(--color-border)' : undefined,
                }}
              />
              <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                {t(`settings.${key}`)}
              </div>
              <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {t(`settings.${key}Desc`)}
              </div>
            </button>
          ))}
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--color-text-muted)' }}>
          {t('settings.currentMode', { mode: t(`settings.${resolved}`) })}
        </p>
      </section>

      {/* Accent Color */}
      <section className="surface-raised p-5 mb-6">
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text)' }}>
          {t('settings.accentColor')}
        </h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {presetColors.map((c) => (
            <button
              key={c.value}
              onClick={() => handlePrimaryColor(c.value)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all"
              style={{
                border: `2px solid ${currentPrimary === c.value || (!currentPrimary && c.value === '#2563eb') ? c.value : 'var(--color-border)'}`,
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text)',
              }}
            >
              <span
                className="w-4 h-4 rounded-full flex-shrink-0"
                style={{ backgroundColor: c.value }}
              />
              {c.name}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <input
            type="color"
            value={customColor || currentPrimary || '#2563eb'}
            onChange={(e) => setCustomColor(e.target.value)}
            className="w-8 h-8 p-0 border rounded cursor-pointer"
          />
          <input
            placeholder="#hex"
            className="text-sm border rounded px-2 py-1 w-24"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
            }}
            value={customColor}
            onChange={(e) => setCustomColor(e.target.value)}
          />
          <Button
            size="sm"
            disabled={!customColor || !/^#[0-9a-fA-F]{6}$/.test(customColor)}
            onClick={() => handlePrimaryColor(customColor)}
          >
            {t('settings.apply')}
          </Button>
        </div>
      </section>

      {/* Language */}
      <section className="surface-raised p-5 mb-6">
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text)' }}>
          {t('settings.language')}
        </h2>
        <div className="flex gap-2">
          {locales.map((l) => (
            <Button
              key={l.value}
              variant={currentLocale === l.value ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => handleLocaleChange(l.value)}
            >
              {l.flag} {l.label}
            </Button>
          ))}
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
          {t('settings.langHint')}
        </p>
      </section>

      {/* Tag Colors — priority + status variant picker */}
      <section className="surface-raised p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            {t('settings.tagColors')}
          </h2>
          <button
            onClick={handleResetTagColors}
            className="text-xs hover:underline"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {t('settings.resetDefaults')}
          </button>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
          {t('settings.tagColorsHint')}
        </p>

        <h3
          className="text-xs font-semibold uppercase tracking-wider mb-2"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {t('task.priority')}
        </h3>
        <div className="space-y-2 mb-5">
          {PRIORITY_LEVELS.map((level) => (
            <TagColorRow
              key={level}
              label={t(`tableView.priority${level.charAt(0).toUpperCase() + level.slice(1)}`)}
              currentVariant={priorityMap[level] ?? 'neutral'}
              onChange={(v) => savePriorityColor(level, v)}
            />
          ))}
        </div>

        <h3
          className="text-xs font-semibold uppercase tracking-wider mb-2"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {t('task.status')}
        </h3>
        <div className="space-y-2">
          {STATUS_VALUES.map((status) => {
            const key = status === 'in_progress' ? 'InProgress' : status.charAt(0).toUpperCase() + status.slice(1);
            return (
              <TagColorRow
                key={status}
                label={t(`tableView.status${key}`)}
                currentVariant={statusMap[status] ?? 'neutral'}
                onChange={(v) => saveStatusColor(status, v)}
              />
            );
          })}
        </div>
      </section>

      {/* About */}
      <section className="surface-raised p-5">
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text)' }}>
          {t('settings.about')}
        </h2>
        <div className="text-sm space-y-1" style={{ color: 'var(--color-text-secondary)' }}>
          <p>Taskboard v0.1.0</p>
          <p>Accounts and departments managed via Active Directory.</p>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Custom CSS: Override CSS variables in :root to customize appearance.
          </p>
        </div>
      </section>
    </div>
  );
}

/**
 * One row in the "Tag Colors" section: a label on the left and 8 chip swatches
 * on the right, one per family. Clicking a swatch re-assigns the domain value
 * to that variant. The live `<Badge>` next to the label previews the current
 * choice, so users see the exact appearance they'll get on board cards.
 */
function TagColorRow({
  label,
  currentVariant,
  onChange,
}: {
  label: string;
  currentVariant: TagVariant;
  onChange: (v: TagVariant) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 flex items-center gap-2">
        <Badge variant={currentVariant}>{label}</Badge>
      </div>
      <div className="flex flex-wrap gap-1">
        {TAG_VARIANTS.map((v) => {
          const active = v === currentVariant;
          return (
            <button
              key={v}
              onClick={() => onChange(v)}
              aria-label={v}
              aria-pressed={active}
              title={v}
              className={`w-6 h-6 rounded transition-all ${tagClass(v)}`}
              style={{
                outline: active ? '2px solid var(--color-primary)' : 'none',
                outlineOffset: '1px',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Adjust hex color brightness by percentage (-100 to 100) */
function adjustBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + Math.round(2.55 * percent)));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + Math.round(2.55 * percent)));
  const b = Math.min(255, Math.max(0, (num & 0xff) + Math.round(2.55 * percent)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

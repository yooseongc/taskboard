import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreferences, usePatchPreferences } from '../api/preferences';
import { useTheme } from '../theme/ThemeProvider';
import { Spinner } from '../components/Spinner';
import { useToastStore } from '../stores/toastStore';
import Button from '../components/ui/Button';

const themes = [
  { value: 'light' as const, label: 'Light', desc: 'Always light' },
  { value: 'dark' as const, label: 'Dark', desc: 'Always dark' },
  { value: 'system' as const, label: 'System', desc: 'Follow OS setting' },
];

const locales = [
  { value: 'ko', label: '한국어', flag: '🇰🇷' },
  { value: 'en', label: 'English', flag: '🇺🇸' },
  { value: 'ja', label: '日本語', flag: '🇯🇵' },
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
  const [customColor, setCustomColor] = useState('');

  if (isLoading) return <Spinner />;

  const currentLocale = data?.locale ?? 'ko';
  const currentPrimary = (data?.preferences as Record<string, unknown>)?.primaryColor as string | undefined;

  const handleThemeChange = (t: typeof theme) => {
    setTheme(t);
    patchPrefs.mutate({ theme: t });
  };

  const { i18n, t } = useTranslation();

  const handleLocaleChange = (locale: string) => {
    i18n.changeLanguage(locale);
    localStorage.setItem('taskboard_locale', locale);
    patchPrefs.mutate(
      { locale },
      { onSuccess: () => addToast('success', t('settings.langHint')) },
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
        Settings
      </h1>

      {/* Theme */}
      <section className="surface-raised p-5 mb-6">
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text)' }}>
          Appearance
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {themes.map((t) => (
            <button
              key={t.value}
              onClick={() => handleThemeChange(t.value)}
              className="p-3 rounded-lg text-left transition-all"
              style={{
                border: `2px solid ${theme === t.value ? 'var(--color-primary)' : 'var(--color-border)'}`,
                backgroundColor: theme === t.value ? 'var(--color-surface-active)' : 'var(--color-surface)',
              }}
            >
              <div
                className="w-full h-12 rounded mb-2"
                style={{
                  background:
                    t.value === 'dark' ? '#1e293b'
                    : t.value === 'light' ? '#ffffff'
                    : 'linear-gradient(to right, #ffffff, #1e293b)',
                  border: t.value === 'light' ? '1px solid var(--color-border)' : undefined,
                }}
              />
              <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                {t.label}
              </div>
              <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {t.desc}
              </div>
            </button>
          ))}
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--color-text-muted)' }}>
          Currently: {resolved} mode
        </p>
      </section>

      {/* Accent Color */}
      <section className="surface-raised p-5 mb-6">
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text)' }}>
          Accent Color
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
            Apply
          </Button>
        </div>
      </section>

      {/* Language */}
      <section className="surface-raised p-5 mb-6">
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text)' }}>
          Language
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
          Full i18n translation coming soon.
        </p>
      </section>

      {/* About */}
      <section className="surface-raised p-5">
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text)' }}>
          About
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

/** Adjust hex color brightness by percentage (-100 to 100) */
function adjustBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + Math.round(2.55 * percent)));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + Math.round(2.55 * percent)));
  const b = Math.min(255, Math.max(0, (num & 0xff) + Math.round(2.55 * percent)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

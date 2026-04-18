import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreferences, usePatchPreferences } from '../api/preferences';
import { useAppConfig } from '../api/config';
import { useTheme } from '../theme/ThemeProvider';
import { Spinner } from '../components/Spinner';
import { useToastStore } from '../stores/toastStore';
import Button from '../components/ui/Button';

const themeKeys = ['light', 'dark', 'system'] as const;

const locales = [
  { value: 'ko', label: '한국어', flag: '🇰🇷' },
  { value: 'en', label: 'English', flag: '🇺🇸' },
];

const presetColors = [
  { name: 'Blue', value: '#2563eb' },
  { name: 'Violet', value: '#7c3aed' },
  { name: 'Emerald', value: '#059669' },
  { name: 'Rose', value: '#e11d48' },
  { name: 'Amber', value: '#d97706' },
  { name: 'Cyan', value: '#0891b2' },
  { name: 'Indigo', value: '#4f46e5' },
  { name: 'Teal', value: '#0d9488' },
];

const sidebarPresets = [
  { name: 'Navy', value: '#111827' },
  { name: 'Charcoal', value: '#18181b' },
  { name: 'Deep Green', value: '#052e16' },
  { name: 'Bordeaux', value: '#450a0a' },
  { name: 'Indigo', value: '#1e1b4b' },
  { name: 'Slate', value: '#1e293b' },
  { name: 'Ocean', value: '#082f49' },
  { name: 'Espresso', value: '#292524' },
];

const densityOptions = [
  { key: 'compact' as const, label: 'Compact', desc: 'Dense UI, less padding' },
  { key: 'default' as const, label: 'Default', desc: 'Balanced spacing' },
  { key: 'comfortable' as const, label: 'Comfortable', desc: 'Spacious layout' },
];

export default function SettingsPage() {
  const { data, isLoading } = usePreferences();
  const patchPrefs = usePatchPreferences();
  const { data: appConfig } = useAppConfig();
  const isPersonal = appConfig?.mode === 'personal';
  const { theme, setTheme, resolved } = useTheme();
  const addToast = useToastStore((s) => s.addToast);
  const { i18n, t } = useTranslation();
  const [customAccent, setCustomAccent] = useState('');
  const [customSidebar, setCustomSidebar] = useState('');

  const prefs = (data?.preferences ?? {}) as Record<string, unknown>;
  const currentLocale = data?.locale ?? 'ko';
  const currentPrimary = prefs.primaryColor as string | undefined;
  const currentSidebar = prefs.sidebarColor as string | undefined;
  const currentDensity = (prefs.density as string) ?? 'default';

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

  const savePref = (key: string, value: unknown) => {
    patchPrefs.mutate({
      preferences: { ...prefs, [key]: value },
    });
  };

  // Accent color
  const applyAccent = (color: string) => {
    document.documentElement.style.setProperty('--color-primary', color);
    document.documentElement.style.setProperty('--color-primary-hover', adjustBrightness(color, -15));
    document.documentElement.style.setProperty('--color-primary-light', adjustBrightness(color, 80));
    savePref('primaryColor', color);
    addToast('success', t('settings.accentUpdated'));
  };

  // Sidebar color
  const applySidebar = (color: string) => {
    document.documentElement.style.setProperty('--color-sidebar-bg', color);
    document.documentElement.style.setProperty('--color-sidebar-hover', adjustBrightness(color, 12));
    document.documentElement.style.setProperty('--color-sidebar-border', adjustBrightness(color, 12));
    savePref('sidebarColor', color);
    addToast('success', t('settings.sidebarUpdated', 'Sidebar color updated'));
  };

  // Density
  const applyDensity = (d: string) => {
    document.documentElement.setAttribute('data-density', d);
    savePref('density', d);
  };

  const sectionStyle = {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)',
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-2xl font-bold mb-8" style={{ color: 'var(--color-text)' }}>
        {t('settings.title')}
      </h1>

      {/* Theme */}
      <section className="p-5 mb-5" style={sectionStyle}>
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
                className="w-full h-10 rounded mb-2"
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
            </button>
          ))}
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
          {t('settings.currentMode', { mode: t(`settings.${resolved}`) })}
        </p>
      </section>

      {/* Accent Color */}
      <section className="p-5 mb-5" style={sectionStyle}>
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text)' }}>
          {t('settings.accentColor')}
        </h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {presetColors.map((c) => (
            <button
              key={c.value}
              onClick={() => applyAccent(c.value)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all"
              style={{
                border: `2px solid ${(currentPrimary ?? '#2563eb') === c.value ? c.value : 'var(--color-border)'}`,
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text)',
              }}
            >
              <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: c.value }} />
              {c.name}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <input
            type="color"
            value={customAccent || currentPrimary || '#2563eb'}
            onChange={(e) => setCustomAccent(e.target.value)}
            className="w-8 h-8 p-0 border rounded cursor-pointer"
          />
          <input
            placeholder="#hex"
            className="text-sm border rounded px-2 py-1 w-24"
            style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            value={customAccent}
            onChange={(e) => setCustomAccent(e.target.value)}
          />
          <Button
            size="sm"
            disabled={!customAccent || !/^#[0-9a-fA-F]{6}$/.test(customAccent)}
            onClick={() => { applyAccent(customAccent); setCustomAccent(''); }}
          >
            {t('settings.apply')}
          </Button>
        </div>
      </section>

      {/* Sidebar Color */}
      <section className="p-5 mb-5" style={sectionStyle}>
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text)' }}>
          {t('settings.sidebarColor', 'Sidebar Color')}
        </h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {sidebarPresets.map((c) => (
            <button
              key={c.value}
              onClick={() => applySidebar(c.value)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all"
              style={{
                border: `2px solid ${(currentSidebar ?? '#111827') === c.value ? 'var(--color-primary)' : 'var(--color-border)'}`,
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text)',
              }}
            >
              <span className="w-4 h-4 rounded flex-shrink-0" style={{ backgroundColor: c.value }} />
              {c.name}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <input
            type="color"
            value={customSidebar || currentSidebar || '#111827'}
            onChange={(e) => setCustomSidebar(e.target.value)}
            className="w-8 h-8 p-0 border rounded cursor-pointer"
          />
          <input
            placeholder="#hex"
            className="text-sm border rounded px-2 py-1 w-24"
            style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            value={customSidebar}
            onChange={(e) => setCustomSidebar(e.target.value)}
          />
          <Button
            size="sm"
            disabled={!customSidebar || !/^#[0-9a-fA-F]{6}$/.test(customSidebar)}
            onClick={() => { applySidebar(customSidebar); setCustomSidebar(''); }}
          >
            {t('settings.apply')}
          </Button>
        </div>
      </section>

      {/* Global Density */}
      <section className="p-5 mb-5" style={sectionStyle}>
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text)' }}>
          {t('settings.density', 'UI Density')}
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {densityOptions.map((d) => (
            <button
              key={d.key}
              onClick={() => applyDensity(d.key)}
              className="p-3 rounded-lg text-left transition-all"
              style={{
                border: `2px solid ${currentDensity === d.key ? 'var(--color-primary)' : 'var(--color-border)'}`,
                backgroundColor: currentDensity === d.key ? 'var(--color-surface-active)' : 'var(--color-surface)',
              }}
            >
              <div className="flex gap-0.5 mb-2">
                {[...Array(d.key === 'compact' ? 5 : d.key === 'default' ? 3 : 2)].map((_, i) => (
                  <div
                    key={i}
                    className="rounded"
                    style={{
                      backgroundColor: 'var(--color-border)',
                      height: d.key === 'compact' ? 4 : d.key === 'default' ? 6 : 8,
                      flex: 1,
                    }}
                  />
                ))}
              </div>
              <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                {t(`settings.density_${d.key}`, d.label)}
              </div>
              <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {t(`settings.density_${d.key}_desc`, d.desc)}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Language */}
      <section className="p-5 mb-5" style={sectionStyle}>
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
      </section>

      {/* About */}
      <section className="p-5" style={sectionStyle}>
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text)' }}>
          {t('settings.about')}
        </h2>
        <div className="text-sm space-y-1" style={{ color: 'var(--color-text-secondary)' }}>
          <p>Taskboard v0.1.0</p>
          {!isPersonal && (
            <p>{t('settings.aboutAd', 'Accounts managed via Active Directory.')}</p>
          )}
          {isPersonal && (
            <p>{t('settings.aboutPersonal', '개인 모드로 실행 중 · 외부 인증 없이 사용됩니다.')}</p>
          )}
        </div>
      </section>
    </div>
  );
}

function adjustBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + Math.round(2.55 * percent)));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + Math.round(2.55 * percent)));
  const b = Math.min(255, Math.max(0, (num & 0xff) + Math.round(2.55 * percent)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

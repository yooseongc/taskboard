import { usePreferences, usePatchPreferences } from '../api/preferences';
import { Spinner } from '../components/Spinner';
import { useToastStore } from '../stores/toastStore';
import Button from '../components/ui/Button';

const themes = [
  { value: 'system', label: 'System', desc: 'Follow OS setting' },
  { value: 'light', label: 'Light', desc: 'Always light' },
  { value: 'dark', label: 'Dark', desc: 'Always dark' },
];

const locales = [
  { value: 'ko', label: 'Korean', flag: 'KR' },
  { value: 'en', label: 'English', flag: 'EN' },
  { value: 'ja', label: 'Japanese', flag: 'JP' },
];

export default function SettingsPage() {
  const { data, isLoading } = usePreferences();
  const patchPrefs = usePatchPreferences();
  const addToast = useToastStore((s) => s.addToast);

  if (isLoading) return <Spinner />;

  const currentTheme = data?.theme ?? 'system';
  const currentLocale = data?.locale ?? 'ko';

  const handleThemeChange = (theme: string) => {
    patchPrefs.mutate(
      { theme },
      {
        onSuccess: () => {
          addToast('success', 'Theme updated');
          applyTheme(theme);
        },
      },
    );
  };

  const handleLocaleChange = (locale: string) => {
    patchPrefs.mutate(
      { locale },
      { onSuccess: () => addToast('success', 'Language updated') },
    );
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-2xl font-bold mb-8">Settings</h1>

      {/* Theme */}
      <section className="bg-white rounded-lg border p-5 mb-6">
        <h2 className="text-sm font-semibold mb-3">Appearance</h2>
        <div className="grid grid-cols-3 gap-3">
          {themes.map((t) => (
            <button
              key={t.value}
              onClick={() => handleThemeChange(t.value)}
              className={`p-3 rounded-lg border-2 text-left transition-all ${
                currentTheme === t.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className={`w-full h-12 rounded mb-2 ${
                t.value === 'dark' ? 'bg-gray-800' :
                t.value === 'light' ? 'bg-white border border-gray-200' :
                'bg-gradient-to-r from-white to-gray-800'
              }`} />
              <div className="text-sm font-medium">{t.label}</div>
              <div className="text-xs text-gray-400">{t.desc}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Language */}
      <section className="bg-white rounded-lg border p-5 mb-6">
        <h2 className="text-sm font-semibold mb-3">Language</h2>
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
        <p className="text-xs text-gray-400 mt-2">
          Language preference is saved. Full i18n support coming soon.
        </p>
      </section>

      {/* Info */}
      <section className="bg-white rounded-lg border p-5">
        <h2 className="text-sm font-semibold mb-3">About</h2>
        <div className="text-sm text-gray-500 space-y-1">
          <p>Taskboard v0.1.0</p>
          <p>Accounts and departments are managed via Active Directory.</p>
        </div>
      </section>
    </div>
  );
}

function applyTheme(theme: string) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else if (theme === 'light') {
    root.classList.remove('dark');
  } else {
    // system
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }
}

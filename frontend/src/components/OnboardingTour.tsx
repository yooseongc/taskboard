import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { usePreferences, usePatchPreferences, type UserPreferences } from '../api/preferences';
import Button from './ui/Button';

const STEP_KEYS = ['step1', 'step2', 'step3', 'step4'] as const;
const STEP_ICONS = ['👋', '📋', '⚡', '⌨️'];
const LOCAL_FLAG = 'taskboard_onboarding_completed';

export default function OnboardingTour() {
  const { data: prefs } = usePreferences();
  const patch = usePatchPreferences();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!prefs) return;
    // Local flag wins — protects against transient prefs refetch cycles
    // (e.g. theme change invalidating the cache before server-side onboarding_completed
    // has been persisted), so the tour never re-opens for the same browser session.
    if (localStorage.getItem(LOCAL_FLAG) === '1') {
      setOpen(false);
      return;
    }
    const completed = (prefs.preferences as Record<string, unknown> | undefined)
      ?.onboarding_completed;
    if (!completed) setOpen(true);
  }, [prefs]);

  if (!open) return null;

  const last = step === STEP_KEYS.length - 1;
  const stepKey = STEP_KEYS[step];

  const finish = () => {
    // Set the local flag immediately so a refetch can't re-open the dialog.
    localStorage.setItem(LOCAL_FLAG, '1');
    // Optimistically mark cache so future reads short-circuit before the network round-trip.
    qc.setQueryData<UserPreferences | undefined>(['preferences'], (prev) =>
      prev
        ? {
            ...prev,
            preferences: {
              ...(prev.preferences ?? {}),
              onboarding_completed: true,
            },
          }
        : prev,
    );
    patch.mutate({
      preferences: {
        ...(prefs?.preferences ?? {}),
        onboarding_completed: true,
      },
    });
    setOpen(false);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-title"
          className="w-full max-w-md flex flex-col text-center p-8"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div className="text-6xl mb-4" aria-hidden="true">{STEP_ICONS[step]}</div>
          <h2
            id="onboarding-title"
            className="text-xl font-bold mb-3"
            style={{ color: 'var(--color-text)' }}
          >
            {t(`onboarding.${stepKey}Title`)}
          </h2>
          <p
            className="text-sm leading-relaxed mb-6"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {t(`onboarding.${stepKey}Desc`)}
          </p>

          {/* Progress dots */}
          <div className="flex justify-center gap-1.5 mb-6">
            {STEP_KEYS.map((_, i) => (
              <span
                key={i}
                className="h-2 rounded-full transition-all"
                style={{
                  backgroundColor: i === step ? 'var(--color-primary)' : 'var(--color-border)',
                  width: i === step ? '1.25rem' : '0.5rem',
                }}
              />
            ))}
          </div>

          <div className="flex gap-2 justify-between">
            <Button variant="ghost" size="sm" onClick={finish}>
              {t('onboarding.skip')}
            </Button>
            <div className="flex gap-2">
              {step > 0 && (
                <Button variant="secondary" size="sm" onClick={() => setStep(step - 1)}>
                  {t('onboarding.prev')}
                </Button>
              )}
              {!last ? (
                <Button size="sm" onClick={() => setStep(step + 1)}>
                  {t('onboarding.next')}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    finish();
                    navigate('/templates');
                  }}
                >
                  {t('onboarding.browseTemplates')}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePreferences, usePatchPreferences } from '../api/preferences';
import Button from './ui/Button';

const steps = [
  {
    title: 'Taskboard에 오신 것을 환영합니다 👋',
    description: '팀의 업무를 한 곳에서 정리하고 추적할 수 있는 협업 도구입니다. 잠깐 안내해드릴게요.',
    illustration: '👋',
  },
  {
    title: '보드로 업무를 시각화하세요',
    description: '보드는 칸반·테이블·캘린더 세 가지 뷰로 같은 데이터를 표시합니다. 팀의 워크플로우에 맞게 컬럼을 구성하세요.',
    illustration: '📋',
  },
  {
    title: '템플릿으로 빠르게 시작하세요',
    description: '스프린트 보드, 버그 트리아지, 휴가 캘린더 등 미리 만들어둔 템플릿이 있습니다. 한 번의 클릭으로 보드를 만들 수 있어요.',
    illustration: '⚡',
  },
  {
    title: 'Ctrl+K로 빠르게 이동하세요',
    description: '어디서나 Ctrl+K(또는 Cmd+K)를 누르면 명령 팔레트가 열립니다. 보드, 사람, 템플릿을 즉시 검색하고 테마도 전환할 수 있어요.',
    illustration: '⌨️',
  },
];

export default function OnboardingTour() {
  const { data: prefs } = usePreferences();
  const patch = usePatchPreferences();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!prefs) return;
    const completed = (prefs.preferences as Record<string, unknown>)?.onboarding_completed;
    if (!completed) setOpen(true);
  }, [prefs]);

  if (!open) return null;

  const last = step === steps.length - 1;
  const current = steps[step];

  const finish = () => {
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
          <div className="text-6xl mb-4" aria-hidden="true">{current.illustration}</div>
          <h2 id="onboarding-title" className="text-xl font-bold mb-3" style={{ color: 'var(--color-text)' }}>
            {current.title}
          </h2>
          <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--color-text-secondary)' }}>
            {current.description}
          </p>

          {/* Progress dots */}
          <div className="flex justify-center gap-1.5 mb-6">
            {steps.map((_, i) => (
              <span
                key={i}
                className="w-2 h-2 rounded-full transition-all"
                style={{
                  backgroundColor: i === step ? 'var(--color-primary)' : 'var(--color-border)',
                  width: i === step ? '1.25rem' : '0.5rem',
                }}
              />
            ))}
          </div>

          <div className="flex gap-2 justify-between">
            <Button variant="ghost" size="sm" onClick={finish}>
              건너뛰기
            </Button>
            <div className="flex gap-2">
              {step > 0 && (
                <Button variant="secondary" size="sm" onClick={() => setStep(step - 1)}>
                  이전
                </Button>
              )}
              {!last ? (
                <Button size="sm" onClick={() => setStep(step + 1)}>
                  다음
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    finish();
                    navigate('/templates');
                  }}
                >
                  템플릿 둘러보기
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

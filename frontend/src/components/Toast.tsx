import { useToastStore } from '../stores/toastStore';

const bgMap = {
  success: 'bg-green-600',
  error: 'bg-red-600',
  info: 'bg-blue-600',
};

const iconMap = {
  success: 'M5 13l4 4L19 7',
  error: 'M12 9v2m0 4h.01M12 5a7 7 0 110 14 7 7 0 010-14z',
  info: 'M13 16h-1v-4h-1m1-4h.01M12 5a7 7 0 110 14 7 7 0 010-14z',
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.type === 'error' ? 'alert' : 'status'}
          className={`${bgMap[t.type]} text-white px-4 py-2.5 rounded-lg shadow-lg text-sm max-w-sm flex items-center gap-2.5`}
        >
          <svg
            className="w-4 h-4 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d={iconMap[t.type]} />
          </svg>
          <span className="flex-1">{t.message}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action!.onClick();
                removeToast(t.id);
              }}
              className="underline text-white/90 hover:text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-white/50 rounded"
            >
              {t.action.label}
            </button>
          )}
          <button
            onClick={() => removeToast(t.id)}
            aria-label="Dismiss notification"
            className="text-white/70 hover:text-white p-0.5 focus:outline-none focus:ring-2 focus:ring-white/50 rounded"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

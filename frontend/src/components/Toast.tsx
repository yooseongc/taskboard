import { useToastStore } from '../stores/toastStore';

const bgMap = {
  success: 'bg-green-600',
  error: 'bg-red-600',
  info: 'bg-blue-600',
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`${bgMap[t.type]} text-white px-4 py-2 rounded-lg shadow-lg text-sm max-w-sm flex items-center gap-2`}
        >
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => removeToast(t.id)}
            className="text-white/70 hover:text-white"
          >
            x
          </button>
        </div>
      ))}
    </div>
  );
}

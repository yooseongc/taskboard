import { create } from 'zustand';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  action?: { label: string; onClick: () => void };
  persistent?: boolean;
}

interface ToastState {
  toasts: ToastMessage[];
  addToast: (
    type: ToastMessage['type'],
    message: string,
    opts?: { action?: ToastMessage['action']; persistent?: boolean },
  ) => void;
  removeToast: (id: string) => void;
}

let nextId = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (type, message, opts) => {
    const id = String(++nextId);
    const persistent = opts?.persistent ?? type === 'error';
    set((s) => ({
      toasts: [...s.toasts, { id, type, message, action: opts?.action, persistent }],
    }));
    if (!persistent) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }, 4000);
    }
  },
  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

import { create } from 'zustand';
import type { WhoamiResponse } from '../types/api';
import { getToken, setToken, clearToken } from '../auth';
import { clearRefreshToken } from '../auth/refresh';
import {
  forgetDevEmail,
  startSessionScheduler,
  stopSessionScheduler,
} from '../auth/scheduler';
import i18n from '../i18n';
import { useToastStore } from './toastStore';

interface AuthState {
  user: WhoamiResponse | null;
  isAuthenticated: boolean;
  setUser: (user: WhoamiResponse | null) => void;
  login: (token: string) => void;
  logout: () => void;
  /** Called by the proactive session scheduler when every refresh path has
   *  been exhausted. Mirrors `logout` but surfaces a toast so the
   *  redirect doesn't look like a random error. */
  expireSession: () => void;
  /** Re-arm the proactive scheduler after a page reload — AuthGuard calls
   *  this once on boot when we already have a token from localStorage. */
  rearmScheduler: () => void;
}

// The scheduler is wired lazily so stores don't import each other at
// module-load time. `armScheduler` below closes over `set` via the
// store instance.
export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: !!getToken(),
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  login: (token) => {
    setToken(token);
    set({ isAuthenticated: true });
    armScheduler(() => get().expireSession());
  },
  logout: () => {
    stopSessionScheduler();
    forgetDevEmail();
    clearToken();
    clearRefreshToken();
    set({ user: null, isAuthenticated: false });
  },
  expireSession: () => {
    stopSessionScheduler();
    forgetDevEmail();
    clearToken();
    clearRefreshToken();
    set({ user: null, isAuthenticated: false });
    useToastStore.getState().addToast('info', i18n.t('auth.sessionExpired'));
  },
  rearmScheduler: () => {
    if (getToken()) armScheduler(() => get().expireSession());
  },
}));

function armScheduler(onFail: () => void) {
  startSessionScheduler(onFail);
}

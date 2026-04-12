import { create } from 'zustand';
import type { WhoamiResponse } from '../types/api';
import { getToken, setToken, clearToken } from '../auth';

interface AuthState {
  user: WhoamiResponse | null;
  isAuthenticated: boolean;
  setUser: (user: WhoamiResponse | null) => void;
  login: (token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: !!getToken(),
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  login: (token) => {
    setToken(token);
    set({ isAuthenticated: true });
  },
  logout: () => {
    clearToken();
    set({ user: null, isAuthenticated: false });
  },
}));

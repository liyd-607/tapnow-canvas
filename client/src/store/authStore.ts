import { create } from 'zustand';
import type { User } from '../types';
import { authApi } from '../api/auth';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (phone: string, code: string) => Promise<void>;
  sendCode: (phone: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  setTapies: (tapies: number) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: localStorage.getItem('accessToken'),
  isLoading: false,

  sendCode: async (phone: string) => {
    await authApi.sendCode(phone);
  },

  login: async (phone: string, code: string) => {
    set({ isLoading: true });
    try {
      const res = await authApi.login(phone, code);
      localStorage.setItem('accessToken', res.accessToken);
      localStorage.setItem('user', JSON.stringify(res.user));
      set({ user: res.user, accessToken: res.accessToken, isLoading: false });
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },

  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    set({ user: null, accessToken: null });
  },

  fetchMe: async () => {
    try {
      const user = await authApi.me();
      localStorage.setItem('user', JSON.stringify(user));
      set({ user });
    } catch (e) {
      get().logout();
      throw e;
    }
  },

  setTapies: (tapies: number) => {
    set((state) => ({ user: state.user ? { ...state.user, tapies } : state.user }));
  },
}));

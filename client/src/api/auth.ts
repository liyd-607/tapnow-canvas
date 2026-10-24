import { apiClient } from './client';
import type { User } from '../types';

export interface LoginResponse {
  accessToken: string;
  user: User;
}

export const authApi = {
  sendCode: (phone: string) =>
    apiClient.post('/auth/send-code', { phone }).then((r) => r.data),

  login: (phone: string, code: string): Promise<LoginResponse> =>
    apiClient.post('/auth/login', { phone, code }).then((r) => r.data),

  me: (): Promise<User> =>
    apiClient.get('/auth/me').then((r) => r.data),
};

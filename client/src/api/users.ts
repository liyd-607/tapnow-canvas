import { apiClient } from './client';
import type { User } from '../types';

export const usersApi = {
  getProfile: (): Promise<User> =>
    apiClient.get('/users/profile').then((r) => r.data),

  updateProfile: (data: { nickname?: string; avatar?: string }): Promise<User> =>
    apiClient.patch('/users/profile', data).then((r) => r.data),
};

import { apiClient } from './client';
import type { Skill, PaginatedResponse } from '../types';

export const skillsApi = {
  list: (category?: string, type?: string, page = 1, pageSize = 20): Promise<PaginatedResponse<Skill>> =>
    apiClient.get('/skills', { params: { category, type, page, pageSize } }).then((r) => r.data),

  detail: (id: string): Promise<Skill> =>
    apiClient.get(`/skills/${id}`).then((r) => r.data),

  create: (dto: any): Promise<Skill> =>
    apiClient.post('/skills', dto).then((r) => r.data),

  seed: () =>
    apiClient.post('/skills/seed').then((r) => r.data),

  execute: (id: string, canvasId: string) =>
    apiClient.post(`/skills/${id}/execute`, { canvasId }).then((r) => r.data),
};

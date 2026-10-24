import { apiClient } from './client';

export interface AIModel {
  id: string;
  name: string;
  type: 'IMAGE' | 'VIDEO' | 'TEXT';
  modelKey: string;
  creditCost: number;
  enabled: boolean;
  config?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export const modelApi = {
  list: (): Promise<AIModel[]> =>
    apiClient.get('/models').then((r) => r.data),

  get: (id: string): Promise<AIModel> =>
    apiClient.get(`/models/${id}`).then((r) => r.data),

  create: (dto: Omit<AIModel, 'id' | 'createdAt' | 'updatedAt'>): Promise<AIModel> =>
    apiClient.post('/models', dto).then((r) => r.data),

  update: (id: string, dto: Partial<AIModel>): Promise<AIModel> =>
    apiClient.put(`/models/${id}`, dto).then((r) => r.data),

  remove: (id: string) =>
    apiClient.delete(`/models/${id}`).then((r) => r.data),

  toggle: (id: string): Promise<AIModel> =>
    apiClient.post(`/models/${id}/toggle`).then((r) => r.data),

  seed: (): Promise<AIModel[]> =>
    apiClient.post('/models/seed').then((r) => r.data),
};

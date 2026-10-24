import { apiClient } from './client';
import type { AgentTask, PaginatedResponse } from '../types';

export const agentApi = {
  create: (vision: string): Promise<AgentTask> =>
    apiClient.post('/agent/tasks', { vision }).then((r) => r.data),

  list: (page = 1, pageSize = 20): Promise<PaginatedResponse<AgentTask>> =>
    apiClient.get('/agent/tasks', { params: { page, pageSize } }).then((r) => r.data),

  detail: (id: string): Promise<AgentTask> =>
    apiClient.get(`/agent/tasks/${id}`).then((r) => r.data),
};

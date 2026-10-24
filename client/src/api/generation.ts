import { apiClient } from './client';
import type { GenerationTask, AIModel, PaginatedResponse } from '../types';

export interface CreateGenerationDto {
  model: string;
  prompt: string;
  size?: string;
  style?: string;
  count?: number;
}

/**
 * 归一化任务数据：后端返回的 status 是大写枚举（COMPLETED/PENDING 等），
 * 前端类型定义为小写，这里统一转换以保持一致。
 */
function normalizeTask(task: any): GenerationTask {
  return {
    ...task,
    status: (task.status?.toLowerCase() || 'pending') as GenerationTask['status'],
  };
}

function normalizeList(res: any): PaginatedResponse<GenerationTask> {
  return {
    ...res,
    list: (res.list || []).map(normalizeTask),
  };
}

export const generationApi = {
  listModels: (): Promise<AIModel[]> =>
    apiClient.get('/generations/models').then((r) => r.data),

  create: (dto: CreateGenerationDto): Promise<GenerationTask> =>
    apiClient.post('/generations', dto).then((r) => normalizeTask(r.data)),

  list: (page = 1, pageSize = 20): Promise<PaginatedResponse<GenerationTask>> =>
    apiClient.get('/generations', { params: { page, pageSize } }).then((r) => normalizeList(r.data)),

  detail: (id: string): Promise<GenerationTask> =>
    apiClient.get(`/generations/${id}`).then((r) => normalizeTask(r.data)),
};

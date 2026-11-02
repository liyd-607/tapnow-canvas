import { apiClient, newRequestId } from './client';
import type { GenerationTask, AIModel, PaginatedResponse } from '../types';

export interface CreateGenerationDto {
  model: string;
  prompt: string;
  size?: string;
  style?: string;
  count?: number;
  /**
   * 客户端幂等键（对标即梦 generate_id）。
   * 断网重试 / 用户连点时复用同一个 key，服务端会返回同一个任务，
   * 不会重复扣费、不会重复生成。
   */
  clientRequestId?: string;
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

  /**
   * 创建生成任务
   * 不传 clientRequestId 时自动生成一个（同一调用方重试应复用同一个 key）
   */
  create: (dto: CreateGenerationDto): Promise<GenerationTask> =>
    apiClient
      .post('/generations', { clientRequestId: newRequestId(), ...dto })
      .then((r) => normalizeTask(r.data)),

  list: (page = 1, pageSize = 20): Promise<PaginatedResponse<GenerationTask>> =>
    apiClient.get('/generations', { params: { page, pageSize } }).then((r) => normalizeList(r.data)),

  detail: (id: string): Promise<GenerationTask> =>
    apiClient.get(`/generations/${id}`).then((r) => normalizeTask(r.data)),

  /** 取消任务（对标即梦 cancel_generate） */
  cancel: (id: string): Promise<GenerationTask> =>
    apiClient.post(`/generations/${id}/cancel`).then((r) => normalizeTask(r.data)),

  /** 对账：把丢失的任务重新入队（对标即梦 reconcileBySubmitId） */
  reconcile: (): Promise<{ scanned: number; requeued: string[] }> =>
    apiClient.post('/generations/reconcile').then((r) => r.data),
};

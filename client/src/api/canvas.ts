import { apiClient } from './client';
import type { Canvas, PaginatedResponse } from '../types';
import type { CanvasGraph } from './canvas-graph';

export interface CreateCanvasDto {
  name?: string;
  description?: string;
  width?: number;
  height?: number;
  thumbnail?: string;
  settings?: Record<string, any>;
  layers?: any[];
}

export const canvasApi = {
  create: (dto: CreateCanvasDto): Promise<Canvas> =>
    apiClient.post('/canvas', dto).then((r) => r.data),

  list: (page = 1, pageSize = 20): Promise<PaginatedResponse<Canvas>> =>
    apiClient.get('/canvas', { params: { page, pageSize } }).then((r) => r.data),

  detail: (id: string): Promise<Canvas> =>
    apiClient.get(`/canvas/${id}`).then((r) => r.data),

  update: (id: string, dto: CreateCanvasDto): Promise<Canvas> =>
    apiClient.put(`/canvas/${id}`, dto).then((r) => r.data),

  remove: (id: string) =>
    apiClient.delete(`/canvas/${id}`).then((r) => r.data),

  updateLayers: (id: string, layers: any[]): Promise<Canvas> =>
    apiClient.put(`/canvas/${id}/layers`, { layers }).then((r) => r.data),

  updateSettings: (id: string, settings: Record<string, any>): Promise<Canvas> =>
    apiClient.put(`/canvas/${id}/settings`, settings).then((r) => r.data),

  // ----- 统一画布图模型 -----
  getGraph: (id: string): Promise<CanvasGraph> =>
    apiClient.get(`/canvas/${id}/graph`).then((r) => r.data),

  updateGraph: (id: string, graph: CanvasGraph): Promise<CanvasGraph> =>
    apiClient.put(`/canvas/${id}/graph`, graph).then((r) => r.data),

  generateNode: (id: string, nodeId: string) =>
    apiClient.post(`/canvas/${id}/nodes/${nodeId}/generate`).then((r) => r.data),

  runGraph: (id: string, body: { nodeIds?: string[]; force?: boolean } = {}) =>
    apiClient.post(`/canvas/${id}/run`, body).then((r) => r.data),
};

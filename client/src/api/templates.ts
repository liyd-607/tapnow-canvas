import { apiClient } from './client';
import type { CanvasGraph } from './canvas-graph';

export interface Template {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  thumbnail?: string | null;
  graph: CanvasGraph;
  tags: string[];
  usageCount: number;
  createdAt: string;
}

export const templatesApi = {
  list: (category?: string, keyword?: string): Promise<Template[]> =>
    apiClient.get('/templates', { params: { category, keyword } }).then((r) => r.data),

  detail: (id: string): Promise<Template> =>
    apiClient.get(`/templates/${id}`).then((r) => r.data),

  instantiate: (id: string): Promise<{ id: string }> =>
    apiClient.post(`/templates/${id}/instantiate`).then((r) => r.data),

  createFromCanvas: (
    canvasId: string,
    body: { name?: string; description?: string; category?: string; tags?: string[] },
  ): Promise<Template> =>
    apiClient.post(`/templates/from-canvas/${canvasId}`, body).then((r) => r.data),

  remove: (id: string) =>
    apiClient.delete(`/templates/${id}`).then((r) => r.data),
};

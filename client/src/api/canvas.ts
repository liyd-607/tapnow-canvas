import { apiClient, newRequestId } from './client';
import type { Canvas, PaginatedResponse } from '../types';
import type { CanvasGraph, CanvasGraphNode, CanvasGraphEdge } from './canvas-graph';

/** 画布增量操作（对标即梦 changeset） */
export type CanvasOp =
  | { op: 'node.upsert'; node: CanvasGraphNode }
  | { op: 'node.remove'; id: string }
  | { op: 'edge.upsert'; edge: CanvasGraphEdge }
  | { op: 'edge.remove'; id: string };

export interface CanvasChange {
  id: string;
  canvasId: string;
  seq: number;
  actorId?: string | null;
  baseVersion: number;
  ops: CanvasOp[];
  createdAt: string;
}

export interface CanvasChangesResponse {
  changes: CanvasChange[];
  version: number;
  latestSeq: number;
  hasMore: boolean;
}

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

  /**
   * 获取画布图全量快照（含 version 版本号，用于乐观锁）
   */
  getGraph: (id: string): Promise<CanvasGraph> =>
    apiClient.get(`/canvas/${id}/graph`).then((r) => r.data),

  /**
   * 保存画布图（带乐观锁）
   *
   * 传入 baseVersion 后，若服务端版本已变化会返回 409，
   * 错误体中带 serverVersion / serverGraph，可据此提示用户刷新。
   */
  updateGraph: (id: string, graph: CanvasGraph, baseVersion?: number): Promise<CanvasGraph> =>
    apiClient
      .put(`/canvas/${id}/graph`, { graph, baseVersion })
      .then((r) => r.data),

  /**
   * 拉取增量变更集（对标即梦 fetch_changeset）
   */
  getChanges: (id: string, since = 0): Promise<CanvasChangesResponse> =>
    apiClient.get(`/canvas/${id}/changes`, { params: { since } }).then((r) => r.data),

  /**
   * 提交增量变更集（对标即梦 submit_changeset）
   */
  submitChanges: (
    id: string,
    ops: CanvasOp[],
    baseVersion?: number,
  ): Promise<{ graph: CanvasGraph; version: number; applied: number }> =>
    apiClient.post(`/canvas/${id}/changes`, { ops, baseVersion }).then((r) => r.data),

  /**
   * 生成节点（支持幂等键，避免连点重复生成）
   */
  generateNode: (id: string, nodeId: string, clientRequestId?: string) =>
    apiClient
      .post(`/canvas/${id}/nodes/${nodeId}/generate`, {
        clientRequestId: clientRequestId ?? newRequestId(),
      })
      .then((r) => r.data),

  runGraph: (id: string, body: { nodeIds?: string[]; force?: boolean } = {}) =>
    apiClient.post(`/canvas/${id}/run`, body).then((r) => r.data),
};

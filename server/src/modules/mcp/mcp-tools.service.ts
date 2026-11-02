import { Injectable, Logger } from '@nestjs/common';
import { CanvasService } from '../canvas/canvas.service';
import { AiService } from '../ai/ai.service';
import {
  CanvasGraph,
  CanvasGraphEdge,
  CanvasGraphNode,
  CanvasNodeType,
} from '../canvas/canvas-graph.types';

/**
 * MCP 工具的业务实现层。
 *
 * 职责：只做业务，不碰 MCP 协议类型 —— 这样每个工具都能被单测，
 * MCP 层只负责把返回值包成 content。
 *
 * 写操作统一「读图 → 改内存 → 带 baseVersion 写回」，
 * 复用 CanvasService 既有的乐观锁（409 语义），不做整图盲写。
 */

export interface McpToolResult {
  ok: boolean;
  [key: string]: any;
}

const DEFAULT_WIDTH: Record<string, number> = {
  group: 400,
  image: 340,
  video: 340,
  editor: 340,
  text: 340,
  media: 340,
};

const DEFAULT_HEIGHT: Record<string, number> = {
  image: 480,
  video: 460,
  editor: 380,
  text: 300,
  media: 300,
  group: 200,
};

const DEFAULT_TITLE: Record<string, string> = {
  image: '图片生成',
  video: '视频生成',
  editor: '图片编辑器',
  text: '文本',
  media: '音频生成',
  group: '分组',
};

const DEFAULT_MODEL: Record<string, string> = {
  image: 'minimax-image',
  video: 'minimax-video',
};

@Injectable()
export class McpToolsService {
  private readonly logger = new Logger(McpToolsService.name);
  private idSeq = 0;

  constructor(
    private readonly canvasService: CanvasService,
    private readonly aiService: AiService,
  ) {}

  // ---------------------------------------------------------------- 工具实现

  async listCanvases(
    userId: string,
    page = 1,
    pageSize = 20,
  ): Promise<McpToolResult> {
    const r = await this.canvasService.list(userId, page, pageSize);
    const canvases = (r.list as any[]).map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description ?? null,
      width: c.width,
      height: c.height,
      updatedAt: c.updatedAt,
      nodeCount: ((c.settings?.graph?.nodes ?? []) as any[]).length,
    }));
    return { ok: true, total: r.total, page: r.page, pageSize: r.pageSize, canvases };
  }

  async getCanvas(userId: string, canvasId: string): Promise<McpToolResult> {
    const canvas: any = await this.canvasService.detail(userId, canvasId);
    const graph = await this.canvasService.getGraph(userId, canvasId);
    return {
      ok: true,
      canvas: {
        id: canvas.id,
        name: canvas.name,
        description: canvas.description ?? null,
        width: canvas.width,
        height: canvas.height,
        graphVersion: canvas.graphVersion ?? 0,
        updatedAt: canvas.updatedAt,
      },
      nodes: graph.nodes.map((n) => this.summarizeNode(n)),
      edges: graph.edges,
    };
  }

  async createCanvas(
    userId: string,
    name: string,
    width = 1024,
    height = 1024,
  ): Promise<McpToolResult> {
    const c: any = await this.canvasService.create(userId, { name, width, height });
    return { ok: true, id: c.id, name: c.name };
  }

  async createNode(
    userId: string,
    canvasId: string,
    input: {
      type: CanvasNodeType;
      title?: string;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      model?: string;
      prompt?: string;
      aspectRatio?: string;
      count?: number;
    },
  ): Promise<McpToolResult> {
    const type = input.type ?? 'image';
    const node: CanvasGraphNode = {
      id: this.nextNodeId(),
      type,
      x: input.x ?? 100,
      y: input.y ?? 100,
      width: input.width ?? DEFAULT_WIDTH[type] ?? 340,
      height: input.height ?? DEFAULT_HEIGHT[type] ?? 380,
      zIndex: type === 'group' ? 0 : 1,
      locked: false,
      visible: true,
      title: input.title ?? DEFAULT_TITLE[type] ?? '节点',
      versions: [],
      status: 'idle',
      collapsed: false,
    };

    if (type === 'image' || type === 'video') {
      node.gen = {
        model: input.model ?? DEFAULT_MODEL[type] ?? 'minimax-image',
        prompt: input.prompt ?? '',
        count: input.count ?? 1,
        ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
      };
    }

    return this.mutateGraph(userId, canvasId, (graph) => {
      graph.nodes.push(node);
      return {
        changed: true,
        summary: { action: 'created', node: this.summarizeNode(node) },
      };
    });
  }

  async updateNode(
    userId: string,
    canvasId: string,
    nodeId: string,
    patch: {
      title?: string;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      model?: string;
      prompt?: string;
      aspectRatio?: string;
      count?: number;
      status?: 'idle' | 'generating' | 'completed' | 'failed';
    },
  ): Promise<McpToolResult> {
    return this.mutateGraph(userId, canvasId, (graph) => {
      const node = graph.nodes.find((n) => n.id === nodeId);
      if (!node) return { changed: false, error: `节点不存在：${nodeId}` };

      if (patch.title !== undefined) node.title = patch.title;
      if (patch.x !== undefined) node.x = patch.x;
      if (patch.y !== undefined) node.y = patch.y;
      if (patch.width !== undefined) node.width = patch.width;
      if (patch.height !== undefined) node.height = patch.height;
      if (patch.status !== undefined) node.status = patch.status;

      if (
        patch.model !== undefined ||
        patch.prompt !== undefined ||
        patch.aspectRatio !== undefined ||
        patch.count !== undefined
      ) {
        const prev = node.gen ?? ({} as any);
        node.gen = {
          ...prev,
          model: patch.model ?? prev.model ?? 'minimax-image',
          prompt: patch.prompt ?? prev.prompt ?? '',
          count: patch.count ?? prev.count ?? 1,
          ...(patch.aspectRatio ?? prev.aspectRatio
            ? { aspectRatio: patch.aspectRatio ?? prev.aspectRatio }
            : {}),
        } as any;
      }
      return {
        changed: true,
        summary: { action: 'updated', node: this.summarizeNode(node) },
      };
    });
  }

  async deleteNode(userId: string, canvasId: string, nodeId: string): Promise<McpToolResult> {
    return this.mutateGraph(userId, canvasId, (graph) => {
      const idx = graph.nodes.findIndex((n) => n.id === nodeId);
      if (idx < 0) return { changed: false, error: `节点不存在：${nodeId}` };
      const before = graph.edges.length;
      graph.nodes.splice(idx, 1);
      // 连带清掉挂在这个节点上的边，避免留下悬空引用
      graph.edges = graph.edges.filter((e) => e.from !== nodeId && e.to !== nodeId);
      return {
        changed: true,
        summary: { deleted: nodeId, removedEdges: before - graph.edges.length },
      };
    });
  }

  async connectNodes(
    userId: string,
    canvasId: string,
    from: string,
    to: string,
    role?: 'subject' | 'image' | 'firstFrame' | 'lastFrame',
  ): Promise<McpToolResult> {
    return this.mutateGraph(userId, canvasId, (graph) => {
      if (!graph.nodes.some((n) => n.id === from)) {
        return { changed: false, error: `起点节点不存在：${from}` };
      }
      if (!graph.nodes.some((n) => n.id === to)) {
        return { changed: false, error: `终点节点不存在：${to}` };
      }
      const exists = graph.edges.some((e) => e.from === from && e.to === to);
      if (exists) {
        return { changed: false, summary: { edge: { from, to }, note: '连线已存在' } };
      }
      const edge: CanvasGraphEdge = {
        id: this.nextEdgeId(),
        from,
        to,
        ...(role ? { role } : {}),
      };
      graph.edges.push(edge);
      return { changed: true, summary: { edge } };
    });
  }

  async disconnectNodes(
    userId: string,
    canvasId: string,
    from: string,
    to: string,
  ): Promise<McpToolResult> {
    return this.mutateGraph(userId, canvasId, (graph) => {
      const before = graph.edges.length;
      graph.edges = graph.edges.filter((e) => !(e.from === from && e.to === to));
      const removed = before - graph.edges.length;
      if (!removed) return { changed: false, error: `连线不存在：${from} → ${to}` };
      return { changed: true, summary: { removed } };
    });
  }

  async generateNode(userId: string, canvasId: string, nodeId: string): Promise<McpToolResult> {
    const graph: any = await this.canvasService.generateNode(userId, canvasId, nodeId);
    const node = graph.nodes?.find((n: any) => n.id === nodeId);
    return {
      ok: true,
      node: node ? this.summarizeNode(node) : null,
      resultUrl: node?.resultUrl ?? null,
      status: node?.status ?? 'unknown',
      error: node?.error ?? null,
    };
  }

  async runGraph(
    userId: string,
    canvasId: string,
    nodeIds?: string[],
    force = false,
  ): Promise<McpToolResult> {
    const r: any = await this.canvasService.runGraph(userId, canvasId, nodeIds, { force });
    const nodes = (r.graph?.nodes ?? []).map((n: CanvasGraphNode) => this.summarizeNode(n));
    return {
      ok: true,
      executed: r.executed,
      completed: nodes.filter((n: any) => n.status === 'completed').length,
      failed: nodes.filter((n: any) => n.status === 'failed').length,
      nodes,
    };
  }

  listModels(): McpToolResult {
    return { ok: true, models: this.aiService.listModels() };
  }

  // ---------------------------------------------------------------- 内部

  /**
   * 读图 → 改 → 带乐观锁写回。冲突（409）时重读重试一次。
   */
  private async mutateGraph(
    userId: string,
    canvasId: string,
    fn: (graph: CanvasGraph) => { changed: boolean; error?: string; summary?: any },
  ): Promise<McpToolResult> {
    let lastError: any = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const graph = await this.canvasService.getGraph(userId, canvasId);
      const r = fn(graph);
      if (!r.changed) {
        if (r.error) return { ok: false, error: r.error };
        return { ok: true, changed: false, ...(r.summary ?? {}) };
      }
      try {
        const saved = await this.canvasService.updateGraph(
          userId,
          canvasId,
          graph,
          graph.version,
        );
        return {
          ok: true,
          changed: true,
          version: (saved as any).version,
          ...(r.summary ?? {}),
        };
      } catch (e: any) {
        lastError = e;
        // 只有乐观锁冲突才重试；其余错误直接上抛
        if (e?.status !== 409 && e?.response?.statusCode !== 409) throw e;
        this.logger.warn(`画布 ${canvasId} 版本冲突，重读后重试（第 ${attempt + 1} 次）`);
      }
    }
    throw lastError;
  }

  private summarizeNode(n: CanvasGraphNode) {
    return {
      id: n.id,
      type: n.type,
      title: n.title ?? '',
      status: n.status,
      resultUrl: n.resultUrl ?? null,
      model: n.gen?.model ?? null,
      prompt: (n.gen?.prompt ?? '').slice(0, 300),
      promptLength: (n.gen?.prompt ?? '').length,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
      groupId: n.groupId ?? null,
      error: n.error ?? null,
    };
  }

  /** 与前端 nextId 保持同一种 id 形态：n_<base36时间戳>_<序号> */
  private nextNodeId(): string {
    return `n_${Date.now().toString(36)}_${this.idSeq++}`;
  }

  private nextEdgeId(): string {
    return `e_${Date.now().toString(36)}_${this.idSeq++}`;
  }
}

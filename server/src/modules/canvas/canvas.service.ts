import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { CreditsService } from '../credits/credits.service';
import { ResultPersistenceService } from '../../common/persistence/result-persistence.service';
import {
  CanvasGraph,
  CanvasGraphNode,
  CanvasLibtvBinding,
  CanvasNodeLibtv,
  CanvasNodeVersion,
  CanvasOp,
  applyOps,
  diffGraph,
  resolveReferences,
  topoOrder,
} from './canvas-graph.types';
import { randomUUID } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export interface CreateCanvasDto {
  name: string;
  description?: string;
  width?: number;
  height?: number;
  thumbnail?: string;
  settings?: Record<string, any>;
  layers?: any[];
}

export interface UpdateCanvasDto {
  name?: string;
  description?: string;
  width?: number;
  height?: number;
  thumbnail?: string;
  settings?: Record<string, any>;
  layers?: any[];
}

@Injectable()
export class CanvasService {
  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
    private creditsService: CreditsService,
    private persistence: ResultPersistenceService,
  ) {}

  // ---------- 统一画布图模型（存于 Canvas.settings.graph） ----------

  private emptyGraph(): CanvasGraph {
    return { nodes: [], edges: [] };
  }

  async getGraph(userId: string, canvasId: string): Promise<CanvasGraph> {
    const canvas = await this.detail(userId, canvasId);
    return this.graphWithVersion(canvas);
  }

  /**
   * 编排器用的画布图读取：除图本身外，额外投影出 LibTV 绑定状态。
   *
   * 绑定数据的权威存放位置是 Canvas.settings.libtv（与 settings.graph 并列），
   * 这里只是投影一份给调用方，不会把绑定写进 settings.graph。
   */
  async getGraphWithBinding(
    userId: string,
    canvasId: string,
  ): Promise<CanvasGraph & { libtv: CanvasLibtvBinding | null }> {
    const canvas = await this.detail(userId, canvasId);
    const graph = this.graphWithVersion(canvas);
    const settings = (canvas.settings || {}) as Record<string, any>;
    return { ...graph, libtv: (settings.libtv as CanvasLibtvBinding) ?? null };
  }

  /** 读取画布的 LibTV 绑定（不存在时返回 null） */
  async getLibtvBinding(userId: string, canvasId: string): Promise<CanvasLibtvBinding | null> {
    const canvas = await this.detail(userId, canvasId);
    const settings = (canvas.settings || {}) as Record<string, any>;
    return (settings.libtv as CanvasLibtvBinding) ?? null;
  }

  /**
   * 取画布全量快照 + 版本号（对标即梦 infinite_canvas fetch_snapshot）
   */
  private graphWithVersion(canvas: any): CanvasGraph {
    const settings = (canvas.settings || {}) as any;
    const graph = settings.graph as CanvasGraph | undefined;
    const base =
      graph && Array.isArray(graph.nodes) && Array.isArray(graph.edges)
        ? { nodes: graph.nodes, edges: graph.edges }
        : this.emptyGraph();
    return { ...base, version: canvas.graphVersion ?? 0 };
  }

  /**
   * 保存画布图：写全量快照 + 落一条增量变更集 + 递增 graphVersion
   *
   * 变更集（changeset）是即梦 infinite_canvas 协同模型的核心：
   * 全量快照是权威副本，变更集用于增量下发 / 断线续传 / 多端协同。
   */
  private async saveGraph(
    userId: string,
    canvasId: string,
    graph: CanvasGraph,
    opts: { actorId?: string; baseVersion?: number; ops?: CanvasOp[] } = {},
  ): Promise<{ version: number; ops: CanvasOp[] }> {
    const canvas = await this.detail(userId, canvasId);
    const settings = (canvas.settings || {}) as Record<string, any>;
    const previous = (settings.graph as CanvasGraph) || this.emptyGraph();

    // 剥离仅用于传输的字段：
    //  - version：服务端维护的乐观锁基线
    //  - libtv：绑定投影，权威位置是 settings.libtv，不能落进 settings.graph 形成两份副本
    const { version: _ignored, libtv: _ignoredBinding, ...clean } = graph as any;

    const ops = opts.ops && opts.ops.length ? opts.ops : diffGraph(previous, clean);
    const newVersion = (canvas.graphVersion ?? 0) + 1;

    await this.prisma.canvas.update({
      where: { id: canvasId },
      data: {
        settings: { ...settings, graph: clean } as any,
        graphVersion: newVersion,
      },
    });

    if (ops.length) {
      await this.prisma.canvasChange.create({
        data: {
          canvasId,
          seq: newVersion,
          actorId: opts.actorId ?? userId,
          baseVersion: opts.baseVersion ?? canvas.graphVersion ?? 0,
          ops: ops as any,
        },
      });
    }

    return { version: newVersion, ops };
  }

  /**
   * 画布图冲突（乐观锁）
   */
  private buildConflict(canvas: any) {
    return new ConflictException({
      statusCode: 409,
      message: '画布已被更新，请刷新后重试',
      serverVersion: canvas.graphVersion ?? 0,
      serverGraph: this.graphWithVersion(canvas),
    });
  }

  /**
   * 把某个资产作为参考插入到指定节点：
   * 在图中记录一条"资产引用"（存在 node.references 无法承载外部 URL，
   * 因此以资产 URL 生成一个隐藏的来源节点并连边）。
   */
  async attachAsset(
    userId: string,
    canvasId: string,
    nodeId: string,
    asset: { id: string; url: string; type: string; name?: string },
  ) {
    const graph = await this.getGraph(userId, canvasId);
    const target = graph.nodes.find((n) => n.id === nodeId);
    if (!target) throw new NotFoundException('节点不存在');

    // 资产来源节点（若同一资产已存在则复用）
    let source = graph.nodes.find((n) => n.id === `asset_${asset.id}`);
    if (!source) {
      source = {
        id: `asset_${asset.id}`,
        type: 'image',
        x: target.x - 380,
        y: target.y,
        width: 300,
        height: 320,
        zIndex: graph.nodes.length + 1,
        locked: true,
        visible: true,
        title: asset.name || `资产·${asset.type}`,
        resultUrl: asset.url,
        status: 'completed',
        versions: [],
      };
      graph.nodes.push(source);
    }

    const role = target.type === 'video' ? 'firstFrame' : asset.type === 'STYLE' ? 'image' : 'subject';

    if (!graph.edges.some((e) => e.from === source!.id && e.to === nodeId)) {
      graph.edges.push({ id: randomUUID(), from: source.id, to: nodeId, role });
    }

    await this.saveGraph(userId, canvasId, graph);
    return graph;
  }

  /**
   * 全量保存画布图（带乐观锁）
   *
   * `baseVersion` 与服务端当前 graphVersion 不一致时返回 409，
   * 并附带 serverVersion / serverGraph，前端可据此提示并重载。
   */
  async updateGraph(
    userId: string,
    canvasId: string,
    graph: CanvasGraph,
    baseVersion?: number,
  ) {
    const canvas = await this.detail(userId, canvasId);
    if (baseVersion !== undefined && baseVersion !== null && baseVersion !== (canvas.graphVersion ?? 0)) {
      throw this.buildConflict(canvas);
    }
    const res = await this.saveGraph(userId, canvasId, graph, { baseVersion });
    return { ...graph, version: res.version };
  }

  /**
   * 提交增量变更（对标即梦 submit_changeset）
   *
   * POST /api/canvas/:id/changes
   * body: { baseVersion?, ops: CanvasOp[] }
   */
  async submitChanges(
    userId: string,
    canvasId: string,
    ops: CanvasOp[],
    baseVersion?: number,
  ) {
    const canvas = await this.detail(userId, canvasId);
    if (!Array.isArray(ops) || ops.length === 0) {
      throw new BadRequestException('变更集不能为空');
    }
    if (baseVersion !== undefined && baseVersion !== null && baseVersion !== (canvas.graphVersion ?? 0)) {
      throw this.buildConflict(canvas);
    }

    const current = this.graphWithVersion(canvas);
    const next = applyOps(current, ops);
    const res = await this.saveGraph(userId, canvasId, next, {
      baseVersion,
      ops,
      actorId: userId,
    });

    return {
      graph: { ...next, version: res.version },
      version: res.version,
      applied: ops.length,
    };
  }

  /**
   * 拉取增量变更（对标即梦 fetch_changeset）
   *
   * GET /api/canvas/:id/changes?since=seq
   */
  async getChanges(userId: string, canvasId: string, since = 0) {
    const canvas = await this.detail(userId, canvasId);
    const changes = await this.prisma.canvasChange.findMany({
      where: { canvasId, seq: { gt: since } },
      orderBy: { seq: 'asc' },
      take: 500,
    });
    const latestSeq = changes.length ? changes[changes.length - 1].seq : since;
    return {
      changes,
      version: canvas.graphVersion ?? 0,
      latestSeq,
      hasMore: latestSeq < (canvas.graphVersion ?? 0),
    };
  }

  /**
   * 把引用地址转换为外部模型可访问的形式：
   *  - http(s) 公网地址、data: URI 原样返回；
   *  - 本机 /media 地址读取文件并转 base64 data URI（模型无法访问 localhost）。
   */
  private async toModelAccessibleUrl(url: string): Promise<string> {
    if (url.startsWith('data:') || /^https?:\/\//.test(url)) {
      // 本机地址需特殊处理
      if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) {
        return this.localMediaToDataUri(url);
      }
      return url;
    }
    if (url.startsWith('/media')) {
      return this.localMediaToDataUri(url);
    }
    return url;
  }

  private localMediaToDataUri(url: string): string {
    // 提取 /media 之后的相对路径
    const marker = '/media/';
    const idx = url.indexOf(marker);
    if (idx < 0) return url;
    const relPath = decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
    const uploadRoot =
      this.prisma && process.env.UPLOAD_DIR
        ? process.env.UPLOAD_DIR
        : './uploads';
    const filePath = resolve(process.cwd(), uploadRoot.replace(/^\.\//, ''), relPath);

    if (!existsSync(filePath)) return url;

    const ext = filePath.split('.').pop()?.toLowerCase();
    const mime =
      ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
    const b64 = readFileSync(filePath).toString('base64');
    return `data:${mime};base64,${b64}`;
  }

  async create(userId: string, dto: CreateCanvasDto) {
    return this.prisma.canvas.create({
      data: {
        tenantId: 'default', // 添加默认租户ID
        userId,
        name: dto.name || '未命名画布',
        description: dto.description,
        width: dto.width || 1024,
        height: dto.height || 1024,
        thumbnail: dto.thumbnail,
        settings: dto.settings || {},
        layers: dto.layers || [],
      },
    });
  }

  async list(userId: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const [list, total] = await Promise.all([
      this.prisma.canvas.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.canvas.count({ where: { userId } }),
    ]);
    return { list, total, page, pageSize };
  }

  async detail(userId: string, canvasId: string) {
    const canvas = await this.prisma.canvas.findUnique({
      where: { id: canvasId },
    });
    if (!canvas || canvas.userId !== userId) {
      throw new NotFoundException('画布不存在');
    }
    return canvas;
  }

  async update(userId: string, canvasId: string, dto: UpdateCanvasDto) {
    const canvas = await this.detail(userId, canvasId);
    return this.prisma.canvas.update({
      where: { id: canvas.id },
      data: {
        ...dto,
      },
    });
  }

  async remove(userId: string, canvasId: string) {
    const canvas = await this.detail(userId, canvasId);
    await this.prisma.canvas.delete({ where: { id: canvas.id } });
    return { success: true };
  }

  async updateLayers(userId: string, canvasId: string, layers: any[]) {
    const canvas = await this.detail(userId, canvasId);
    return this.prisma.canvas.update({
      where: { id: canvas.id },
      data: { layers },
    });
  }

  async updateSettings(userId: string, canvasId: string, settings: Record<string, any>) {
    // ⚠️ 注意：这里是 **整体替换** settings，会抹掉 settings.graph 与 settings.libtv。
    // 写 LibTV 绑定请务必走 updateLibtvBinding（merge + CAS）。
    const canvas = await this.detail(userId, canvasId);
    return this.prisma.canvas.update({
      where: { id: canvas.id },
      data: { settings },
    });
  }

  // ---------- 编排器回写（外部 Agent 驱动 LibTV 后写回结果） ----------

  /**
   * 写回单个节点的生成结果 / 状态。
   *
   * 为什么不用 `PUT /canvas/:id/graph`：
   *   那个接口是**整图替换**，编排器回写会抹掉用户此刻在 UI 上的并发编辑。
   *   这里只重读最新图 → 只合并这一个节点 → 走 saveGraph（顺带产出 changeset）。
   *
   * 乐观锁沿用既有语义：baseVersion 与服务端 graphVersion 不一致 → 409 + serverGraph，
   * 编排器重读后重试。
   */
  async writeNodeResult(
    userId: string,
    canvasId: string,
    nodeId: string,
    dto: {
      status?: 'idle' | 'generating' | 'completed' | 'failed';
      resultUrl?: string | null;
      versions?: CanvasNodeVersion[];
      libtv?: CanvasNodeLibtv;
      baseVersion?: number;
    },
  ) {
    const canvas = await this.detail(userId, canvasId);
    if (
      dto.baseVersion !== undefined &&
      dto.baseVersion !== null &&
      dto.baseVersion !== (canvas.graphVersion ?? 0)
    ) {
      throw this.buildConflict(canvas);
    }

    const graph = this.graphWithVersion(canvas);
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) throw new NotFoundException('节点不存在');

    if (dto.status) node.status = dto.status;
    if (dto.resultUrl !== undefined) node.resultUrl = dto.resultUrl;
    if (dto.versions?.length) {
      node.versions = [...(node.versions || []), ...dto.versions];
    }
    if (dto.libtv) {
      node.libtv = { ...(node.libtv || {}), ...dto.libtv };
      // 错误文案必须来自 LibTV 的真实原因，不能退化成通用「生成失败」
      node.error = dto.libtv.errorCode
        ? dto.libtv.message ?? dto.libtv.errorCode
        : null;
    }

    const res = await this.saveGraph(userId, canvasId, graph, {
      baseVersion: dto.baseVersion,
      actorId: userId,
    });

    return {
      ok: true,
      node: graph.nodes.find((n) => n.id === nodeId),
      version: res.version,
    };
  }

  /**
   * 写回 LibTV 绑定状态（projectId / nodeMap / revision / modelCatalog）。
   *
   * 走 merge + CAS（updatedAt），避免与前端 persist() 的整图写入互相覆盖。
   */
  async updateLibtvBinding(
    userId: string,
    canvasId: string,
    patch: Partial<CanvasLibtvBinding>,
  ): Promise<CanvasLibtvBinding> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const canvas = await this.detail(userId, canvasId);
      const settings = (canvas.settings || {}) as Record<string, any>;
      const current = (settings.libtv as CanvasLibtvBinding) || {};

      const next: CanvasLibtvBinding = { ...current, ...patch };
      // 深层合并：调用方只传部分字段时不丢已有数据
      if (patch.nodeMap) next.nodeMap = { ...current.nodeMap, ...patch.nodeMap };
      if (patch.groupMap) next.groupMap = { ...current.groupMap, ...patch.groupMap };
      if (patch.modelCatalog) {
        next.modelCatalog = { ...current.modelCatalog, ...patch.modelCatalog };
      }

      const res = await this.prisma.canvas.updateMany({
        where: { id: canvasId, userId, updatedAt: canvas.updatedAt },
        data: { settings: { ...settings, libtv: next } as any },
      });
      if (res.count > 0) return next;
    }
    throw new ConflictException('画布已被并发修改，请重新读取后重试');
  }

  // ---------- 节点生成（沿连线透传引用） ----------

  /**
   * 生成单个节点：自动沿入边收集上游产物作为参考图。
   */
  async generateNode(
    userId: string,
    canvasId: string,
    nodeId: string,
    clientRequestId?: string,
  ) {
    const graph = await this.getGraph(userId, canvasId);
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) {
      throw new NotFoundException('节点不存在');
    }
    if (!node.gen?.prompt?.trim()) {
      throw new BadRequestException('节点提示词不能为空');
    }

    // 幂等：同一 clientRequestId 重复提交时，若节点已在生成/已完成，直接返回当前图，
    // 避免「用户连点 / 断网重试」造成重复扣费与重复生成（对标即梦 generate_id）。
    if (clientRequestId && node.gen?.lastRequestId === clientRequestId) {
      if (node.status === 'generating' || node.status === 'completed') {
        return graph;
      }
    }

    return this.runNode(userId, canvasId, graph, node, clientRequestId);
  }

  /**
   * 整组执行：按拓扑顺序，生成所有未完成（或指定）的 image/video 节点。
   * nodeIds 为空时执行全部"非 completed"的可生成节点。
   */
  async runGraph(
    userId: string,
    canvasId: string,
    nodeIds?: string[],
    options: { force?: boolean } = {},
  ) {
    let graph = await this.getGraph(userId, canvasId);
    const order = topoOrder(graph);

    const targets = order.filter((id) => {
      const n = graph.nodes.find((x) => x.id === id);
      if (!n || (n.type !== 'image' && n.type !== 'video' && n.type !== 'media')) return false;
      if (nodeIds && nodeIds.length) return nodeIds.includes(id);
      if (options.force) return true;
      return n.status !== 'completed';
    });

    const executed: string[] = [];
    for (const id of targets) {
      // 每步重新读取 graph，以获得上游刚生成的 resultUrl
      graph = await this.getGraph(userId, canvasId);
      const node = graph.nodes.find((n) => n.id === id);
      if (!node) continue;

      if (!node.gen?.prompt?.trim()) {
        node.status = 'failed';
        node.error = '提示词为空';
        await this.saveGraph(userId, canvasId, graph);
        continue;
      }

      await this.runNode(userId, canvasId, graph, node);
      executed.push(id);
    }

    const finalGraph = await this.getGraph(userId, canvasId);
    return { executed, graph: finalGraph };
  }

  private async runNode(
    userId: string,
    canvasId: string,
    graph: CanvasGraph,
    node: CanvasGraphNode,
    clientRequestId?: string,
  ): Promise<CanvasGraph> {
    const gen = node.gen!;
    const count = gen.count || 1;

    // 沿入边推导引用，并解析为模型可用的引用地址。
    // 外部模型无法访问本机 localhost/media 地址，需把本地文件读取为 base64 data URI。
    const refDefs = resolveReferences(graph, node.id);
    const references: Array<{ url: string; role: 'subject' | 'image' | 'firstFrame' | 'lastFrame' }> = [];
    for (const r of refDefs) {
      const source = graph.nodes.find((n) => n.id === r.nodeId);
      if (!source?.resultUrl) continue;
      const url = await this.toModelAccessibleUrl(source.resultUrl);
      references.push({ url, role: r.role });
    }

    // 积分校验
    const creditCost = this.aiService.getCreditCost(gen.model, {
      prompt: gen.prompt,
      count,
      references,
    });
    const balance = await this.creditsService.getBalance(userId);
    if (balance.balance < creditCost) {
      node.status = 'failed';
      node.error = `积分不足，当前 ${balance.balance}，需要 ${creditCost}`;
      await this.saveGraph(userId, canvasId, graph);
      return this.getGraph(userId, canvasId);
    }

    // 标记生成中（同时记录幂等键，供重复提交识别）
    node.status = 'generating';
    node.error = null;
    if (clientRequestId) {
      node.gen = { ...gen, lastRequestId: clientRequestId };
    }
    await this.saveGraph(userId, canvasId, graph);

    // 扣积分
    await this.creditsService.deduct(userId, creditCost, 'GENERATION', node.id);

    const isVideo = node.type === 'video';
    const isAudio = node.type === 'media';

    // 调真实模型
    const result = await this.aiService.generate(gen.model, {
      prompt: gen.prompt,
      negativePrompt: gen.negativePrompt,
      size: gen.aspectRatio || '1024x1024',
      count,
      subjectType: gen.subjectType,
      references,
    });

    // 重新读取 graph，避免覆盖并发改动
    const latest = await this.getGraph(userId, canvasId);
    const targetNode = latest.nodes.find((n) => n.id === node.id)!;

    if (!result.success || !(result.urls || []).length) {
      // 失败退还积分
      await this.creditsService.add(userId, creditCost, 'REFUND', node.id);
      targetNode.status = 'failed';
      targetNode.error = result.error || '生成失败';
      await this.saveGraph(userId, canvasId, latest);
      return latest;
    }

    // 转存到自有存储
    const persisted = await this.persistence.persistBatch(result.urls!, {
      kind: isVideo ? 'video' : isAudio ? 'audio' : 'image',
    });
    const primaryUrl = persisted[0];

    targetNode.versions = [
      ...(targetNode.versions || []),
      {
        id: randomUUID(),
        resultUrl: primaryUrl,
        prompt: gen.prompt,
        model: gen.model,
        params: gen,
        createdAt: new Date().toISOString(),
      },
    ];
    targetNode.resultUrl = primaryUrl;
    targetNode.status = 'completed';
    targetNode.error = null;

    await this.saveGraph(userId, canvasId, latest);
    return latest;
  }
}

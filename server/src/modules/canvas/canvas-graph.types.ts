/**
 * 统一画布对象模型（Unified Canvas Graph）
 *
 * 画布可整体序列化为 JSON，支持：
 *  - 节点（Node）：text | image | video | group
 *  - 有向连线（Edge）：表达引用/生成关系，下游生成时沿入边收集上游产物
 *  - 版本（Version）：每个节点的历史生成结果，可回退
 *
 * 存储位置：Canvas.settings 中以 { nodes, edges } 保存，
 * 保持画布可整体 Fork / 克隆 / 作为模板。
 */

export type CanvasNodeType = 'text' | 'image' | 'video' | 'media' | 'group' | 'editor';

export interface CanvasNodeReference {
  /** 上游节点 id */
  nodeId: string;
  /** 引用用途：subject(主体/角色) | image(通用图参考) | firstFrame(视频首帧) | lastFrame(尾帧) */
  role: 'subject' | 'image' | 'firstFrame' | 'lastFrame';
}

export interface CanvasGenerationParams {
  model: string;
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: string;
  count?: number;
  subjectType?: 'character' | 'product';
  referenceStrength?: number;
  /**
   * 模式：
   *   generate(默认文生图) | edit(文本指令编辑原图)
   * edit 模式下，入边/引用的第一张图作为待编辑底图。
   */
  mode?: 'generate' | 'edit';
  [key: string]: any;
}

/**
 * 节点在 LibTV 侧的同步状态。
 *
 * 由外部编排器（WorkBuddy）通过 /api/orchestrator 回写，
 * 前端只读展示。状态语义严格区分「失败」与「没有产物」：
 *   no_media = LibTV 节点已建立但未产出媒体（**不是读取失败**）
 */
export type CanvasNodeLibtvState =
  | 'unmapped' // 尚未映射到 LibTV
  | 'mapped' // 已在 LibTV 建好（run=false 预检通过）
  | 'queued' // 已提交生成任务
  | 'running' // 生成中（真实 LibTV 状态）
  | 'succeeded' // 完成且有媒体
  | 'no_media' // 完成但无媒体
  | 'failed' // 失败
  | 'blocked'; // 被策略阻断（如账号非会员 COMMERCIAL_BLOCKED）

export interface CanvasNodeLibtv {
  /** LibTV 节点 id（i- / v- / t- 前缀） */
  nodeId?: string;
  projectId?: string;
  state?: CanvasNodeLibtvState;
  /** LibTV 任务 id，用于断线后续查 */
  taskId?: string;
  /** 解析后的 LibTV modelKey（不含 libtv: 前缀） */
  model?: string;
  /** 实际下发给 LibTV 的扁平 params */
  params?: Record<string, any>;
  /** 被丢弃的参数及原因（不静默丢弃） */
  skipped?: string[];
  /** 用户可读说明 */
  message?: string;
  /** 错误码：COMMERCIAL_BLOCKED / PARAM_REJECTED / NO_MEDIA / … */
  errorCode?: string;
  updatedAt?: string;
}

/**
 * 画布与 LibTV 项目的绑定状态（存于 Canvas.settings.libtv，与 settings.graph 并列）。
 *
 * nodeMap 是 TapNow 节点 id ↔ LibTV 节点 id 的**唯一真相源**：
 * 两边 id 命名空间完全不同（TapNow: n_<base36>_<seq>，LibTV: i-/v-/t-/g-），
 * 绝不能靠 id 形状推断对应关系。
 */
export interface CanvasLibtvBinding {
  /** LibTV 画布 UUID（32 位 hex），不是数字 id */
  projectId?: string;
  projectName?: string;
  /** LibTV 乐观锁令牌 sha256-<64hex> */
  revision?: string;
  nodeMap?: Record<string, {
    libtvNodeId?: string;
    idempotencyKey?: string;
    promptHash?: string;
    model?: string;
    state?: CanvasNodeLibtvState;
    /** 若该节点对应的参考图已上传到 LibTV，记录其媒体节点 id */
    mediaNodeId?: string | null;
    updatedAt?: string;
  }>;
  groupMap?: Record<string, string>;
  modelCatalog?: {
    updatedAt?: string;
    items?: Array<{
      modelKey: string;
      modelName?: string;
      displayName?: string;
      modality?: string;
      estimatedTime?: string;
    }>;
  };
  lastSyncedAt?: string;
  lastError?: string | null;
}

export interface CanvasNodeVersion {
  id: string;
  resultUrl: string;
  prompt: string;
  model: string;
  params?: Record<string, any>;
  createdAt: string;
}

export interface CanvasGraphNode {
  id: string;
  type: CanvasNodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  locked: boolean;
  visible: boolean;
  title?: string;

  /** 生成配置（image/video 节点） */
  gen?: CanvasGenerationParams;

  /** 显式引用（也可由 edges 推导；保留以便手动指定用途） */
  references?: CanvasNodeReference[];

  /** 当前采用的结果 URL */
  resultUrl?: string | null;

  /** 生成状态 */
  status: 'idle' | 'generating' | 'completed' | 'failed';
  error?: string | null;

  /** 历史版本（最新在末尾） */
  versions: CanvasNodeVersion[];

  /** 是否折叠（折叠态只显示封面+徽章） */
  collapsed?: boolean;

  /** 所属分组 id（空表示未分组） */
  groupId?: string;

  /** LibTV 同步状态（由外部编排器回写，前端只读） */
  libtv?: CanvasNodeLibtv;
}

export interface CanvasGraphEdge {
  id: string;
  from: string;
  to: string;
  /** 连线时指定的引用用途，默认按节点类型推导 */
  role?: CanvasNodeReference['role'];
}

export interface CanvasGraph {
  nodes: CanvasGraphNode[];
  edges: CanvasGraphEdge[];
  /**
   * 画布图版本号（服务端维护，用于乐观锁与变更集基线）。
   * 仅在「返回给客户端」时携带，落库时会被剥离。
   */
  version?: number;
  /**
   * LibTV 绑定投影（仅出现在编排器接口的响应里）。
   * ⚠️ 绑定数据的**权威存放位置是 Canvas.settings.libtv**（与 settings.graph 并列），
   * 绝不会被写进 settings.graph —— saveGraph 会主动剥离该字段，避免出现两份副本。
   */
  libtv?: CanvasLibtvBinding;
}

/**
 * 画布增量操作
 *
 * 对标即梦 infinite_canvas 的 changeset：
 * 客户端可以只提交变更（而非整图覆盖），服务端按序应用并记录变更集。
 */
export type CanvasOp =
  | { op: 'node.upsert'; node: CanvasGraphNode }
  | { op: 'node.remove'; id: string }
  | { op: 'edge.upsert'; edge: CanvasGraphEdge }
  | { op: 'edge.remove'; id: string };

/**
 * 计算两张图的差异操作（node/edge 的 upsert / remove）。
 *
 * 服务端在保存整图时自动生成 changeset；客户端也可以直接提交 ops。
 */
export function diffGraph(oldGraph: CanvasGraph, newGraph: CanvasGraph): CanvasOp[] {
  const ops: CanvasOp[] = [];

  const oldNodes = new Map((oldGraph.nodes || []).map((n) => [n.id, n]));
  const newNodes = new Map((newGraph.nodes || []).map((n) => [n.id, n]));

  for (const [id, node] of newNodes) {
    const prev = oldNodes.get(id);
    if (!prev || JSON.stringify(prev) !== JSON.stringify(node)) {
      ops.push({ op: 'node.upsert', node });
    }
  }
  for (const id of oldNodes.keys()) {
    if (!newNodes.has(id)) ops.push({ op: 'node.remove', id });
  }

  const oldEdges = new Map((oldGraph.edges || []).map((e) => [e.id, e]));
  const newEdges = new Map((newGraph.edges || []).map((e) => [e.id, e]));

  for (const [id, edge] of newEdges) {
    const prev = oldEdges.get(id);
    if (!prev || JSON.stringify(prev) !== JSON.stringify(edge)) {
      ops.push({ op: 'edge.upsert', edge });
    }
  }
  for (const id of oldEdges.keys()) {
    if (!newEdges.has(id)) ops.push({ op: 'edge.remove', id });
  }

  return ops;
}

/**
 * 将增量操作应用到图上（返回新的图对象，不修改入参）
 */
export function applyOps(graph: CanvasGraph, ops: CanvasOp[]): CanvasGraph {
  const nodes = [...(graph.nodes || [])];
  const edges = [...(graph.edges || [])];

  for (const op of ops || []) {
    switch (op.op) {
      case 'node.upsert': {
        const idx = nodes.findIndex((n) => n.id === op.node.id);
        if (idx >= 0) nodes[idx] = op.node;
        else nodes.push(op.node);
        break;
      }
      case 'node.remove': {
        const idx = nodes.findIndex((n) => n.id === op.id);
        if (idx >= 0) nodes.splice(idx, 1);
        break;
      }
      case 'edge.upsert': {
        const idx = edges.findIndex((e) => e.id === op.edge.id);
        if (idx >= 0) edges[idx] = op.edge;
        else edges.push(op.edge);
        break;
      }
      case 'edge.remove': {
        const idx = edges.findIndex((e) => e.id === op.id);
        if (idx >= 0) edges.splice(idx, 1);
        break;
      }
      default:
        break;
    }
  }

  return { nodes, edges };
}

/**
 * 根据边推导某节点的引用列表。
 * 上游为 image/video 且下游为 video 时默认作为首帧，其余作为通用参考。
 */
export function resolveReferences(graph: CanvasGraph, nodeId: string): CanvasNodeReference[] {
  const incoming = graph.edges.filter((e) => e.to === nodeId);
  const target = graph.nodes.find((n) => n.id === nodeId);

  const refs: CanvasNodeReference[] = [];
  for (const edge of incoming) {
    const source = graph.nodes.find((n) => n.id === edge.from);
    if (!source || !source.resultUrl) continue;

    let role: CanvasNodeReference['role'];
    if (edge.role) {
      role = edge.role;
    } else if (target?.type === 'video') {
      role = 'firstFrame';
    } else {
      role = 'image';
    }
    refs.push({ nodeId: source.id, role });
  }

  // 合并节点上的显式引用（去重，以 nodeId+role 为键）
  for (const r of target?.references || []) {
    if (!refs.some((x) => x.nodeId === r.nodeId && x.role === r.role)) {
      refs.push(r);
    }
  }

  return refs;
}

/**
 * 拓扑排序：返回可执行节点顺序（被依赖者在前）。
 * 存在环时，环内节点按原顺序追加，不会死循环。
 */
export function topoOrder(graph: CanvasGraph): string[] {
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const n of graph.nodes) {
    indeg.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of graph.edges) {
    if (!indeg.has(e.from) || !indeg.has(e.to)) continue;
    adj.get(e.from)!.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
  }

  const queue = graph.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  const order: string[] = [];

  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adj.get(id) || []) {
      const d = (indeg.get(next) || 0) - 1;
      indeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }

  // 环中剩余节点
  for (const n of graph.nodes) {
    if (!order.includes(n.id)) order.push(n.id);
  }

  return order;
}

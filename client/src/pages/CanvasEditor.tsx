import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Layers,
  MessageSquare,
  Settings as SettingsIcon,
  Image as ImageIcon,
  Video as VideoIcon,
  Type as TypeIcon,
  Upload,
  Sparkles,
  Mic,
  ArrowUp,
  Pencil,
  HelpCircle,
  Map,
  Grid3x3,
  Eye,
  Link2,
  Copy,
  Lock,
  Unlock,
  EyeOff,
  X,
  Loader2,
  Package,
  Zap,
  Clock,
  Send,
  Save,
  Download,
  Play,
  RotateCcw,
  Home,
} from 'lucide-react';
import { canvasApi } from '../api/canvas';
import { newRequestId } from '../api/client';
import { generationApi } from '../api/generation';
import { uploadApi } from '../api/upload';
import { templatesApi } from '../api/templates';
import { assetsApi } from '../api/assets';
import type { AssetType } from '../api/assets';
import { skillsApi } from '../api/skills';
import { agentApi } from '../api/agent';
import type { CanvasGraph, CanvasGraphNode, CanvasNodeType } from '../api/canvas-graph';
import type { AIModel } from '../types';

const DEFAULT_MODEL = 'minimax-image';
let idSeq = 1;
const nextId = (p: string) => `${p}_${Date.now().toString(36)}_${idSeq++}`;

function modelsFor(type: CanvasNodeType, models: AIModel[]): AIModel[] {
  if (type === 'video') return models.filter((m) => /video/i.test(m.id));
  if (type === 'image') return models.filter((m) => !/video/i.test(m.id));
  return [];
}

function makeNode(type: CanvasNodeType, x: number, y: number): CanvasGraphNode {
  const base: CanvasGraphNode = {
    id: nextId('n'),
    type,
    x, y,
    width: 340,
    height: type === 'image' ? 380 : type === 'editor' ? 380 : 380,
    zIndex: 1,
    locked: false,
    visible: true,
    title:
      type === 'image' ? 'Image' :
      type === 'video' ? 'Video' :
      type === 'editor' ? '图片编辑器' :
      type === 'text' ? 'Text' : 'Media',
    versions: [],
    status: 'idle',
    collapsed: false,
  };
  if (type === 'image' || type === 'video') {
    base.gen = {
      model: type === 'video' ? 'minimax-video' : DEFAULT_MODEL,
      prompt: '',
      aspectRatio: '1024x1024',
      count: 1,
      subjectType: 'character',
    };
  }
  return base;
}

export function CanvasEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const surfaceRef = useRef<HTMLDivElement>(null);

  const [graph, setGraph] = useState<CanvasGraph>({ nodes: [], edges: [] });
  const [models, setModels] = useState<AIModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [zoom, setZoom] = useState(0.78);
  const [pan, setPan] = useState({ x: 60, y: 60 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; sx: number; sy: number; nx: number; ny: number } | null>(null);
  const [resize, setResize] = useState<{ id: string; sx: number; sy: number; nw: number; nh: number } | null>(null);
  const [panning, setPanning] = useState<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const [linkingFrom, setLinkingFrom] = useState<string | null>(null);
  const [linkingHover, setLinkingHover] = useState<string | null>(null);
  const [linkingMouse, setLinkingMouse] = useState<{ x: number; y: number } | null>(null);
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null); // 双击节点 → 编辑 prompt
  const [quickAddAt, setQuickAddAt] = useState<{ x: number; y: number } | null>(null); // 双击空白处 → 快速添加
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null); // 右键菜单
  const [deleteConfirm, setDeleteConfirm] = useState<{ nodeId: string; x: number; y: number } | null>(null); // 删除确认

  // 撤销 / 重做栈
  const pastRef = useRef<CanvasGraph[]>([]);
  const futureRef = useRef<CanvasGraph[]>([]);
  const [, setHistoryTick] = useState(0); // 强制 re-render 历史栈变化

  // ---------- 协同：乐观锁 + 串行保存 ----------
  // 服务端画布图版本号（用于 baseVersion 乐观锁）
  const versionRef = useRef<number>(0);
  // 保存串行化：保证同一时刻只有一次保存请求在飞，避免自我冲突
  const saveChainRef = useRef<Promise<unknown>>(Promise.resolve());
  // 冲突 / 同步提示
  const [syncMsg, setSyncMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [g, m, c] = await Promise.all([
          canvasApi.getGraph(id!),
          generationApi.listModels().catch(() => []),
          canvasApi.detail(id!).catch(() => null),
        ]);
        setGraph(g || { nodes: [], edges: [] });
        versionRef.current = (g as any)?.version ?? 0;
        setModels(m as AIModel[]);
        if (c) setCanvasName(c.name || '');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // 加载完成后自动 fit-view
  const loadedOnceRef = useRef(false);
  useEffect(() => {
    if (loading || loadedOnceRef.current) return;
    loadedOnceRef.current = true;
    requestAnimationFrame(() => fitView());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  /**
   * 保存画布图（串行 + 乐观锁）
   *
   * - 串行化：所有保存请求排队执行，后一次使用前一次返回的新版本号
   * - 乐观锁：baseVersion 与服务端不一致时服务端返回 409，
   *   此时提示用户并自动重载服务端画布，避免覆盖他人改动
   */
  const saveGraph = useCallback(
    (next: CanvasGraph) => {
      saveChainRef.current = saveChainRef.current
        .then(async () => {
          try {
            const res: any = await canvasApi.updateGraph(id!, next, versionRef.current);
            versionRef.current = res?.version ?? versionRef.current;
            setSyncMsg('');
          } catch (err: any) {
            const status = err?.response?.status;
            if (status === 409) {
              setSyncMsg('画布已在其他端更新，已为你重新加载最新版本');
              try {
                const fresh = await canvasApi.getGraph(id!);
                setGraph(fresh);
                versionRef.current = (fresh as any)?.version ?? 0;
              } catch {
                /* 忽略：保留本地状态 */
              }
            } else {
              console.warn('[canvas] 保存失败', err);
            }
          }
        })
        .catch(() => undefined);
      return saveChainRef.current;
    },
    [id],
  );

  const persist = useCallback(
    async (next: CanvasGraph) => {
      // 记录历史（在 setGraph 之前，捕获当前状态）
      const prev = graph;
      if (prev !== next) {
        pastRef.current = [...pastRef.current.slice(-49), prev];
        futureRef.current = []; // 任何新操作清空 future
      }
      console.log('[persist] prev nodes:', prev.nodes.length, 'next nodes:', next.nodes.length);
      setGraph(next);
      saveGraph(next);
    },
    [id, graph],
  );

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;
    const prev = pastRef.current[pastRef.current.length - 1];
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [...futureRef.current, graph].slice(-50);
    setGraph(prev);
    saveGraph(prev);
    setHistoryTick((t) => t + 1);
  }, [id, graph]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current[futureRef.current.length - 1];
    futureRef.current = futureRef.current.slice(0, -1);
    pastRef.current = [...pastRef.current, graph].slice(-50);
    setGraph(next);
    saveGraph(next);
    setHistoryTick((t) => t + 1);
  }, [id, graph]);

  const updateNode = (nodeId: string, patch: Partial<CanvasGraphNode>) =>
    persist({ ...graph, nodes: graph.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)) });

  const updateNodeLocal = useCallback((nodeId: string, patch: Partial<CanvasGraphNode>) => {
    setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)) }));
  }, []);

  const updateGen = (nodeId: string, patch: Record<string, any>) =>
    persist({
      ...graph,
      nodes: graph.nodes.map((n) =>
        n.id === nodeId ? { ...n, gen: { ...(n.gen || { model: DEFAULT_MODEL, prompt: '' }), ...patch } } : n,
      ),
    });

  const removeNode = (nodeId: string) => {
    persist({
      nodes: graph.nodes.filter((n) => n.id !== nodeId),
      edges: graph.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
    });
    if (selectedId === nodeId) setSelectedId(null);
    if (linkingFrom === nodeId) setLinkingFrom(null);
  };

  const requestDelete = (nodeId: string, e?: React.MouseEvent) => {
    if (e) {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setDeleteConfirm({ nodeId, x: rect.left, y: rect.top });
    } else {
      // 从右键菜单调用时，使用节点位置
      const node = graph.nodes.find((n) => n.id === nodeId);
      if (node) {
        setDeleteConfirm({ nodeId, x: node.x * zoom + pan.x + 100, y: node.y * zoom + pan.y + 50 });
      }
    }
  };

  const confirmDelete = () => {
    if (deleteConfirm) {
      removeNode(deleteConfirm.nodeId);
      setDeleteConfirm(null);
    }
  };

  const cancelDelete = () => {
    setDeleteConfirm(null);
  };

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [canvasName, setCanvasName] = useState('');

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return graph.nodes.filter((n) => (n.title || '').toLowerCase().includes(q));
  }, [graph.nodes]);

  const handleSelectNode = useCallback((nodeId: string) => {
    const n = graph.nodes.find((x) => x.id === nodeId);
    if (!n || !surfaceRef.current) return;
    const r = surfaceRef.current.getBoundingClientRect();
    setZoom(1);
    setPan({ x: r.width / 2 - n.x - n.width / 2, y: r.height / 2 - n.y - n.height / 2 });
    setSelectedId(nodeId);
    setSearchOpen(false);
    setSearchQuery('');
  }, [graph.nodes]);

  const handleUseTemplate = async (templateId: string) => {
    try {
      const canvas = await templatesApi.instantiate(templateId);
      navigate(`/canvas/${canvas.id}`);
    } catch {
      setNotice('模板使用失败');
      setTimeout(() => setNotice(''), 2000);
    }
  };

  const handleCreateTemplate = async (body: { name?: string; description?: string; category?: string; tags?: string[] }) => {
    try {
      await templatesApi.createFromCanvas(id!, body);
      setNotice('模板创建成功');
      setTimeout(() => setNotice(''), 2000);
    } catch {
      setNotice('模板创建失败');
      setTimeout(() => setNotice(''), 2000);
    }
  };

  const handleUseAsset = (asset: { id: string; url: string; type: string; name: string }) => {
    const nodeType: CanvasNodeType = asset.type === 'video' ? 'video' : 'image';
    addNode(nodeType);
    setTimeout(() => {
      setGraph((g) => {
        const lastNode = g.nodes[g.nodes.length - 1];
        if (!lastNode) return g;
        return {
          ...g,
          nodes: g.nodes.map((n) =>
            n.id === lastNode.id
              ? { ...n, resultUrl: asset.url, title: asset.name, status: 'completed' as const }
              : n,
          ),
        };
      });
    }, 0);
  };

  const handleUseSkill = async (skillId: string) => {
    try {
      const result = await skillsApi.execute(skillId, id!);
      const fresh = await canvasApi.getGraph(id!);
      setGraph(fresh);
      if (result.nodeId) setSelectedId(result.nodeId);
    } catch {
      setNotice('技能执行失败');
      setTimeout(() => setNotice(''), 2000);
    }
  };

  const handleRestoreVersion = (nodeId: string, resultUrl: string) => {
    updateNode(nodeId, { resultUrl, status: 'completed' });
    setNotice('已恢复');
    setTimeout(() => setNotice(''), 1500);
  };

  const handleUpdateSettings = async (settings: Record<string, any>) => {
    try {
      await canvasApi.updateSettings(id!, settings);
      if (settings.name) {
        await canvasApi.update(id!, { name: settings.name });
      }
    } catch {
      setNotice('设置保存失败');
      setTimeout(() => setNotice(''), 2000);
    }
  };

  const handleCreateAgentTask = async (vision: string) => {
    try {
      await agentApi.create(vision);
    } catch {
      setNotice('任务创建失败');
      setTimeout(() => setNotice(''), 2000);
    }
  };

  const connectRef = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    if (graph.edges.some((e) => e.from === fromId && e.to === toId)) return;
    persist({ ...graph, edges: [...graph.edges, { id: nextId('e'), from: fromId, to: toId }] });
  }, [graph, persist]);

  const disconnectRef = useCallback((edgeId: string) => {
    persist({ ...graph, edges: graph.edges.filter((e) => e.id !== edgeId) });
  }, [graph, persist]);

  const duplicateNode = (nodeId: string) => {
    const src = graph.nodes.find((n) => n.id === nodeId);
    if (!src) return;
    const copy: CanvasGraphNode = {
      ...JSON.parse(JSON.stringify(src)),
      id: nextId('n'),
      x: src.x + 40,
      y: src.y + 40,
      zIndex: graph.nodes.length + 1,
      resultUrl: null,
      versions: [],
      status: 'idle',
      locked: false,
    };
    persist({ ...graph, nodes: [...graph.nodes, copy] });
    setSelectedId(copy.id);
  };

  // 真实生成：调后端 API
  const genKeyRef = useRef<Map<string, string>>(new globalThis.Map<string, string>());
  const generateOne = useCallback(async (nodeId: string) => {
    console.log('[generateOne] called with nodeId:', nodeId, 'graph nodes:', graph.nodes.length);
    const n = graph.nodes.find((x) => x.id === nodeId);
    console.log('[generateOne] found node:', n?.id, 'prompt:', n?.gen?.prompt);
    if (!n) { console.log('[generateOne] node not found'); return; }
    if (!n.gen?.prompt?.trim()) {
      console.log('[generateOne] prompt empty');
      setNotice('请先填写 prompt');
      setTimeout(() => setNotice(''), 2000);
      return;
    }
    console.log('[generateOne] starting generation, id:', id);
    setBusy(true);
    setNotice('');
    // 乐观标记
    updateNodeLocal(nodeId, { status: 'generating', error: null });
    // 幂等键：生成中重复点击复用同一个 key，避免重复扣费/重复生成
    const existingKey = genKeyRef.current.get(nodeId);
    const clientRequestId =
      n.status === 'generating' && existingKey ? existingKey : newRequestId();
    genKeyRef.current.set(nodeId, clientRequestId);
    try {
      await canvasApi.generateNode(id!, nodeId, clientRequestId);
      // 重新拉 graph
      const fresh = await canvasApi.getGraph(id!);
      setGraph(fresh);
      setNotice('生成完成');
      setTimeout(() => setNotice(''), 2000);
    } catch (e: any) {
      setNotice(e?.response?.data?.message || e.message || '生成失败');
      setTimeout(() => setNotice(''), 3000);
      // 标记失败
      updateNodeLocal(nodeId, { status: 'failed', error: e?.response?.data?.message || e.message });
    } finally {
      setBusy(false);
    }
  }, [graph, id, updateNodeLocal]);

  // 新增节点：放在最右下角节点的右侧（避免重叠），无节点时放在视口中央
  const addNode = (type: CanvasNodeType, atX?: number, atY?: number) => {
    let x: number, y: number;
    if (atX !== undefined && atY !== undefined) {
      x = atX; y = atY;
    } else if (graph.nodes.length > 0) {
      // 找最右下角的节点
      const rightmost = graph.nodes.reduce((acc, n) =>
        !acc || n.x + n.width > acc.x + acc.width ? n : acc, null as CanvasGraphNode | null);
      x = (rightmost ? rightmost.x + rightmost.width : 100) + 120;
      y = rightmost ? rightmost.y : 100;
    } else {
      x = 200; y = 160;
    }
    const node = makeNode(type, x, y);
    node.zIndex = graph.nodes.length + 1;
    persist({ ...graph, nodes: [...graph.nodes, node] });
    setSelectedId(node.id);
  };

  const connectNodes = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    if (graph.edges.some((e) => e.from === fromId && e.to === toId)) return;
    persist({ ...graph, edges: [...graph.edges, { id: nextId('e'), from: fromId, to: toId }] });
  };

  const deleteEdge = (edgeId: string) =>
    persist({ ...graph, edges: graph.edges.filter((e) => e.id !== edgeId) });

  const fitView = useCallback(() => {
    if (!surfaceRef.current || graph.nodes.length === 0) return;
    const r = surfaceRef.current.getBoundingClientRect();
    const pad = 60;
    const xs = graph.nodes.map((n) => n.x);
    const ys = graph.nodes.map((n) => n.y);
    const xe = graph.nodes.map((n) => n.x + n.width);
    const ye = graph.nodes.map((n) => n.y + n.height);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const maxX = Math.max(...xe), maxY = Math.max(...ye);
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const z = Math.min((r.width - pad * 2) / bw, (r.height - pad * 2) / bh, 1);
    const px = (r.width - bw * z) / 2 - minX * z;
    const py = (r.height - bh * z) / 2 - minY * z;
    setZoom(Number(z.toFixed(2)));
    setPan({ x: Math.round(px), y: Math.round(py) });
  }, [graph.nodes]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) requestDelete(selectedId);
      if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey) fitView();
      if (e.key === 'Escape') {
        setLinkingFrom(null);
        setLinkingHover(null);
        setCtxMenu(null);
        setQuickAddAt(null);
        cancelDelete();
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if (mod && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redo();
      }
      if (mod && e.key === 'd' && selectedId) {
        e.preventDefault();
        duplicateNode(selectedId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, graph, fitView, undo, redo]);

  // 拖动只在标题栏触发
  const onTitleDown = (e: React.PointerEvent, n: CanvasGraphNode) => {
    e.stopPropagation();
    setSelectedId(n.id);
    if (linkingFrom) {
      // 连线模式下，点击节点 = 从该节点连线到发起节点
      if (linkingFrom !== n.id) {
        connectNodes(linkingFrom, n.id);
      }
      setLinkingFrom(null);
      setLinkingHover(null);
      return;
    }
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ id: n.id, sx: e.clientX, sy: e.clientY, nx: n.x, ny: n.y });
  };
  const onResizeDown = (e: React.PointerEvent, n: CanvasGraphNode) => {
    e.stopPropagation();
    setSelectedId(n.id);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setResize({ id: n.id, sx: e.clientX, sy: e.clientY, nw: n.width, nh: n.height });
  };
  const onNodeBodyClick = (e: React.PointerEvent, n: CanvasGraphNode) => {
    e.stopPropagation();
    if (linkingFrom) {
      if (linkingFrom !== n.id) {
        connectNodes(linkingFrom, n.id);
      }
      setLinkingFrom(null);
      setLinkingHover(null);
      return;
    }
    setSelectedId(n.id);
  };
  const onNodeHover = (n: CanvasGraphNode) => {
    if (linkingFrom && linkingFrom !== n.id) setLinkingHover(n.id);
  };
  const onSurfaceDown = (e: React.PointerEvent) => {
    if (linkingFrom) {
      setLinkingFrom(null);
      setLinkingHover(null);
      return;
    }
    setSelectedId(null);
    setEditingId(null);
    setPanning({ sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y });
  };
  const onSurfaceDoubleClick = (e: React.MouseEvent) => {
    // 如果双击命中某个节点 → 进入编辑模式
    const targetNode = (e.target as HTMLElement).closest('.bg-neutral-950.border') as HTMLElement | null;
    if (targetNode) {
      // 从节点元素的 data 里读取 id（需要在节点上加 data-node-id）
      const id = targetNode.getAttribute('data-node-id');
      if (id) {
        setSelectedId(id);
        setEditingId(id);
        return;
      }
    }
    // 否则双击空白处 → 快速添加菜单
    if (!surfaceRef.current) return;
    const rect = surfaceRef.current.getBoundingClientRect();
    const cx = (e.clientX - rect.left - pan.x) / zoom;
    const cy = (e.clientY - rect.top - pan.y) / zoom;
    setQuickAddAt({ x: Math.max(0, Math.round(cx)), y: Math.max(0, Math.round(cy)) });
  };
  const onSurfaceContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const targetNode = (e.target as HTMLElement).closest('[data-node-id]') as HTMLElement | null;
    if (!targetNode) return;
    const id = targetNode.getAttribute('data-node-id');
    if (!id) return;
    setSelectedId(id);
    setCtxMenu({ x: e.clientX, y: e.clientY, nodeId: id });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (linkingFrom && surfaceRef.current) {
      const rect = surfaceRef.current.getBoundingClientRect();
      setLinkingMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
    if (drag) {
      const dx = (e.clientX - drag.sx) / zoom;
      const dy = (e.clientY - drag.sy) / zoom;
      setGraph((g) => ({
        ...g,
        nodes: g.nodes.map((n) => {
          if (n.id !== drag.id) return n;
          // 边界限制：x/y >= 0，最大不超过 8000
          const nx = Math.max(0, Math.min(8000, drag.nx + dx));
          const ny = Math.max(0, Math.min(8000, drag.ny + dy));
          return { ...n, x: nx, y: ny };
        }),
      }));
    } else if (resize) {
      const dx = (e.clientX - resize.sx) / zoom;
      const dy = (e.clientY - resize.sy) / zoom;
      setGraph((g) => ({
        ...g,
        nodes: g.nodes.map((n) => {
          if (n.id !== resize.id) return n;
          const nw = Math.max(280, Math.min(900, resize.nw + dx));
          const nh = Math.max(280, Math.min(900, resize.nh + dy));
          return { ...n, width: nw, height: nh };
        }),
      }));
    } else if (panning) {
      setPan({ x: panning.px + (e.clientX - panning.sx), y: panning.py + (e.clientY - panning.sy) });
    }
  };
  const onPointerUp = () => {
    if (drag || resize) saveGraph(graph);
    setDrag(null); setResize(null); setPanning(null);
  };

  if (loading) {
    return <div className="h-full flex items-center justify-center text-neutral-500 text-sm">加载画布…</div>;
  }

  return (
    <CanvasErrorBoundary>
      <div className="h-full flex bg-white text-neutral-800 overflow-hidden">
        {syncMsg && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-amber-500 text-white text-xs rounded-lg shadow-lg">
            {syncMsg}
          </div>
        )}
        <LeftToolbar
          onAdd={(t) => addNode(t)}
          onToggleSearch={() => { setSearchOpen((v) => !v); setActivePanel(null); }}
          activePanel={activePanel}
          onPanelChange={(name) => { setActivePanel(name); setSearchOpen(false); }}
        />

        {activePanel && activePanel !== 'history' && (
          <div className="absolute left-14 top-0 bottom-0 z-40" onPointerDown={(e) => e.stopPropagation()}>
            {activePanel === 'templates' && (
              <TemplatesPanel canvasId={id!} onUse={handleUseTemplate} onCreate={handleCreateTemplate} onClose={() => setActivePanel(null)} />
            )}
            {activePanel === 'assets' && (
              <AssetsPanel onUse={handleUseAsset} onClose={() => setActivePanel(null)} />
            )}
            {activePanel === 'skills' && (
              <SkillsPanel canvasId={id!} onUse={handleUseSkill} onClose={() => setActivePanel(null)} />
            )}
            {activePanel === 'agent' && (
              <AgentPanel canvasId={id!} onCreateTask={handleCreateAgentTask} onClose={() => setActivePanel(null)} />
            )}
            {activePanel === 'settings' && (
              <SettingsPanel canvasId={id!} canvasName={canvasName} onUpdate={handleUpdateSettings} onCreateTemplate={handleCreateTemplate} onClose={() => setActivePanel(null)} />
            )}
          </div>
        )}

        {activePanel === 'history' && (
          <div className="absolute left-14 top-0 bottom-0 z-40" onPointerDown={(e) => e.stopPropagation()}>
            <HistoryPanel graph={graph} onRestore={handleRestoreVersion} onNavigateNode={handleSelectNode} onClose={() => setActivePanel(null)} />
          </div>
        )}

        {searchOpen && (
          <div className="absolute left-14 top-4 z-50 w-72 bg-white border border-neutral-200 rounded-xl shadow-2xl overflow-hidden"
            onPointerDown={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-neutral-100">
              <Search size={14} className="text-neutral-400 shrink-0" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索节点…"
                className="flex-1 bg-transparent outline-none text-[13px] text-neutral-800 placeholder-neutral-400"
              />
              <button onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
                className="p-0.5 rounded hover:bg-neutral-100 text-neutral-400">
                <X size={13} />
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {searchQuery.trim() ? (
                handleSearch(searchQuery).length > 0 ? (
                  handleSearch(searchQuery).map((n: CanvasGraphNode) => (
                    <button key={n.id}
                      onClick={() => handleSelectNode(n.id)}
                      className="w-full px-3 py-2 flex items-center gap-2 text-left text-xs hover:bg-violet-50 transition-colors">
                      {n.type === 'image' ? <ImageIcon size={12} className="text-neutral-400" /> :
                       n.type === 'video' ? <VideoIcon size={12} className="text-neutral-400" /> :
                       <TypeIcon size={12} className="text-neutral-400" />}
                      <span className="text-neutral-800 truncate">{n.title || n.type}</span>
                      {n.resultUrl && <img src={n.resultUrl} alt="" className="w-6 h-6 rounded object-cover ml-auto shrink-0" />}
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-4 text-center text-[11px] text-neutral-400">无匹配节点</div>
                )
              ) : (
                <div className="px-3 py-4 text-center text-[11px] text-neutral-400">输入关键词搜索画布节点</div>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 relative overflow-hidden">
        <div
          ref={surfaceRef}
          data-canvas-surface
          className="absolute inset-0 cursor-grab active:cursor-grabbing"
          onPointerDown={onSurfaceDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={onSurfaceDoubleClick}
          onContextMenu={onSurfaceContextMenu}
          style={{
            backgroundColor: '#ffffff',
            backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.12) 1px, transparent 1px)',
            backgroundSize: `${22 * zoom}px ${22 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        >
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#60a5fa" />
              </marker>
              <marker id="arrow-hover" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#0ea5e9" />
              </marker>
            </defs>
            {graph.edges.map((edge) => {
              const a = graph.nodes.find((n) => n.id === edge.from);
              const b = graph.nodes.find((n) => n.id === edge.to);
              if (!a || !b) return null;
              const ax = (a.x + a.width) * zoom + pan.x;
              const ay = (a.y + a.height / 2) * zoom + pan.y;
              const bx = b.x * zoom + pan.x;
              const by = (b.y + b.height / 2) * zoom + pan.y;
              const mx = (ax + bx) / 2;
              const d = `M ${ax} ${ay} C ${mx} ${ay}, ${mx} ${by}, ${bx} ${by}`;
              const hovered = hoverEdgeId === edge.id;
              return (
                <g
                  key={edge.id}
                  className="pointer-events-auto"
                  onPointerEnter={() => setHoverEdgeId(edge.id)}
                  onPointerLeave={() => setHoverEdgeId((id) => (id === edge.id ? null : id))}
                >
                  <path d={d} stroke="transparent" strokeWidth={16} fill="none" className="cursor-pointer" onClick={() => deleteEdge(edge.id)} />
                  <path
                    d={d}
                    stroke={hovered ? 'rgba(14,165,233,0.22)' : 'rgba(96,165,250,0.12)'}
                    strokeWidth={hovered ? 8 : 6}
                    fill="none"
                    className="transition-all duration-200"
                  />
                  <path
                    d={d}
                    stroke={hovered ? '#0ea5e9' : '#60a5fa'}
                    strokeWidth={hovered ? 2.5 : 2}
                    fill="none"
                    markerEnd={hovered ? 'url(#arrow-hover)' : 'url(#arrow)'}
                    className="transition-all duration-200"
                  />
                  {hovered && (() => {
                    const t = 0.5;
                    const px = (1 - t) ** 3 * ax + 3 * (1 - t) ** 2 * t * mx + 3 * (1 - t) * t ** 2 * mx + t ** 3 * bx;
                    const py = (1 - t) ** 3 * ay + 3 * (1 - t) ** 2 * t * ay + 3 * (1 - t) * t ** 2 * by + t ** 3 * by;
                    return (
                      <foreignObject x={px - 10} y={py - 10} width="20" height="20">
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteEdge(edge.id); }}
                          className="w-5 h-5 rounded-full bg-white border border-rose-500 text-rose-600 hover:bg-rose-500 hover:text-white flex items-center justify-center text-xs leading-none shadow-md"
                          title="删除连线"
                        >×</button>
                      </foreignObject>
                    );
                  })()}
                </g>
              );
            })}

            {/* 连线模式：正在拉的线 */}
            {linkingFrom && (() => {
              const src = graph.nodes.find((n) => n.id === linkingFrom);
              if (!src) return null;
              const ax = (src.x + src.width) * zoom + pan.x;
              const ay = (src.y + src.height / 2) * zoom + pan.y;
              const target = linkingHover ? graph.nodes.find((n) => n.id === linkingHover) : null;
              const bx = target ? target.x * zoom + pan.x : (linkingMouse ? linkingMouse.x : ax + 200);
              const by = target ? (target.y + target.height / 2) * zoom + pan.y : (linkingMouse ? linkingMouse.y : ay);
              const mx = (ax + bx) / 2;
              return (
                <>
                  <path
                    d={`M ${ax} ${ay} C ${mx} ${ay}, ${mx} ${by}, ${bx} ${by}`}
                    stroke="rgba(14,165,233,0.22)"
                    strokeWidth={6}
                    fill="none"
                    className="pointer-events-none"
                  />
                  <path
                    d={`M ${ax} ${ay} C ${mx} ${ay}, ${mx} ${by}, ${bx} ${by}`}
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    fill="none"
                    markerEnd="url(#arrow-hover)"
                    className="pointer-events-none"
                  />
                </>
              );
            })()}
          </svg>

          {graph.nodes.filter((n) => n.visible !== false).map((n) => (
            <CanvasNodeView
              key={n.id}
              node={n}
              zoom={zoom}
              pan={pan}
              isSel={n.id === selectedId}
              editingId={editingId}
              busy={busy}
              isLinkingFrom={linkingFrom === n.id}
              isLinkingHover={linkingFrom !== null && linkingHover === n.id}
              isDragging={drag?.id === n.id}
              isResizing={resize?.id === n.id}
              models={modelsFor(n.type, models)}
              edges={graph.edges}
              nodes={graph.nodes}
              onTitleDown={(e: any) => onTitleDown(e, n)}
              onBodyClick={(e: any) => onNodeBodyClick(e, n)}
              onResizeDown={(e: any) => onResizeDown(e, n)}
              onHover={() => onNodeHover(n)}
              onLeave={() => linkingFrom && setLinkingHover(null)}
              onUpdate={(patch: any) => updateNode(n.id, patch)}
              onUpdateGen={(patch: any) => updateGen(n.id, patch)}
              onRequestDelete={(nodeId: string, e?: React.MouseEvent) => requestDelete(nodeId, e)}
              onStartLink={() => setLinkingFrom(linkingFrom === n.id ? null : n.id)}
              onGenerate={(nodeId: string) => generateOne(nodeId)}
              onDeleteEdge={(edgeId: string) => deleteEdge(edgeId)}
              onConnectRef={(fromId: string, toId: string) => connectRef(fromId, toId)}
              onDisconnectRef={(edgeId: string) => disconnectRef(edgeId)}
              allNodes={graph.nodes}
            />
          ))}

          {linkingFrom && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-violet-600/90 text-white text-xs shadow-lg z-50">
              点击目标节点创建连线 · 按 ESC 取消
            </div>
          )}

          {/* 右键菜单 */}
          {ctxMenu && (
            <ContextMenu
              x={ctxMenu.x}
              y={ctxMenu.y}
              node={graph.nodes.find((n) => n.id === ctxMenu.nodeId)}
              onClose={() => setCtxMenu(null)}
              onCopy={() => duplicateNode(ctxMenu.nodeId)}
              onDelete={() => { setCtxMenu(null); requestDelete(ctxMenu.nodeId); }}
              onToggleLock={() => { const n = graph.nodes.find(x => x.id === ctxMenu.nodeId); if (n) updateNode(n.id, { locked: !n.locked }); setCtxMenu(null); }}
              onToggleHide={() => { const n = graph.nodes.find(x => x.id === ctxMenu.nodeId); if (n) updateNode(n.id, { visible: n.visible === false ? true : false }); setCtxMenu(null); }}
            />
          )}

          {/* 双击空白处的快速添加菜单 */}
          {quickAddAt && (
            <div
              className="absolute z-50"
              style={{
                left: quickAddAt.x * zoom + pan.x,
                top: quickAddAt.y * zoom + pan.y,
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="bg-white border border-neutral-200 rounded-lg shadow-2xl py-1 w-44">
                <button onClick={() => { addNode('image', quickAddAt.x, quickAddAt.y); setQuickAddAt(null); }} className="w-full px-3 py-2 text-left text-xs text-neutral-800 hover:bg-violet-600/20 hover:text-violet-300 flex items-center gap-2">
                  <ImageIcon size={13} /> 图片节点
                </button>
                <button onClick={() => { addNode('video', quickAddAt.x, quickAddAt.y); setQuickAddAt(null); }} className="w-full px-3 py-2 text-left text-xs text-neutral-800 hover:bg-violet-600/20 hover:text-violet-300 flex items-center gap-2">
                  <VideoIcon size={13} /> 视频节点
                </button>
                <button onClick={() => { addNode('editor', quickAddAt.x, quickAddAt.y); setQuickAddAt(null); }} className="w-full px-3 py-2 text-left text-xs text-neutral-800 hover:bg-violet-600/20 hover:text-violet-300 flex items-center gap-2">
                  <Pencil size={13} /> 图片编辑器
                </button>
                <button onClick={() => { addNode('text', quickAddAt.x, quickAddAt.y); setQuickAddAt(null); }} className="w-full px-3 py-2 text-left text-xs text-neutral-800 hover:bg-violet-600/20 hover:text-violet-300 flex items-center gap-2">
                  <TypeIcon size={13} /> 文本节点
                </button>
                <button onClick={() => setQuickAddAt(null)} className="w-full px-3 py-2 text-left text-xs text-neutral-500 hover:bg-neutral-100 border-t border-neutral-200 mt-1">
                  取消
                </button>
              </div>
            </div>
          )}

          {/* 删除确认弹窗 */}
          {deleteConfirm && (
            <div
              className="fixed z-[200]"
              style={{ left: deleteConfirm.x, top: deleteConfirm.y }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="bg-white border border-neutral-200 rounded-xl shadow-2xl px-4 py-3 w-52">
                <div className="text-[12px] text-neutral-800 font-medium mb-2">确认删除该节点？</div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={cancelDelete}
                    className="px-3 py-1 text-[11px] text-neutral-600 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={confirmDelete}
                    className="px-3 py-1 text-[11px] text-white bg-rose-500 hover:bg-rose-600 rounded-lg transition-colors"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <BottomToolbar zoom={zoom} setZoom={setZoom} onFit={fitView} />

        {notice && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-violet-600 border border-violet-500 text-xs text-white backdrop-blur">
            {notice}
          </div>
        )}
      </div>
    </div>
    </CanvasErrorBoundary>
  );
}

/** 错误边界：捕获子组件渲染异常，避免整页白屏 */
class CanvasErrorBoundary extends React.Component<{ children: React.ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(err: Error) { return { err: err.message + '\n' + (err.stack || '') }; }
  componentDidCatch(err: Error, info: any) {
    console.error('[CanvasErrorBoundary]', err, info);
  }
  render() {
    if (this.state.err) {
      return (
        <div className="h-full flex items-center justify-center p-6 text-rose-600 text-xs whitespace-pre-wrap font-mono max-w-2xl">
          <div>
            <div className="font-bold text-rose-300 mb-2">画布渲染失败</div>
            {this.state.err}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function LeftToolbar({ onAdd, onToggleSearch, activePanel, onPanelChange }: {
  onAdd: (t: CanvasNodeType) => void;
  onToggleSearch: () => void;
  activePanel: string | null;
  onPanelChange: (name: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (name: string) => onPanelChange(activePanel === name ? null : name);

  return (
    <div className="w-12 bg-neutral-100 border-r border-neutral-200 flex flex-col items-center pt-3 gap-1 shrink-0">
      <button
        onClick={() => navigate('/')}
        className="w-9 h-9 rounded-lg flex items-center justify-center text-neutral-600 hover:text-neutral-800 hover:bg-white transition-all mb-1"
        title="返回画布列表"
      >
        <Home size={16} />
      </button>
      <div className="relative" ref={wrapRef}>
        <button
          onClick={() => setOpen((v) => !v)}
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
            open ? 'bg-violet-600 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
          }`}
          title="添加节点"
        >
          <Plus size={16} />
        </button>
        {open && (
          <div className="absolute left-12 top-0 ml-2 w-44 bg-white border border-neutral-200 rounded-lg shadow-2xl py-1 z-50">
            <button onClick={() => { onAdd('image'); setOpen(false); }} className="w-full px-3 py-2 text-left text-xs text-neutral-800 hover:bg-violet-600/20 hover:text-violet-300 flex items-center gap-2 transition-colors">
              <ImageIcon size={13} /> 图片节点
            </button>
            <button onClick={() => { onAdd('video'); setOpen(false); }} className="w-full px-3 py-2 text-left text-xs text-neutral-800 hover:bg-violet-600/20 hover:text-violet-300 flex items-center gap-2 transition-colors">
              <VideoIcon size={13} /> 视频节点
            </button>
            <button onClick={() => { onAdd('editor'); setOpen(false); }} className="w-full px-3 py-2 text-left text-xs text-neutral-800 hover:bg-violet-600/20 hover:text-violet-300 flex items-center gap-2 transition-colors">
              <Pencil size={13} /> 图片编辑器
            </button>
            <button onClick={() => { onAdd('text'); setOpen(false); }} className="w-full px-3 py-2 text-left text-xs text-neutral-800 hover:bg-violet-600/20 hover:text-violet-300 flex items-center gap-2 transition-colors">
              <TypeIcon size={13} /> 文本节点
            </button>
          </div>
        )}
      </div>
      <ToolBtn icon={Search} title="搜索" active={false} onClick={onToggleSearch} />
      <div className="w-6 border-t border-neutral-200 my-0.5" />
      <ToolBtn icon={Layers} title="模板库" active={activePanel === 'templates'} onClick={() => toggle('templates')} />
      <ToolBtn icon={Package} title="资产库" active={activePanel === 'assets'} onClick={() => toggle('assets')} />
      <ToolBtn icon={Zap} title="技能库" active={activePanel === 'skills'} onClick={() => toggle('skills')} />
      <div className="w-6 border-t border-neutral-200 my-0.5" />
      <ToolBtn icon={Clock} title="历史" active={activePanel === 'history'} onClick={() => toggle('history')} />
      <ToolBtn icon={MessageSquare} title="Agent 聊天" active={activePanel === 'agent'} onClick={() => toggle('agent')} />
      <div className="w-6 border-t border-neutral-200 my-0.5" />
      <ToolBtn icon={SettingsIcon} title="设置" active={activePanel === 'settings'} onClick={() => toggle('settings')} />
    </div>
  );
}

function ToolBtn({ icon: Icon, title, active, onClick }: { icon: any; title: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
        active ? 'bg-violet-600 text-white' : 'text-neutral-600 hover:text-neutral-800 hover:bg-white'
      }`}
    >
      <Icon size={16} />
    </button>
  );
}

/* ─── Panel shell helper ─── */
function PanelShell({ title, width, onClose, children }: { title: string; width?: number; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className={`h-full bg-white border-r border-neutral-200 shadow-2xl flex flex-col`} style={{ width: width || 280 }}>
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-neutral-100 shrink-0">
        <span className="text-[13px] font-semibold text-neutral-800">{title}</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-neutral-100 text-neutral-400"><X size={14} /></button>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

/* ─── 模板库面板 ─── */
function TemplatesPanel({ onUse, onCreate, onClose }: {
  canvasId: string;
  onUse: (id: string) => void;
  onCreate: (body: { name?: string; description?: string; category?: string; tags?: string[] }) => void;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', category: '', tags: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await templatesApi.list(category || undefined, keyword || undefined);
      setTemplates(list);
    } finally { setLoading(false); }
  }, [keyword, category]);

  useEffect(() => { load(); }, [load]);

  const categories = ['全部', '短视频', '产品图', '艺术风格', '人像', '其他'];

  return (
    <PanelShell title="模板库" onClose={onClose}>
      <div className="p-3 space-y-3">
        <button onClick={() => setShowCreate(!showCreate)} className="w-full px-3 py-2 text-[12px] text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-lg transition-colors flex items-center justify-center gap-1.5">
          <Save size={13} /> 从当前画布创建
        </button>

        {showCreate && (
          <div className="p-2.5 bg-neutral-50 rounded-lg space-y-2 border border-neutral-200">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="模板名称" className="w-full px-2.5 py-1.5 text-[12px] border border-neutral-200 rounded-lg bg-white outline-none focus:border-violet-400" />
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="描述（可选）" className="w-full px-2.5 py-1.5 text-[12px] border border-neutral-200 rounded-lg bg-white outline-none focus:border-violet-400" />
            <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="分类（如：短视频）" className="w-full px-2.5 py-1.5 text-[12px] border border-neutral-200 rounded-lg bg-white outline-none focus:border-violet-400" />
            <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="标签（逗号分隔）" className="w-full px-2.5 py-1.5 text-[12px] border border-neutral-200 rounded-lg bg-white outline-none focus:border-violet-400" />
            <button onClick={() => { onCreate({ name: form.name || '未命名模板', description: form.description, category: form.category, tags: form.tags.split(',').map(t => t.trim()).filter(Boolean) }); setShowCreate(false); setForm({ name: '', description: '', category: '', tags: '' }); }} className="w-full px-3 py-1.5 text-[12px] text-white bg-violet-600 hover:bg-violet-700 rounded-lg">创建</button>
          </div>
        )}

        <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索模板…" className="w-full px-2.5 py-1.5 text-[12px] border border-neutral-200 rounded-lg outline-none focus:border-violet-400" />

        <div className="flex gap-1 flex-wrap">
          {categories.map((c) => (
            <button key={c} onClick={() => setCategory(c === '全部' ? '' : c)} className={`px-2 py-0.5 text-[11px] rounded-full transition-colors ${category === (c === '全部' ? '' : c) ? 'bg-violet-600 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>{c}</button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 size={18} className="animate-spin text-neutral-400" /></div>
        ) : templates.length === 0 ? (
          <div className="text-center py-8 text-[12px] text-neutral-400">暂无模板</div>
        ) : (
          <div className="space-y-2">
            {templates.map((t: any) => (
              <div key={t.id} className="group border border-neutral-200 rounded-lg overflow-hidden hover:border-violet-300 transition-colors">
                {t.thumbnail && <img src={t.thumbnail} alt="" className="w-full h-28 object-cover" />}
                <div className="p-2">
                  <div className="text-[12px] font-medium text-neutral-800 truncate">{t.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    {t.category && <span className="text-[10px] px-1.5 py-0.5 bg-neutral-100 text-neutral-500 rounded">{t.category}</span>}
                    <span className="text-[10px] text-neutral-400">使用 {t.usageCount}</span>
                  </div>
                  <button onClick={() => onUse(t.id)} className="mt-2 w-full px-2 py-1 text-[11px] text-violet-600 bg-violet-50 hover:bg-violet-100 rounded transition-colors">使用模板</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PanelShell>
  );
}

/* ─── 资产库面板 ─── */
function AssetsPanel({ onUse, onClose }: {
  onUse: (asset: { id: string; url: string; type: string; name: string }) => void;
  onClose: () => void;
}) {
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({ name: '', type: 'CHARACTER' as AssetType, description: '' });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const types = [
    { key: '', label: '全部' },
    { key: 'CHARACTER', label: '角色' },
    { key: 'PRODUCT', label: '产品' },
    { key: 'STYLE', label: '风格' },
    { key: 'REFERENCE', label: '参考' },
  ];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await assetsApi.list(typeFilter || undefined, keyword || undefined);
      setAssets(list);
    } finally { setLoading(false); }
  }, [typeFilter, keyword]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async () => {
    if (!selectedFile || !uploadForm.name) return;
    setUploading(true);
    try {
      const { url } = await uploadApi.image(selectedFile);
      await assetsApi.create({ name: uploadForm.name, type: uploadForm.type, url, description: uploadForm.description });
      setShowUpload(false);
      setSelectedFile(null);
      setUploadForm({ name: '', type: 'CHARACTER', description: '' });
      load();
    } finally { setUploading(false); }
  };

  return (
    <PanelShell title="资产库" onClose={onClose}>
      <div className="p-3 space-y-3">
        <button onClick={() => setShowUpload(!showUpload)} className="w-full px-3 py-2 text-[12px] text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-lg transition-colors flex items-center justify-center gap-1.5">
          <Upload size={13} /> 上传资产
        </button>

        {showUpload && (
          <div className="p-2.5 bg-neutral-50 rounded-lg space-y-2 border border-neutral-200">
            <input value={uploadForm.name} onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })} placeholder="资产名称" className="w-full px-2.5 py-1.5 text-[12px] border border-neutral-200 rounded-lg bg-white outline-none focus:border-violet-400" />
            <select value={uploadForm.type} onChange={(e) => setUploadForm({ ...uploadForm, type: e.target.value as AssetType })} className="w-full px-2.5 py-1.5 text-[12px] border border-neutral-200 rounded-lg bg-white outline-none focus:border-violet-400">
              <option value="CHARACTER">角色</option>
              <option value="PRODUCT">产品</option>
              <option value="STYLE">风格</option>
              <option value="REFERENCE">参考</option>
            </select>
            <input value={uploadForm.description} onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })} placeholder="描述（可选）" className="w-full px-2.5 py-1.5 text-[12px] border border-neutral-200 rounded-lg bg-white outline-none focus:border-violet-400" />
            <input ref={fileRef} type="file" accept="image/*,video/*" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} className="w-full text-[11px] text-neutral-600" />
            <button onClick={handleUpload} disabled={uploading || !selectedFile || !uploadForm.name} className="w-full px-3 py-1.5 text-[12px] text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-50">{uploading ? '上传中…' : '上传'}</button>
          </div>
        )}

        <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索资产…" className="w-full px-2.5 py-1.5 text-[12px] border border-neutral-200 rounded-lg outline-none focus:border-violet-400" />

        <div className="flex gap-1 flex-wrap">
          {types.map((t) => (
            <button key={t.key} onClick={() => setTypeFilter(t.key)} className={`px-2 py-0.5 text-[11px] rounded-full transition-colors ${typeFilter === t.key ? 'bg-violet-600 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>{t.label}</button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 size={18} className="animate-spin text-neutral-400" /></div>
        ) : assets.length === 0 ? (
          <div className="text-center py-8 text-[12px] text-neutral-400">暂无资产</div>
        ) : (
          <div className="space-y-2">
            {assets.map((a: any) => (
              <div key={a.id} className="group flex items-center gap-2 p-2 border border-neutral-200 rounded-lg hover:border-violet-300 transition-colors">
                {a.thumbnail || a.url ? (
                  <img src={a.thumbnail || a.url} alt="" className="w-12 h-12 rounded object-cover shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded bg-neutral-100 flex items-center justify-center shrink-0"><Package size={16} className="text-neutral-400" /></div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-neutral-800 truncate">{a.name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] px-1.5 py-0.5 bg-neutral-100 text-neutral-500 rounded">{a.type}</span>
                    <span className="text-[10px] text-neutral-400">使用 {a.usageCount}</span>
                  </div>
                </div>
                <button onClick={() => onUse({ id: a.id, url: a.url, type: a.type, name: a.name })} className="px-2 py-1 text-[11px] text-violet-600 bg-violet-50 hover:bg-violet-100 rounded transition-colors shrink-0">使用</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </PanelShell>
  );
}

/* ─── 技能库面板 ─── */
function SkillsPanel({ onUse, onClose }: {
  canvasId: string;
  onUse: (skillId: string) => void;
  onClose: () => void;
}) {
  const [skills, setSkills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await skillsApi.list(categoryFilter || undefined, undefined, 1, 50);
      setSkills(res.list);
    } finally { setLoading(false); }
  }, [categoryFilter]);

  useEffect(() => { load(); }, [load]);

  const categories = [
    { key: '', label: '全部' },
    { key: 'OFFICIAL', label: '官方' },
    { key: 'CUSTOM', label: '自定义' },
  ];

  const typeLabel = (t: string) => t === 'IMAGE' ? '图片' : t === 'VIDEO' ? '视频' : '工作流';
  const typeColor = (t: string) => t === 'IMAGE' ? 'bg-sky-50 text-sky-600' : t === 'VIDEO' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600';

  return (
    <PanelShell title="技能库" onClose={onClose}>
      <div className="p-3 space-y-3">
        <div className="flex gap-1">
          {categories.map((c) => (
            <button key={c.key} onClick={() => setCategoryFilter(c.key)} className={`px-2 py-0.5 text-[11px] rounded-full transition-colors ${categoryFilter === c.key ? 'bg-violet-600 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>{c.label}</button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 size={18} className="animate-spin text-neutral-400" /></div>
        ) : skills.length === 0 ? (
          <div className="text-center py-8 text-[12px] text-neutral-400">
            暂无技能
            <button onClick={() => skillsApi.seed().then(load)} className="block mx-auto mt-2 text-[11px] text-violet-600 hover:underline">初始化官方技能</button>
          </div>
        ) : (
          <div className="space-y-2">
            {skills.map((s: any) => (
              <div key={s.id} className="p-2.5 border border-neutral-200 rounded-lg hover:border-violet-300 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium text-neutral-800">{s.name}</div>
                    {s.description && <div className="text-[11px] text-neutral-500 mt-0.5 line-clamp-2">{s.description}</div>}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${typeColor(s.type)}`}>{typeLabel(s.type)}</span>
                      <span className="text-[10px] text-neutral-400">使用 {s.usageCount}</span>
                    </div>
                  </div>
                  <button onClick={() => onUse(s.id)} className="px-2 py-1 text-[11px] text-violet-600 bg-violet-50 hover:bg-violet-100 rounded transition-colors shrink-0 ml-2">
                    <Play size={11} className="inline mr-0.5" />使用
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PanelShell>
  );
}

/* ─── 历史记录面板 ─── */
function HistoryPanel({ graph, onRestore, onNavigateNode, onClose }: {
  graph: CanvasGraph;
  onRestore: (nodeId: string, resultUrl: string) => void;
  onNavigateNode: (nodeId: string) => void;
  onClose: () => void;
}) {
  const [filterNode, setFilterNode] = useState('');

  type HistoryEntry = { nodeId: string; nodeTitle: string; url: string; prompt: string; time: string };
  const entries: HistoryEntry[] = graph.nodes
    .flatMap((n) =>
      (n.versions || []).map((v: any) => ({
        nodeId: n.id,
        nodeTitle: n.title || n.type,
        url: v.resultUrl,
        prompt: v.prompt || '',
        time: v.createdAt,
      }))
    )
    .filter((e: HistoryEntry) => !filterNode || e.nodeId === filterNode)
    .sort((a: HistoryEntry, b: HistoryEntry) => new Date(b.time).getTime() - new Date(a.time).getTime());

  const nodesWithVersions = graph.nodes.filter((n) => (n.versions || []).length > 0);

  return (
    <PanelShell title="历史记录" onClose={onClose}>
      <div className="p-3 space-y-3">
        {nodesWithVersions.length > 1 && (
          <select value={filterNode} onChange={(e) => setFilterNode(e.target.value)} className="w-full px-2.5 py-1.5 text-[12px] border border-neutral-200 rounded-lg outline-none focus:border-violet-400 bg-white">
            <option value="">全部节点</option>
            {nodesWithVersions.map((n) => (
              <option key={n.id} value={n.id}>{n.title || n.type}</option>
            ))}
          </select>
        )}

        {entries.length === 0 ? (
          <div className="text-center py-8 text-[12px] text-neutral-400">暂无生成历史</div>
        ) : (
          <div className="space-y-1.5">
            {entries.map((e: HistoryEntry, i: number) => (
              <div key={`${e.nodeId}-${i}`} className="group flex items-center gap-2 p-2 rounded-lg hover:bg-neutral-50 transition-colors">
                {e.url ? (
                  <img src={e.url} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded bg-neutral-100 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-neutral-800 font-medium truncate">{e.nodeTitle}</div>
                  <div className="text-[10px] text-neutral-400 truncate">{e.prompt || '无 prompt'}</div>
                  <div className="text-[10px] text-neutral-300">{new Date(e.time).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => onNavigateNode(e.nodeId)} className="p-1 rounded hover:bg-neutral-200 text-neutral-500" title="定位节点"><Eye size={12} /></button>
                  <button onClick={() => onRestore(e.nodeId, e.url)} className="p-1 rounded hover:bg-violet-100 text-violet-500" title="恢复此版本"><RotateCcw size={12} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PanelShell>
  );
}

/* ─── Agent 聊天面板 ─── */
function AgentPanel({ onCreateTask, onClose }: {
  canvasId: string;
  onCreateTask: (vision: string) => void;
  onClose: () => void;
}) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [activeTask, setActiveTask] = useState<any>(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await agentApi.list(1, 20);
      setTasks(res.list);
      if (!activeTask && res.list.length > 0) setActiveTask(res.list[0]);
    } finally { setLoading(false); }
  }, [activeTask]);

  useEffect(() => { loadTasks(); }, []);

  useEffect(() => {
    if (!activeTask || activeTask.status === 'COMPLETED' || activeTask.status === 'FAILED') return;
    const timer = setInterval(async () => {
      try {
        const detail = await agentApi.detail(activeTask.id);
        setActiveTask(detail);
        setTasks((prev) => prev.map((t) => t.id === detail.id ? detail : t));
      } catch {}
    }, 2000);
    return () => clearInterval(timer);
  }, [activeTask?.id, activeTask?.status]);

  const handleSend = async () => {
    if (!input.trim()) return;
    setCreating(true);
    try {
      await onCreateTask(input.trim());
      setInput('');
      await loadTasks();
    } finally { setCreating(false); }
  };

  const statusLabel = (s: string) => {
    const map: Record<string, string> = {
      PLANNING: '规划中', WRITING_SCRIPT: '编写剧本', PREDICTING_SHOTS: '预测分镜',
      GENERATING: '生成中', COMPLETED: '已完成', FAILED: '失败',
    };
    return map[s] || s;
  };

  const statusIcon = (s: string) => {
    if (s === 'COMPLETED') return '✓';
    if (s === 'FAILED') return '✗';
    return '⏳';
  };

  return (
    <PanelShell title="Agent 聊天" width={320} onClose={onClose}>
      <div className="flex flex-col h-full">
        {tasks.length > 0 && (
          <div className="px-3 py-2 border-b border-neutral-100 shrink-0">
            <div className="flex gap-1 overflow-x-auto">
              {tasks.map((t: any) => (
                <button key={t.id} onClick={() => setActiveTask(t)} className={`px-2 py-0.5 text-[10px] rounded-full whitespace-nowrap transition-colors ${activeTask?.id === t.id ? 'bg-violet-600 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>
                  {statusIcon(t.status)} {t.vision.slice(0, 10)}…
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 size={18} className="animate-spin text-neutral-400" /></div>
          ) : activeTask ? (
            <>
              <div className="p-2.5 bg-neutral-50 rounded-lg border border-neutral-200">
                <div className="text-[10px] text-neutral-400 mb-1">意图</div>
                <div className="text-[12px] text-neutral-800">{activeTask.vision}</div>
              </div>

              <div className="space-y-2">
                <div className={`p-2.5 rounded-lg border ${activeTask.status === 'COMPLETED' ? 'bg-emerald-50 border-emerald-200' : activeTask.status === 'FAILED' ? 'bg-rose-50 border-rose-200' : 'bg-sky-50 border-sky-200'}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[11px]">{statusIcon(activeTask.status)}</span>
                    <span className="text-[11px] font-medium">{statusLabel(activeTask.status)}</span>
                  </div>
                  {activeTask.status !== 'COMPLETED' && activeTask.status !== 'FAILED' && (
                    <div className="w-full bg-neutral-200 rounded-full h-1.5 mt-1.5">
                      <div className="bg-violet-500 h-1.5 rounded-full transition-all" style={{ width: `${activeTask.progress}%` }} />
                    </div>
                  )}
                  {activeTask.errorMsg && <div className="text-[11px] text-rose-600 mt-1">{activeTask.errorMsg}</div>}
                </div>
              </div>

              {activeTask.resultUrls && activeTask.resultUrls.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] text-neutral-500">生成结果</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {activeTask.resultUrls.map((url: string, i: number) => (
                      <img key={i} src={url} alt="" className="w-full rounded-lg object-cover aspect-square" />
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-[12px] text-neutral-400">
              描述你的创作意图<br />Agent 会自动规划并生成内容
            </div>
          )}
        </div>

        <div className="p-3 border-t border-neutral-100 shrink-0">
          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="描述你的创作意图…"
              className="flex-1 px-2.5 py-1.5 text-[12px] border border-neutral-200 rounded-lg outline-none focus:border-violet-400"
            />
            <button onClick={handleSend} disabled={creating || !input.trim()} className="p-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors">
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>
    </PanelShell>
  );
}

/* ─── 画布设置面板 ─── */
function SettingsPanel({ canvasId, canvasName, onUpdate, onCreateTemplate, onClose }: {
  canvasId: string;
  canvasName: string;
  onUpdate: (settings: Record<string, any>) => void;
  onCreateTemplate: (body: { name?: string; description?: string; category?: string; tags?: string[] }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(canvasName || '');
  const [defaultModel, setDefaultModel] = useState('minimax-image');
  const [defaultRatio, setDefaultRatio] = useState('1024x1024');
  const [defaultCount, setDefaultCount] = useState(1);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [tplForm, setTplForm] = useState({ name: '', description: '', category: '', tags: '' });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    onUpdate({ name, defaultModel, defaultRatio, defaultCount });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleExport = () => {
    canvasApi.getGraph(canvasId).then((graph) => {
      const blob = new Blob([JSON.stringify(graph, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `canvas-${canvasId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const ratios = ['1024x1024', '1024x1792', '1792x1024', '768x1024', '1024x768'];

  return (
    <PanelShell title="画布设置" onClose={onClose}>
      <div className="p-3 space-y-4">
        <div>
          <label className="text-[11px] text-neutral-500 mb-1 block">画布名称</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-2.5 py-1.5 text-[12px] border border-neutral-200 rounded-lg outline-none focus:border-violet-400" />
        </div>

        <div>
          <label className="text-[11px] text-neutral-500 mb-1 block">默认模型</label>
          <select value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)} className="w-full px-2.5 py-1.5 text-[12px] border border-neutral-200 rounded-lg outline-none focus:border-violet-400 bg-white">
            <option value="minimax-image">MiniMax Image</option>
            <option value="minimax-video">MiniMax Video</option>
            <option value="tokenplan-image">TokenPlan Image</option>
          </select>
        </div>

        <div>
          <label className="text-[11px] text-neutral-500 mb-1 block">默认比例</label>
          <div className="flex gap-1 flex-wrap">
            {ratios.map((r) => (
              <button key={r} onClick={() => setDefaultRatio(r)} className={`px-2 py-1 text-[11px] rounded transition-colors ${defaultRatio === r ? 'bg-violet-600 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>{r.replace('x', ':')}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[11px] text-neutral-500 mb-1 block">默认生成数量</label>
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((n) => (
              <button key={n} onClick={() => setDefaultCount(n)} className={`w-8 h-8 text-[12px] rounded-lg transition-colors ${defaultCount === n ? 'bg-violet-600 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>{n}</button>
            ))}
          </div>
        </div>

        <button onClick={handleSave} className={`w-full px-3 py-2 text-[12px] rounded-lg transition-colors ${saved ? 'bg-emerald-500 text-white' : 'bg-violet-600 text-white hover:bg-violet-700'}`}>
          {saved ? '已保存' : '保存设置'}
        </button>

        <div className="border-t border-neutral-100 pt-3 space-y-2">
          <button onClick={() => setShowTemplateForm(!showTemplateForm)} className="w-full px-3 py-2 text-[12px] text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-lg transition-colors flex items-center justify-center gap-1.5">
            <Save size={13} /> 保存为模板
          </button>

          {showTemplateForm && (
            <div className="p-2.5 bg-neutral-50 rounded-lg space-y-2 border border-neutral-200">
              <input value={tplForm.name} onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })} placeholder="模板名称" className="w-full px-2.5 py-1.5 text-[12px] border border-neutral-200 rounded-lg bg-white outline-none focus:border-violet-400" />
              <input value={tplForm.description} onChange={(e) => setTplForm({ ...tplForm, description: e.target.value })} placeholder="描述（可选）" className="w-full px-2.5 py-1.5 text-[12px] border border-neutral-200 rounded-lg bg-white outline-none focus:border-violet-400" />
              <input value={tplForm.category} onChange={(e) => setTplForm({ ...tplForm, category: e.target.value })} placeholder="分类" className="w-full px-2.5 py-1.5 text-[12px] border border-neutral-200 rounded-lg bg-white outline-none focus:border-violet-400" />
              <input value={tplForm.tags} onChange={(e) => setTplForm({ ...tplForm, tags: e.target.value })} placeholder="标签（逗号分隔）" className="w-full px-2.5 py-1.5 text-[12px] border border-neutral-200 rounded-lg bg-white outline-none focus:border-violet-400" />
              <button onClick={() => { onCreateTemplate({ name: tplForm.name || '未命名模板', description: tplForm.description, category: tplForm.category, tags: tplForm.tags.split(',').map(t => t.trim()).filter(Boolean) }); setShowTemplateForm(false); setTplForm({ name: '', description: '', category: '', tags: '' }); }} className="w-full px-3 py-1.5 text-[12px] text-white bg-violet-600 hover:bg-violet-700 rounded-lg">创建模板</button>
            </div>
          )}

          <button onClick={handleExport} className="w-full px-3 py-2 text-[12px] text-neutral-600 bg-neutral-50 hover:bg-neutral-100 rounded-lg transition-colors flex items-center justify-center gap-1.5">
            <Download size={13} /> 导出 JSON
          </button>
        </div>
      </div>
    </PanelShell>
  );
}

function BottomToolbar({ zoom, setZoom, onFit }: { zoom: number; setZoom: (z: number | ((p: number) => number)) => void; onFit: () => void }) {
  return (
    <div className="absolute bottom-4 left-4 flex items-center gap-1.5 z-10">
      <ToolChip icon={Map} />
      <ToolChip icon={SettingsIcon} />
      <ToolChip icon={Grid3x3} />
      <ToolChip icon={Eye} />
      <div className="ml-1 flex items-center gap-2 px-3 py-1.5 bg-white/90 border border-neutral-200 rounded-full backdrop-blur">
        <input
          type="range"
          min={0.3}
          max={2}
          step={0.05}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-20 accent-violet-500"
        />
        <span className="text-[10px] text-neutral-600 w-7 text-center font-mono">{Math.round(zoom * 100)}%</span>
        <button onClick={onFit} className="ml-0.5 text-neutral-600 hover:text-neutral-900" title="适应视图 (F)">
          <ArrowUp size={10} className="-rotate-45" />
        </button>
      </div>
      <ToolChip icon={HelpCircle} />
    </div>
  );
}

function ToolChip({ icon: Icon }: { icon: any }) {
  return (
    <button className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-600 hover:text-neutral-800 bg-white/90 border border-neutral-200 hover:border-neutral-200 backdrop-blur transition-all">
      <Icon size={13} />
    </button>
  );
}

function CanvasNodeView({ node, zoom, pan, isSel, editingId, busy, isLinkingFrom, isLinkingHover, isDragging, models, edges, nodes, allNodes, onTitleDown, onBodyClick, onResizeDown, onHover, onLeave, onUpdate, onUpdateGen, onRequestDelete, onStartLink, onGenerate, onDeleteEdge, onConnectRef }: any) {
  const left = node.x * zoom + pan.x;
  const top = node.y * zoom + pan.y;
  const w = node.width * zoom;
  const h = node.height * zoom;
  const isGenerating = node.status === 'generating';

  // 连线模式下，所有非源节点都可作为目标（高亮）
  const canLinkTarget = isLinkingFrom !== undefined;
  const ringClass = isGenerating
    ? 'ring-2 ring-violet-400 animate-pulse'
    : isSel
    ? 'ring-1 ring-violet-500/50'
    : isLinkingFrom
    ? 'ring-2 ring-violet-500'
    : isLinkingHover
    ? 'ring-2 ring-violet-400'
    : canLinkTarget
    ? 'hover:ring-1 hover:ring-neutral-500'
    : 'hover:ring-1 hover:ring-neutral-700';

  if (node.type === 'image')
    return (
      <>
        <ImageNode
          node={node} left={left} top={top} width={w} height={h}
          isSel={isSel} models={models}
          onTitleDown={onTitleDown} onBodyClick={onBodyClick} onResizeDown={onResizeDown}
          onHover={onHover} onLeave={onLeave}
          onUpdate={onUpdate} onUpdateGen={onUpdateGen}
          onRequestDelete={onRequestDelete}
          onStartLink={onStartLink} ringClass={ringClass}
          isDragging={isDragging} isGenerating={isGenerating}
        />
        {isSel && !isLinkingFrom && (
          <PromptPanel
            node={node}
            autoFocus={editingId === node.id}
            busy={busy && node.status === 'generating'}
            anchorCx={(node.x + node.width / 2) * zoom + pan.x}
            anchorTop={(node.y + node.height + 16) * zoom + pan.y}
            nodeWidth={w}
            models={models}
            edges={edges}
            nodes={nodes}
            allNodes={allNodes}
            onUpdateGen={(patch: any) => onUpdateGen(patch)}
            onGenerate={() => onGenerate(node.id)}
            onDeleteEdge={(edgeId: string) => onDeleteEdge(edgeId)}
            onConnectRef={(fromId: string, toId: string) => onConnectRef(fromId, toId)}
          />
        )}
      </>
    );
  if (node.type === 'video')
    return (
      <>
        <VideoNode node={node} left={left} top={top} width={w} height={h} isSel={isSel} models={models} onTitleDown={onTitleDown} onBodyClick={onBodyClick} onHover={onHover} onLeave={onLeave} onUpdate={onUpdate} onUpdateGen={onUpdateGen} onRequestDelete={onRequestDelete} onStartLink={onStartLink} ringClass={ringClass} isDragging={isDragging} isGenerating={isGenerating} />
        {isSel && !isLinkingFrom && (
          <PromptPanel
            node={node}
            autoFocus={editingId === node.id}
            busy={busy && node.status === 'generating'}
            anchorCx={(node.x + node.width / 2) * zoom + pan.x}
            anchorTop={(node.y + node.height + 16) * zoom + pan.y}
            nodeWidth={w}
            models={models}
            edges={edges}
            nodes={nodes}
            allNodes={allNodes}
            onUpdateGen={(patch: any) => onUpdateGen(patch)}
            onGenerate={() => onGenerate(node.id)}
            onDeleteEdge={(edgeId: string) => onDeleteEdge(edgeId)}
            onConnectRef={(fromId: string, toId: string) => onConnectRef(fromId, toId)}
          />
        )}
      </>
    );
  if (node.type === 'editor')
    return <EditorNode node={node} left={left} top={top} width={w} height={h} isSel={isSel} onTitleDown={onTitleDown} onBodyClick={onBodyClick} onHover={onHover} onLeave={onLeave} onUpdate={onUpdate} onRequestDelete={onRequestDelete} onStartLink={onStartLink} ringClass={ringClass} isDragging={isDragging} />;
  if (node.type === 'text')
    return <TextNodeLite node={node} left={left} top={top} width={w} height={h} isSel={isSel} onTitleDown={onTitleDown} onBodyClick={onBodyClick} onUpdate={onUpdate} onRequestDelete={onRequestDelete} />;
  return <MediaNodeLite node={node} left={left} top={top} width={w} height={h} isSel={isSel} onTitleDown={onTitleDown} onUpdate={onUpdate} onRequestDelete={onRequestDelete} />;
}

/**
 * 独立 prompt 面板：贴附在选中节点正下方，宽度大于节点（更宽更醒目）。
 * 不随节点一起被拖动——是画布级浮动面板，由选中状态触发。
 */
function PromptPanel({ node, anchorCx, anchorTop, nodeWidth, models, edges, nodes, allNodes, onUpdateGen, autoFocus, busy, onGenerate, onDeleteEdge, onConnectRef }: any) {
  const gen = node.gen || { model: DEFAULT_MODEL, prompt: '', aspectRatio: '1024x1024', count: 1 };
  const modelInfo = models.find((m: AIModel) => m.id === gen.model);
  const credits = (modelInfo?.creditCostPerImage ?? 5) * (gen.count || 1);

  // 解析 incoming edges 获取参考图片
  const incomingEdges = edges?.filter((e: any) => e.to === node.id) || [];
  const references = incomingEdges
    .map((edge: any) => {
      const sourceNode = nodes?.find((n: any) => n.id === edge.from);
      return { edge, sourceNode };
    })
    .filter((ref: any) => ref.sourceNode?.resultUrl);

  // 面板宽度：节点宽度的 2.1 倍，但最小 720、最大 900
  const panelW = Math.max(720, Math.min(900, Math.round(nodeWidth * 2.1)));
  const inputRef = useRef<HTMLInputElement>(null);

  // 计算视口坐标并钳制，确保面板不超出屏幕；空间不足时翻转到节点上方
  const [panelPos, setPanelPos] = useState({ left: 0, top: 0 });
  const [flipAbove, setFlipAbove] = useState(false);
  const panelH = references.length > 0 ? 150 : 110;
  useEffect(() => {
    const surface = document.querySelector('[data-canvas-surface]') as HTMLElement | null;
    const sRect = surface?.getBoundingClientRect();
    const vx = sRect ? sRect.left + anchorCx : anchorCx;
    const vy = sRect ? sRect.top + anchorTop : anchorTop;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clampedLeft = Math.max(8, Math.min(vx - panelW / 2, vw - panelW - 8));
    const spaceBelow = vh - vy;
    const above = spaceBelow < panelH + 16;
    setFlipAbove(above);
    setPanelPos({ left: clampedLeft, top: above ? Math.max(8, vy - panelH - 8) : vy });
  }, [anchorCx, anchorTop, panelW, panelH, references.length]);

  // 双击节点时 autoFocus 到输入框
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [autoFocus]);

  return (
    <div
      className="fixed z-50"
      style={{
        left: panelPos.left,
        top: panelPos.top,
        width: panelW,
      }}
      // 阻断 pointer 事件冒泡到画布 surface，避免拖选文本时被当成画布平移
      onPointerDown={(e) => { e.stopPropagation(); }}
      onPointerMove={(e) => { e.stopPropagation(); }}
      onPointerUp={(e) => { e.stopPropagation(); }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 连接线：面板在下方时线在上方，面板在上方时线在下方 */}
      {!flipAbove && <div className="mx-auto w-px h-3 bg-neutral-300" />}

      <div className="bg-white border border-neutral-200 rounded-xl shadow-2xl px-4 py-3">
        {/* 参考图片区 */}
        {references.length > 0 && (
          <div className="flex items-center gap-2 mb-3" data-no-drag>
            <span className="text-[11px] text-neutral-500 shrink-0">参考:</span>
            <div className="flex items-center gap-2 overflow-x-auto">
              {references.map((ref: any, idx: number) => (
                <div key={idx} className="relative shrink-0 group">
                  <img
                    src={ref.sourceNode.resultUrl}
                    alt={`参考 ${idx + 1}`}
                    className="w-12 h-12 rounded-lg object-cover border border-neutral-200"
                  />
                  <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-neutral-500 text-white text-[9px] flex items-center justify-center">
                    {idx + 1}
                  </div>
                  <button
                    onClick={() => onDeleteEdge(ref.edge.id)}
                    className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity"
                    title="删除参考"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* prompt 输入区 */}
        <div className="flex items-center gap-2 mb-3" data-no-drag>
          <button className="p-1.5 rounded-md hover:bg-neutral-100 text-violet-600 shrink-0" title="润色">
            <Sparkles size={13} />
          </button>
          <input
            ref={inputRef}
            value={gen.prompt}
            onChange={(e) => onUpdateGen({ prompt: e.target.value })}
            placeholder="描述任何你想要生成的内容"
            className="flex-1 bg-transparent outline-none text-[13px] text-neutral-800 placeholder-neutral-400 min-w-0"
          />
          <ReferencePicker
            currentNodeId={node.id}
            allNodes={allNodes}
            edges={edges}
            onConnect={(fromId: string) => onConnectRef(fromId, node.id)}
            onDisconnect={(edgeId: string) => onDeleteEdge(edgeId)}
          />
        </div>

        {/* 模型 / 比例 / 数量 / 积分 / 生成 */}
        <div className="flex items-center justify-between text-[11px] text-neutral-600" data-no-drag>
          <div className="flex items-center gap-3 min-w-0">
            <select
              value={gen.model}
              onChange={(e) => onUpdateGen({ model: e.target.value })}
              className="bg-transparent text-neutral-800 font-medium outline-none cursor-pointer max-w-[180px] min-w-[80px] h-5 text-[11px] leading-5"
            >
              {models.map((m: AIModel) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <span className="text-neutral-700">|</span>
            <select
              value={gen.aspectRatio}
              onChange={(e) => onUpdateGen({ aspectRatio: e.target.value })}
              className="bg-transparent text-neutral-700 outline-none cursor-pointer"
            >
              <option value="1024x1024">1:1</option>
              <option value="1792x1024">16:9</option>
              <option value="1024x1792">9:16</option>
              <option value="1024x768">4:3</option>
              <option value="768x1024">3:4</option>
            </select>
            <span className="text-neutral-500">2K</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button className="text-neutral-400 hover:text-violet-600" title="语音输入">
              <Mic size={12} />
            </button>
            <select
              value={gen.count}
              onChange={(e) => onUpdateGen({ count: Number(e.target.value) })}
              className="bg-transparent text-neutral-700 outline-none cursor-pointer"
            >
              <option value="1">1×</option>
              <option value="2">2×</option>
              <option value="4">4×</option>
            </select>
            <span className="flex items-center gap-1 text-neutral-500">
              <span className="w-3.5 h-3.5 rounded-full bg-neutral-100 inline-flex items-center justify-center text-[8px] text-neutral-500">⊕</span>
              {credits}
            </span>
            <button
              onClick={onGenerate}
              disabled={!gen.prompt.trim() || busy}
              className="w-7 h-7 rounded-full bg-neutral-100 hover:bg-violet-600 text-neutral-800 hover:text-white flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              title="生成"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <ArrowUp size={12} />}
            </button>
          </div>
        </div>
      </div>
      {flipAbove && <div className="mx-auto w-px h-3 bg-neutral-300" />}
    </div>
  );
}

function ReferencePicker({ currentNodeId, allNodes, edges, onConnect, onDisconnect }: any) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const connectedEdges = (edges || []).filter((e: any) => e.to === currentNodeId);
  const connectedNodeIds = new Set(connectedEdges.map((e: any) => e.from));

  const availableNodes = (allNodes || []).filter((n: any) => n.id !== currentNodeId && n.resultUrl);

  const toggleNode = (nodeId: string) => {
    if (connectedNodeIds.has(nodeId)) {
      const edge = connectedEdges.find((e: any) => e.from === nodeId);
      if (edge) onDisconnect(edge.id);
    } else {
      onConnect(nodeId);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`p-1.5 rounded-md shrink-0 transition-colors ${
          open ? 'bg-violet-100 text-violet-600' : 'hover:bg-neutral-100 text-neutral-500'
        }`}
        title="选择参考图"
      >
        <Plus size={13} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-neutral-200 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-neutral-100">
            <span className="text-[11px] text-neutral-500 font-medium">选择参考图（可多选）</span>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {availableNodes.length === 0 ? (
              <div className="px-3 py-6 text-center text-[11px] text-neutral-400">
                暂无可用图片节点
                <div className="text-neutral-300 mt-1">先生成或上传图片后再添加参考</div>
              </div>
            ) : (
              availableNodes.map((n: any) => {
                const isConnected = connectedNodeIds.has(n.id);
                return (
                  <button
                    key={n.id}
                    onClick={() => toggleNode(n.id)}
                    className={`w-full px-3 py-2 flex items-center gap-2.5 text-left transition-colors ${
                      isConnected ? 'bg-violet-50' : 'hover:bg-neutral-50'
                    }`}
                  >
                    <img
                      src={n.resultUrl}
                      alt=""
                      className={`w-10 h-10 rounded-lg object-cover border-2 shrink-0 transition-colors ${
                        isConnected ? 'border-violet-500' : 'border-neutral-200'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-neutral-800 font-medium truncate">{n.title || n.type}</div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">
                        {n.type === 'image' ? '图片' : n.type === 'video' ? '视频' : n.type}
                        {isConnected && <span className="text-violet-500 ml-1.5">已选</span>}
                      </div>
                    </div>
                    <div className={`w-4.5 h-4.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                      isConnected ? 'bg-violet-500 border-violet-500' : 'border-neutral-300'
                    }`}>
                      {isConnected && <span className="text-white text-[10px] leading-none">✓</span>}
                    </div>
                  </button>
                );
              })
            )}
          </div>
          {availableNodes.length > 0 && (
            <div className="px-3 py-2 border-t border-neutral-100 flex items-center justify-between">
              <span className="text-[10px] text-neutral-400">已选 {connectedNodeIds.size} 张参考图</span>
              <button
                onClick={() => setOpen(false)}
                className="text-[11px] text-violet-600 hover:text-violet-700 font-medium"
              >
                完成
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ImageNode({ node, left, top, width, height, isSel, onTitleDown, onBodyClick, onResizeDown, onHover, onLeave, onUpdate, onRequestDelete, onStartLink, ringClass, isDragging, isGenerating }: any) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(node.title || 'Image');

  const handleUpload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadApi.image(file);
      onUpdate({ resultUrl: result.url });
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleTitleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTitle(true);
    setTitleValue(node.title || 'Image');
  };

  const handleTitleBlur = () => {
    setEditingTitle(false);
    if (titleValue.trim() && titleValue !== node.title) {
      onUpdate({ title: titleValue.trim() });
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      setEditingTitle(false);
      setTitleValue(node.title || 'Image');
    }
  };

  return (
    <div
      data-node-id={node.id}
      onPointerEnter={onHover}
      onPointerLeave={onLeave}
      onPointerDown={(e) => {
        if (!(e.target as HTMLElement).closest('[data-no-drag],[data-title-bar]')) {
          onBodyClick(e, node);
        }
      }}
      className={`absolute bg-white border border-neutral-300 shadow-sm border rounded-2xl overflow-visible select-none shadow-2xl transition-shadow ${ringClass || ''} ${
        isDragging ? 'opacity-80 shadow-xl !shadow-violet-200' : ''
      } ${
        isSel ? 'border-neutral-500' : 'border-neutral-200'
      }`}
      style={{ left, top, width, height, zIndex: isDragging ? 999 : undefined }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <div
        onPointerDown={(e) => onTitleDown(e, node)}
        className="h-7 flex items-center justify-between px-3 text-[11px] text-neutral-600 cursor-grab active:cursor-grabbing select-none rounded-t-2xl"
        data-title-bar
      >
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <ImageIcon size={11} className="text-neutral-500 shrink-0" />
          {editingTitle ? (
            <input
              autoFocus
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex-1 min-w-0 bg-white border border-violet-500 rounded px-1 py-0.5 text-[11px] text-neutral-800 outline-none"
              style={{ maxWidth: '120px' }}
            />
          ) : (
            <span
              onDoubleClick={handleTitleDoubleClick}
              className="truncate max-w-[120px] cursor-text"
              title="双击编辑标题"
            >
              {node.title || 'Image'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1" data-no-drag>
          <button
            title="从此节点拉一条连线"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onStartLink && onStartLink(); }}
            className="p-1 rounded hover:bg-neutral-100 text-neutral-500 hover:text-violet-600"
          >
            <Link2 size={11} />
          </button>
          <button
            title="上传"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleUpload}
            disabled={uploading}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-neutral-100 text-neutral-500 hover:text-violet-600 disabled:opacity-50"
          >
            {uploading ? <Loader2 size={10} className="animate-spin" /> : <Upload size={10} />} 上传
          </button>
          <button
            title="删除"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onRequestDelete(node.id, e); }}
            className="p-1 rounded hover:bg-white text-neutral-600 hover:text-rose-600"
          >×</button>
        </div>
      </div>

      <div
        onPointerDown={(e) => { e.stopPropagation(); onBodyClick(e, node); }}
        className="mx-3 mt-1 mb-3 aspect-square bg-neutral-100 rounded-xl flex items-center justify-center overflow-hidden cursor-pointer hover:bg-white transition-colors relative"
        style={{ width: 'calc(100% - 24px)' }}
      >
        {node.resultUrl ? (
          <img src={node.resultUrl} alt="" className="w-full h-full object-contain" />
        ) : (
          <ImageIcon size={48} className="text-neutral-700" />
        )}
        {isGenerating && (
          <div className="absolute inset-0 bg-white/70 flex flex-col items-center justify-center gap-2">
            <Loader2 size={24} className="animate-spin text-violet-500" />
            <span className="text-[11px] text-violet-600">生成中…</span>
          </div>
        )}
        {node.status === 'failed' && (
          <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center gap-1">
            <span className="text-[11px] text-rose-600 font-medium">生成失败</span>
            {node.error && <span className="text-[10px] text-rose-400 max-w-[80%] truncate">{node.error}</span>}
          </div>
        )}
      </div>

      {/* resize handle — 右下角 */}
      {isSel && (
        <div
          onPointerDown={(e) => onResizeDown(e, node)}
          className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-neutral-100 border border-violet-500 rounded-sm cursor-nwse-resize z-10 hover:bg-violet-500"
          title="拖动调整尺寸"
          data-no-drag
        />
      )}
    </div>
  );
}

function VideoNode({ node, left, top, width, height, isSel, onTitleDown, onBodyClick, onHover, onLeave, onUpdate, onRequestDelete, onStartLink, ringClass, isDragging, isGenerating }: any) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(node.title || 'Video');

  const handleTitleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTitle(true);
    setTitleValue(node.title || 'Video');
  };

  const handleTitleBlur = () => {
    setEditingTitle(false);
    if (titleValue.trim() && titleValue !== node.title) {
      onUpdate({ title: titleValue.trim() });
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      setEditingTitle(false);
      setTitleValue(node.title || 'Video');
    }
  };

  return (
    <div
      data-node-id={node.id}
      onPointerEnter={onHover}
      onPointerLeave={onLeave}
      onPointerDown={(e) => {
        // 命中顶层空白（不在子交互区）= 视为点击 body（连线模式/选中）
        if (!(e.target as HTMLElement).closest('[data-no-drag],[data-title-bar]')) {
          onBodyClick(e, node);
        }
      }}
      className={`absolute bg-white border border-neutral-300 shadow-sm border rounded-2xl overflow-hidden select-none shadow-2xl transition-shadow ${ringClass || ''} ${
        isDragging ? 'opacity-80 shadow-xl !shadow-violet-200' : ''
      } ${
        isSel ? 'border-neutral-500' : 'border-neutral-200'
      }`}
      style={{ left, top, width, height: Math.max(height, 280), zIndex: isDragging ? 999 : undefined }}
    >
      <div
        onPointerDown={(e) => onTitleDown(e, node)}
        className="h-7 flex items-center justify-between px-3 text-[11px] text-neutral-600 cursor-grab active:cursor-grabbing select-none"
        data-title-bar
      >
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <VideoIcon size={11} className="text-neutral-500 shrink-0" />
          {editingTitle ? (
            <input
              autoFocus
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex-1 min-w-0 bg-white border border-violet-500 rounded px-1 py-0.5 text-[11px] text-neutral-800 outline-none"
              style={{ maxWidth: '120px' }}
            />
          ) : (
            <span
              onDoubleClick={handleTitleDoubleClick}
              className="truncate max-w-[120px] cursor-text"
              title="双击编辑标题"
            >
              {node.title || 'Video'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1" data-no-drag>
          <button
            title="从此节点拉一条连线"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onStartLink && onStartLink(); }}
            className="p-1 rounded hover:bg-neutral-100 text-neutral-500 hover:text-violet-600"
          >
            <Link2 size={11} />
          </button>
          <button
            title="删除"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onRequestDelete(node.id, e); }}
            className="p-1 rounded hover:bg-white text-neutral-600 hover:text-rose-600"
          >×</button>
        </div>
      </div>
      <div
        onPointerDown={(e) => { e.stopPropagation(); onBodyClick(e, node); }}
        className="mx-3 mt-1 mb-3 flex-1 aspect-video bg-neutral-100 rounded-xl flex items-center justify-center overflow-hidden cursor-pointer hover:bg-white transition-colors relative"
      >
        {node.resultUrl ? (
          <video src={node.resultUrl} controls className="w-full h-full object-contain" />
        ) : (
          <VideoIcon size={48} className="text-neutral-700" />
        )}
        {isGenerating && (
          <div className="absolute inset-0 bg-white/70 flex flex-col items-center justify-center gap-2">
            <Loader2 size={24} className="animate-spin text-violet-500" />
            <span className="text-[11px] text-violet-600">生成中…</span>
          </div>
        )}
      </div>
    </div>
  );
}

function EditorNode({ node, left, top, width, height, isSel, onTitleDown, onBodyClick, onHover, onLeave, onUpdate, onRequestDelete, onStartLink, ringClass, isDragging }: any) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(node.title || '图片编辑器');

  const handleTitleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTitle(true);
    setTitleValue(node.title || '图片编辑器');
  };

  const handleTitleBlur = () => {
    setEditingTitle(false);
    if (titleValue.trim() && titleValue !== node.title) {
      onUpdate({ title: titleValue.trim() });
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      setEditingTitle(false);
      setTitleValue(node.title || '图片编辑器');
    }
  };

  return (
    <div
      data-node-id={node.id}
      onPointerEnter={onHover}
      onPointerLeave={onLeave}
      onPointerDown={(e) => {
        if (!(e.target as HTMLElement).closest('[data-no-drag],[data-title-bar]')) {
          onBodyClick(e, node);
        }
      }}
      className={`absolute bg-white border border-neutral-300 shadow-sm border rounded-2xl overflow-hidden select-none shadow-2xl transition-shadow ${ringClass || ''} ${
        isDragging ? 'opacity-80 shadow-xl !shadow-violet-200' : ''
      } ${
        isSel ? 'border-neutral-500' : 'border-neutral-200'
      }`}
      style={{ left, top, width, height: Math.max(height, 360), zIndex: isDragging ? 999 : undefined }}
    >
      <div
        onPointerDown={(e) => onTitleDown(e, node)}
        className="h-7 flex items-center justify-between px-3 text-[11px] text-neutral-600 cursor-grab active:cursor-grabbing select-none"
        data-title-bar
      >
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Pencil size={11} className="text-neutral-500 shrink-0" />
          {editingTitle ? (
            <input
              autoFocus
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex-1 min-w-0 bg-white border border-violet-500 rounded px-1 py-0.5 text-[11px] text-neutral-800 outline-none"
              style={{ maxWidth: '120px' }}
            />
          ) : (
            <span
              onDoubleClick={handleTitleDoubleClick}
              className="truncate max-w-[120px] cursor-text"
              title="双击编辑标题"
            >
              {node.title || '图片编辑器'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1" data-no-drag>
          <button
            title="从此节点拉一条连线"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onStartLink && onStartLink(); }}
            className="p-1 rounded hover:bg-neutral-100 text-neutral-500 hover:text-violet-600"
          >
            <Link2 size={11} />
          </button>
          <button
            title="删除"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onRequestDelete(node.id, e); }}
            className="p-1 rounded hover:bg-white text-neutral-600 hover:text-rose-600"
          >×</button>
        </div>
      </div>
      <div
        onPointerDown={(e) => { e.stopPropagation(); onBodyClick(e, node); }}
        className="mx-3 mt-1 mb-3 flex-1 aspect-square bg-neutral-100 rounded-xl flex flex-col items-center justify-center gap-3 overflow-hidden cursor-pointer hover:bg-white transition-colors"
      >
        {node.resultUrl ? (
          <img src={node.resultUrl} alt="" className="w-full h-full object-contain" />
        ) : (
          <>
            <ImageIcon size={40} className="text-neutral-700" />
            <button
              data-no-drag
              onClick={(e) => e.stopPropagation()}
              className="px-4 py-1.5 rounded-full bg-neutral-100 hover:bg-neutral-200 text-[11px] text-neutral-900 border border-neutral-300"
            >
              打开编辑器
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ContextMenu({ x, y, node, onClose, onCopy, onDelete, onToggleLock, onToggleHide }: any) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  if (!node) return null;

  const items = [
    { label: '复制节点', icon: <Copy size={12} />, onClick: onCopy },
    { label: node.locked ? '解锁' : '锁定', icon: node.locked ? <Unlock size={12} /> : <Lock size={12} />, onClick: onToggleLock },
    { label: node.visible === false ? '显示' : '隐藏', icon: node.visible === false ? <Eye size={12} /> : <EyeOff size={12} />, onClick: onToggleHide },
    { label: '删除节点', icon: <X size={12} />, onClick: onDelete, danger: true },
  ];

  return (
    <div
      ref={ref}
      className="fixed z-[100] bg-white border border-neutral-200 rounded-lg shadow-2xl py-1 w-36"
      style={{ left: x, top: y }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-3 py-1.5 text-[10px] text-neutral-500 border-b border-neutral-200 truncate">{node.title || '节点'}</div>
      {items.map((item) => (
        <button
          key={item.label}
          onClick={(e) => { e.stopPropagation(); item.onClick(); }}
          className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 transition-colors ${
            item.danger
              ? 'text-rose-600 hover:bg-rose-500/10'
              : 'text-neutral-800 hover:bg-violet-600/20 hover:text-violet-300'
          }`}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}

function TextNodeLite({ node, left, top, width, height, isSel, onTitleDown, onUpdate, onRequestDelete }: any) {
  return (
    <div
      data-node-id={node.id}
      onPointerDown={(e) => { e.stopPropagation(); onTitleDown(e, node); }}
      className={`absolute bg-white border border-neutral-200 rounded-2xl p-3 select-none shadow-2xl cursor-grab ${
        isSel ? 'border-neutral-500' : ''
      }`}
      style={{ left, top, width: Math.max(width, 240), height: Math.max(height, 120) }}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-neutral-600 mb-2">
        <TypeIcon size={11} />
        <span>Text</span>
        <button onClick={(e) => { e.stopPropagation(); onRequestDelete?.(node.id, e); }} className="ml-auto p-0.5 rounded hover:bg-white text-neutral-600 hover:text-rose-600" data-no-drag>×</button>
      </div>
      <textarea
        data-no-drag
        value={node.gen?.prompt || ''}
        onChange={(e) => onUpdate({ gen: { ...(node.gen || { model: DEFAULT_MODEL }), prompt: e.target.value } })}
        placeholder="输入文本…"
        className="w-full bg-transparent outline-none text-[12px] text-neutral-800 placeholder-neutral-400 resize-none"
        rows={3}
      />
    </div>
  );
}

function MediaNodeLite({ node, left, top, width, height, isSel, onTitleDown, onUpdate, onRequestDelete }: any) {
  return (
    <div
      data-node-id={node.id}
      onPointerDown={(e) => { e.stopPropagation(); onTitleDown(e, node); }}
      className={`absolute bg-white border border-neutral-200 rounded-2xl p-3 select-none shadow-2xl cursor-grab ${
        isSel ? 'border-neutral-500' : ''
      }`}
      style={{ left, top, width: Math.max(width, 280), height: Math.max(height, 240) }}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-neutral-600 mb-2">
        <ImageIcon size={11} />
        <span>{node.title || 'Media'}</span>
        <button onClick={(e) => { e.stopPropagation(); onRequestDelete?.(node.id, e); }} className="ml-auto p-0.5 rounded hover:bg-white text-neutral-600 hover:text-rose-600" data-no-drag>×</button>
      </div>
      <input
        data-no-drag
        value={node.resultUrl || ''}
        onChange={(e) => onUpdate({ resultUrl: e.target.value })}
        placeholder="媒体 URL"
        className="w-full bg-white border border-neutral-200 rounded px-2 py-1 text-[11px] text-neutral-800 outline-none mb-2"
      />
      {node.resultUrl && (
        <div className="rounded overflow-hidden bg-neutral-200">
          <img src={node.resultUrl} alt="" className="w-full object-contain" />
        </div>
      )}
    </div>
  );
}
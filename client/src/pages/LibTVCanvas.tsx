import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Layers,
  Settings as SettingsIcon,
  Image as ImageIcon,
  Video as VideoIcon,
  Type as TypeIcon,
  HelpCircle,
  Map,
  Grid3x3,
  Link2,
  Copy,
  EyeOff,
  X,
  Loader2,
  Zap,
  Send,
  Trash2,
  ChevronDown,
  Film,
  FileText,
  Scissors,
  FolderOpen,
  User,
  Keyboard,
  Timer,
  AlignJustify,
  Lock,
  Unlock,
  Eye,
  EyeOff as EyeOffIcon,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  FileText as Scenarist,
  Wand2 as Wand2Icon,
  Upload,
  Download,
  Check,
  AlertCircle,
  Info,
  List,
  Layout,
  Film as FilmIcon,
  AudioLines,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  GripVertical,
  ArrowLeft,
} from 'lucide-react';
import { canvasApi } from '../api/canvas';
import { newRequestId } from '../api/client';
import { generationApi } from '../api/generation';
import { assetsApi, type Asset, type AssetType } from '../api/assets';
import { agentApi } from '../api/agent';
import type { CanvasGraph, CanvasGraphNode, CanvasNodeType } from '../api/canvas-graph';
import type { AIModel } from '../types';
import { useAuthStore } from '../store/authStore';

const DEFAULT_MODEL = 'minimax-image';
let idSeq = 1;
const nextId = (p: string) => `${p}_${Date.now().toString(36)}_${idSeq++}`;

type CanvasMode = 'workflow' | 'storyboard';

interface ExtendedCanvasGraphNode extends CanvasGraphNode {
  content?: string;
}

function makeNode(type: CanvasNodeType, x: number, y: number): ExtendedCanvasGraphNode {
  const base: ExtendedCanvasGraphNode = {
    id: nextId('n'),
    type,
    x, y,
    width: type === 'group' ? 400 : 340,
    height:
      type === 'image' ? 480 :
      type === 'video' ? 460 :
      type === 'editor' ? 380 :
      type === 'text' ? 300 :
      type === 'media' ? 300 :
      type === 'group' ? 200 : 380,
    zIndex: type === 'group' ? 0 : 1,
    locked: false,
    visible: true,
    title:
      type === 'image' ? '图片生成' :
      type === 'video' ? '视频生成' :
      type === 'editor' ? '图片编辑器' :
      type === 'text' ? '' :
      type === 'media' ? '音频生成' :
      type === 'group' ? '分组' : 'Media',
    versions: [],
    status: 'idle',
    collapsed: false,
    content: type === 'text' ? '' : undefined,
  };
  if (type === 'image' || type === 'video') {
    base.gen = {
      model: type === 'video' ? 'minimax-video' : DEFAULT_MODEL,
      prompt: '',
      negativePrompt: '',
      aspectRatio: '1024x1024',
      count: 1,
      subjectType: 'character',
    };
  }
  if (type === 'media') {
    base.gen = {
      model: 'mock-audio',
      prompt: '',
      duration: 10,
    };
  }
  return base;
}

// MiniMap Component
function Minimap({ 
  nodes, 
  pan, 
  zoom,
  containerWidth,
  containerHeight,
  onNavigate
}: { 
  nodes: CanvasGraphNode[]; 
  pan: { x: number; y: number }; 
  zoom: number;
  containerWidth: number;
  containerHeight: number;
  onNavigate?: (pan: { x: number; y: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const bounds = useMemo(() => {
    if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 1000, maxY: 800 };
    const minX = Math.min(...nodes.map(n => n.x));
    const minY = Math.min(...nodes.map(n => n.y));
    const maxX = Math.max(...nodes.map(n => n.x + n.width));
    const maxY = Math.max(...nodes.map(n => n.y + n.height));
    return { minX: minX - 100, minY: minY - 100, maxX: maxX + 100, maxY: maxY + 100 };
  }, [nodes]);
  
  
  
  const handleClick = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / rect.width;
    const clickY = (e.clientY - rect.top) / rect.height;
    
    const canvasX = bounds.minX + clickX * (bounds.maxX - bounds.minX);
    const canvasY = bounds.minY + clickY * (bounds.maxY - bounds.minY);
    
    // 计算新的 pan 值以将点击位置居中
    const newPanX = containerWidth / 2 - canvasX * zoom;
    const newPanY = containerHeight / 2 - canvasY * zoom;
    
    if (onNavigate) {
      onNavigate({ x: newPanX, y: newPanY });
    }
  };
  
  return (
    <div 
      ref={containerRef}
      className="w-48 h-32 bg-neutral-900/95 border border-neutral-700 rounded-lg overflow-hidden"
      onClick={handleClick}
    >
      <svg width="100%" height="100%" viewBox={`${bounds.minX} ${bounds.minY} ${bounds.maxX - bounds.minX} ${bounds.maxY - bounds.minY}`}>
        {nodes.map(node => (
          <rect
            key={node.id}
            x={node.x}
            y={node.y}
            width={node.width}
            height={node.height}
            fill={
              node.type === 'image' ? 'rgba(168, 85, 247, 0.5)' :
              node.type === 'video' ? 'rgba(59, 130, 246, 0.5)' : 'rgba(113, 113, 122, 0.5)'
            }
            stroke={node.visible === false ? 'transparent' : '#52525b'}
            strokeWidth="2"
          />
        ))}
        <rect
          x={-pan.x / zoom}
          y={-pan.y / zoom}
          width={containerWidth / zoom}
          height={containerHeight / zoom}
          fill="none"
          stroke="#a855f7"
          strokeWidth={10 / zoom}
        />
      </svg>
    </div>
  );
}

// Asset Library Panel Component
function AssetLibraryPanel({
  onClose,
  onSelectAsset,
  canvasId
}: {
  onClose: () => void;
  onSelectAsset: (asset: Asset) => void;
  canvasId: string;
}) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<AssetType | 'all'>('all');
  
  useEffect(() => {
    loadAssets();
  }, [canvasId, selectedType, search]);
  
  const loadAssets = async () => {
    setLoading(true);
    try {
      const data = await assetsApi.list(
        selectedType === 'all' ? undefined : selectedType,
        search || undefined
      );
      setAssets(data);
    } catch (e) {
      console.error('Failed to load assets:', e);
    } finally {
      setLoading(false);
    }
  };
  
  const typeFilters: { type: AssetType | 'all'; label: string; icon: React.ReactNode }[] = [
    { type: 'all', label: '全部', icon: <List size={14} /> },
    { type: 'CHARACTER', label: '角色', icon: <User size={14} /> },
    { type: 'PRODUCT', label: '产品', icon: <ImageIcon size={14} /> },
    { type: 'STYLE', label: '风格', icon: <Layout size={14} /> },
    { type: 'REFERENCE', label: '参考', icon: <Link2 size={14} /> },
  ];
  
  return (
    <div className="w-80 bg-neutral-800 border-l border-neutral-700 flex flex-col shrink-0 h-full">
      <div className="p-3 border-b border-neutral-700 flex items-center justify-between">
        <span className="text-sm font-medium">资产管理</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-neutral-700">
          <X size={14} />
        </button>
      </div>
      
      <div className="p-3 border-b border-neutral-700">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索资产..."
            className="w-full bg-neutral-900 border border-neutral-700 rounded pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-purple-500"
          />
        </div>
        <div className="flex gap-1 mt-2 flex-wrap">
          {typeFilters.map(({ type, label, icon }) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${
                selectedType === type 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </div>
      
      <div className="flex-1 overflow-auto p-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-neutral-400" />
          </div>
        ) : assets.length === 0 ? (
          <div className="text-center py-8 text-neutral-500 text-sm">
            <FolderOpen size={32} className="mx-auto mb-2 opacity-50" />
            <p>暂无资产</p>
            <p className="text-xs mt-1">上传图片或视频开始创作</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {assets.map(asset => (
              <div
                key={asset.id}
                onClick={() => {
                  onSelectAsset(asset);
                  onClose();
                }}
                className="group relative cursor-pointer rounded-lg overflow-hidden bg-neutral-900 border border-neutral-700 hover:border-purple-500 transition-colors"
              >
                {asset.thumbnail ? (
                  <img 
                    src={asset.thumbnail} 
                    alt={asset.name}
                    className="w-full aspect-square object-cover"
                  />
                ) : asset.url.match(/\.(mp4|mov|avi)$/i) ? (
                  <div className="w-full aspect-square flex items-center justify-center bg-neutral-800">
                    <FilmIcon size={24} className="text-neutral-500" />
                  </div>
                ) : (
                  <div className="w-full aspect-square flex items-center justify-center bg-neutral-800">
                    <ImageIcon size={24} className="text-neutral-500" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-white text-xs">选择</span>
                </div>
                <div className="p-2">
                  <p className="text-xs truncate">{asset.name}</p>
                  <p className="text-xs text-neutral-500 capitalize">{asset.type.toLowerCase()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div className="p-3 border-t border-neutral-700">
        <div className="flex gap-2">
          <button className="flex-1 px-3 py-2 bg-neutral-700 rounded text-sm hover:bg-neutral-600 flex items-center justify-center gap-2">
            <Upload size={14} />
            上传
          </button>
          <button className="flex-1 px-3 py-2 bg-purple-600 rounded text-sm hover:bg-purple-700 flex items-center justify-center gap-2">
            <Download size={14} />
            导入
          </button>
        </div>
      </div>
    </div>
  );
}

// Layer Panel Component
function LayerPanel({
  nodes,
  selectedId,
  onSelect,
  onToggleLock,
  onToggleVisibility,
  onDelete,
  onDuplicate,
  onCollapse,
  onClose
}: {
  nodes: CanvasGraphNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleLock: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onCollapse: (id: string) => void;
  onClose: () => void;
}) {
  const sortedNodes = useMemo(() => {
    return [...nodes].sort((a, b) => b.zIndex - a.zIndex);
  }, [nodes]);
  
  const getNodeIcon = (type: CanvasNodeType) => {
    switch (type) {
      case 'image': return <ImageIcon size={14} className="text-purple-400" />;
      case 'video': return <VideoIcon size={14} className="text-blue-400" />;
      case 'text': return <TypeIcon size={14} className="text-green-400" />;
      default: return <FileText size={14} className="text-neutral-400" />;
    }
  };
  
  return (
    <div className="w-64 bg-neutral-800 border-r border-neutral-700 flex flex-col shrink-0 h-full">
      <div className="p-3 border-b border-neutral-700 flex items-center justify-between">
        <span className="text-sm font-medium">图层</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-neutral-700">
          <X size={14} />
        </button>
      </div>
      
      <div className="flex-1 overflow-auto">
        {sortedNodes.length === 0 ? (
          <div className="p-4 text-center text-neutral-500 text-sm">
            <Layers size={24} className="mx-auto mb-2 opacity-50" />
            <p>暂无图层</p>
          </div>
        ) : (
          sortedNodes.map(node => (
            <div
              key={node.id}
              onClick={() => onSelect(node.id)}
              className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-neutral-700/50 transition-colors ${
                selectedId === node.id 
                  ? 'bg-purple-600/20 border-l-2 border-l-purple-500' 
                  : 'hover:bg-neutral-700/50'
              } ${node.visible === false ? 'opacity-50' : ''}`}
            >
              <GripVertical size={12} className="text-neutral-500 cursor-grab" />
              {getNodeIcon(node.type)}
              <span className="flex-1 text-sm truncate">{node.title || '未命名'}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleLock(node.id); }}
                  className="p-1 rounded hover:bg-neutral-600"
                  title={node.locked ? '解锁' : '锁定'}
                >
                  {node.locked ? <Lock size={12} /> : <Unlock size={12} />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleVisibility(node.id); }}
                  className="p-1 rounded hover:bg-neutral-600"
                  title={node.visible ? '隐藏' : '显示'}
                >
                  {node.visible ? <Eye size={12} /> : <EyeOffIcon size={12} />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onCollapse(node.id); }}
                  className="p-1 rounded hover:bg-neutral-600"
                  title={node.collapsed ? '展开' : '折叠'}
                >
                  {node.collapsed ? <ChevronRight size={12} /> : <ChevronUp size={12} />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDuplicate(node.id); }}
                  className="p-1 rounded hover:bg-neutral-600"
                  title="复制"
                >
                  <Copy size={12} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
                  className="p-1 rounded hover:bg-red-600/50"
                  title="删除"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Settings Panel Component
function SettingsPanel({
  onClose,
  gridSnap,
  onGridSnapChange,
  zoom,
  onZoomChange
}: {
  onClose: () => void;
  gridSnap: boolean;
  onGridSnapChange: (v: boolean) => void;
  zoom: number;
  onZoomChange: (v: number) => void;
}) {
  const [localZoom, setLocalZoom] = useState(Math.round(zoom * 100));
  
  useEffect(() => {
    setLocalZoom(Math.round(zoom * 100));
  }, [zoom]);
  
  return (
    <div className="absolute top-14 right-4 w-72 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl z-50">
      <div className="p-3 border-b border-neutral-700 flex items-center justify-between">
        <span className="text-sm font-medium">设置</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-neutral-700">
          <X size={14} />
        </button>
      </div>
      
      <div className="p-4 space-y-4">
        <div className="space-y-3">
          <h3 className="text-xs font-medium text-neutral-400 uppercase">显示</h3>
          
          <div className="flex items-center justify-between">
            <span className="text-sm">网格吸附</span>
            <button
              onClick={() => onGridSnapChange(!gridSnap)}
              className={`w-10 h-5 rounded-full transition-colors ${
                gridSnap ? 'bg-purple-600' : 'bg-neutral-600'
              }`}
            >
              <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                gridSnap ? 'translate-x-5' : 'translate-x-0.5'
              }`} />
            </button>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">缩放</span>
              <span className="text-sm text-neutral-400">{localZoom}%</span>
            </div>
            <input
              type="range"
              min="30"
              max="200"
              value={localZoom}
              onChange={(e) => {
                const v = Number(e.target.value);
                setLocalZoom(v);
                onZoomChange(v / 100);
              }}
              className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-purple-600"
            />
            <div className="flex justify-between text-xs text-neutral-500">
              <span>30%</span>
              <span>100%</span>
              <span>200%</span>
            </div>
          </div>
        </div>
        
        <div className="pt-3 border-t border-neutral-700 space-y-3">
          <h3 className="text-xs font-medium text-neutral-400 uppercase">快捷键</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>撤销</span>
              <kbd className="px-2 py-0.5 bg-neutral-700 rounded text-xs">Ctrl+Z</kbd>
            </div>
            <div className="flex justify-between">
              <span>重做</span>
              <kbd className="px-2 py-0.5 bg-neutral-700 rounded text-xs">Ctrl+Y</kbd>
            </div>
            <div className="flex justify-between">
              <span>复制</span>
              <kbd className="px-2 py-0.5 bg-neutral-700 rounded text-xs">Ctrl+D</kbd>
            </div>
            <div className="flex justify-between">
              <span>删除</span>
              <kbd className="px-2 py-0.5 bg-neutral-700 rounded text-xs">Delete</kbd>
            </div>
            <div className="flex justify-between">
              <span>适应窗口</span>
              <kbd className="px-2 py-0.5 bg-neutral-700 rounded text-xs">F</kbd>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// User Panel Component
function UserPanel({ onClose: _onClose }: { onClose: () => void }) {
  const { user } = useAuthStore();
  
  return (
    <div className="absolute top-14 right-4 w-64 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl z-50">
      <div className="p-4 border-b border-neutral-700">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center text-lg font-medium">
            {user?.nickname?.[0] || user?.phone?.[0] || 'U'}
          </div>
          <div>
            <p className="font-medium">{user?.nickname || '用户'}</p>
            <p className="text-sm text-neutral-400">{user?.phone}</p>
          </div>
        </div>
      </div>
      
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-400">Tapies 余额</span>
          <div className="flex items-center gap-1">
            <Zap size={14} className="text-yellow-400" />
            <span className="font-medium">{user?.tapies || 0}</span>
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-400">账户类型</span>
          <span className="text-sm">{user?.role === 'admin' ? '管理员' : '普通用户'}</span>
        </div>
      </div>
      
      <div className="p-4 border-t border-neutral-700 space-y-2">
        <button className="w-full px-3 py-2 bg-neutral-700 rounded text-sm hover:bg-neutral-600 text-left flex items-center gap-2">
          <User size={14} />
          个人设置
        </button>
        <button className="w-full px-3 py-2 bg-neutral-700 rounded text-sm hover:bg-neutral-600 text-left flex items-center gap-2">
          <SettingsIcon size={14} />
          账户设置
        </button>
        <button className="w-full px-3 py-2 bg-red-600/20 rounded text-sm hover:bg-red-600/30 text-left flex items-center gap-2 text-red-400">
          <X size={14} />
          退出登录
        </button>
      </div>
    </div>
  );
}

// TV Director Panel Component
function TVDirectorPanel({
  onAddNode
}: {
  onAddNode: (type: CanvasNodeType, params?: any) => void;
}) {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const quickActions = [
    { label: '选择Skill开始创作', action: '选择一个AI技能来开始你的视频创作之旅' },
    { label: '从爆款预设开始剧本原创', action: '基于热门视频模板创作原创剧本' },
    { label: '上传故事来改编', action: '上传你的故事文本，AI将为你改编成视频剧本' },
    { label: '批量创建分镜', action: '批量生成视频分镜和场景描述' },
  ];
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  const handleSend = async () => {
    if (!input.trim() || loading) return;
    
    const userMessage = { role: 'user' as const, content: input.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    
    try {
      // 调用 Agent API 进行对话
      await agentApi.create(input.trim());
      
      // 根据用户输入生成智能响应
      const userText = input.toLowerCase();
      let fullResponse = '';
      
      if (userText.includes('剧本') || userText.includes('分镜') || userText.includes('脚本')) {
        fullResponse = `好的，我来帮你${input.includes('剧本') ? '创作剧本' : input.includes('分镜') ? '创建分镜' : '编写脚本'}...\n\n根据你的需求，我已经为你创建了以下内容：\n\n1. 开头场景：设定氛围和主角登场\n2. 冲突发展：制造情节张力\n3. 高潮部分：情感爆发点\n4. 结尾：完美收束\n\n你可以选择：\n• 「生成完整剧本」- 输出完整视频剧本\n• 「生成图片分镜」- AI生成可视化分镜\n• 「直接生成视频」- 一键生成视频`;
        
        setTimeout(() => {
          onAddNode('text', { title: '视频剧本草稿', prompt: '场景1: 开头\n场景2: 发展\n场景3: 高潮\n场景4: 结尾' });
        }, 500);
      } else if (userText.includes('视频') || userText.includes('生成')) {
        fullResponse = `明白了！你想生成视频内容。\n\n我已经为你准备了一个视频生成节点，你可以：\n\n1. 描述视频内容\n2. 选择视频风格\n3. 设置时长和比例\n\n节点已添加到画布中，请完善描述后点击生成。`;
        
        setTimeout(() => {
          onAddNode('video', { title: '视频生成', prompt: input });
        }, 500);
      } else if (userText.includes('图片') || userText.includes('图像')) {
        fullResponse = `好的，我来帮你生成图片！\n\n请描述你想要的图片内容，我会为你：\n\n1. 选择合适的AI模型\n2. 优化提示词\n3. 生成高质量图片\n\n图片生成节点已添加到画布中。`;
        
        setTimeout(() => {
          onAddNode('image', { title: '图片生成', prompt: input });
        }, 500);
      } else {
        fullResponse = `收到你的创作需求！\n\n作为你的AI创作助手，我可以帮你：\n\n📝 **剧本创作**\n  帮你构思完整的故事和视频脚本\n\n🎬 **视频生成**\n  根据描述生成精彩视频内容\n\n🖼️ **图片生成**\n  创作高质量的图片素材\n\n🎭 **分镜设计**\n  将剧本转化为可视化分镜\n\n请告诉我你想创作什么内容？`;
      }
      
      // 模拟打字机效果
      const assistantMessage = { role: 'assistant' as const, content: '', timestamp: new Date() };
      setMessages(prev => [...prev, assistantMessage]);
      
      for (let i = 0; i <= fullResponse.length; i += 5) {
        await new Promise(resolve => setTimeout(resolve, 10));
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = {
            ...newMessages[newMessages.length - 1],
            content: fullResponse.slice(0, i)
          };
          return newMessages;
        });
      }
      
    } catch (e) {
      console.error('TV Director error:', e);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '抱歉，服务暂时不可用。请稍后再试。',
        timestamp: new Date()
      }]);
    } finally {
      setLoading(false);
    }
  };
  
  const handleQuickAction = (action: string) => {
    setInput(action);
    setTimeout(() => handleSend(), 100);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  
  return (
    <div className="w-96 bg-neutral-800 border-l border-neutral-700 flex flex-col shrink-0 h-full">
      <div className="p-3 border-b border-neutral-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Wand2Icon size={14} className="text-white" />
          </div>
          <span className="text-sm font-medium">TV Director</span>
          <span className="text-xs text-purple-400 bg-purple-600/20 px-2 py-0.5 rounded">AI 助手</span>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="space-y-4">
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-purple-600/20 flex items-center justify-center mx-auto mb-3">
                <Wand2Icon size={24} className="text-purple-400" />
              </div>
              <p className="text-sm text-neutral-400">我是你的 AI 创作助手</p>
              <p className="text-xs text-neutral-500 mt-1">可以帮你创作剧本、生成视频、设计分镜</p>
            </div>
            
            <div className="space-y-2">
              <p className="text-xs text-neutral-500 uppercase">快捷指令</p>
              {quickActions.map((item, i) => (
                <button
                  key={i}
                  onClick={() => handleQuickAction(item.action)}
                  className="w-full px-3 py-2 bg-neutral-700/50 rounded-lg text-sm text-left hover:bg-neutral-700 transition-colors"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg p-3 ${
                    msg.role === 'user'
                      ? 'bg-purple-600 text-white'
                      : 'bg-neutral-700 text-neutral-100'
                  }`}
                >
                  <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                  <div className={`text-xs mt-1 ${
                    msg.role === 'user' ? 'text-purple-200' : 'text-neutral-500'
                  }`}>
                    {msg.timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-neutral-700 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-sm text-neutral-400">
                    <Loader2 size={14} className="animate-spin" />
                    思考中...
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      
      <div className="p-4 border-t border-neutral-700">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="描述你的创作需求，或 @ 引用节点..."
            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg pl-4 pr-12 py-3 text-sm resize-none h-20 focus:outline-none focus:border-purple-500"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="absolute right-2 bottom-2 p-2 bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={16} />
          </button>
        </div>
        <div className="flex items-center justify-between mt-2 text-xs text-neutral-500">
          <span>Enter 发送，Shift+Enter 换行</span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            AI 就绪
          </span>
        </div>
      </div>
    </div>
  );
}

// Storyboard Panel Component
function StoryboardPanel({
  graph,
  selectedId,
  onSelect,
  onPlay,
  isPlaying,
  currentStoryIndex,
  collapsed,
  onToggleCollapse
}: {
  graph: CanvasGraph;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPlay: () => void;
  isPlaying: boolean;
  currentStoryIndex: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const storyNodes = useMemo(() => {
    return graph.nodes.filter(n => n.type === 'image' || n.type === 'video' || n.type === 'text');
  }, [graph.nodes]);
  
  const totalDuration = useMemo(() => {
    return storyNodes.length * 3;
  }, [storyNodes.length]);
  
  return (
    <div
      className={`absolute bottom-0 left-0 right-0 bg-neutral-800/95 border-t border-neutral-700 flex flex-col transition-all duration-300 ease-in-out overflow-hidden ${
        collapsed ? 'h-10' : 'h-48'
      }`}
    >
      <div
        className="p-2 border-b border-neutral-700 flex items-center justify-between cursor-pointer select-none"
        onDoubleClick={onToggleCollapse}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded hover:bg-neutral-700 transition-colors"
            title={collapsed ? '展开故事板' : '收起故事板'}
          >
            {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <span className="text-sm font-medium">故事板</span>
          <span className="text-xs text-neutral-500">{storyNodes.length} 个场景</span>
          <span className="text-xs text-neutral-500">|</span>
          <span className="text-xs text-neutral-500">约 {totalDuration}s</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onPlay(); }}
            className="p-2 rounded-lg bg-purple-600 hover:bg-purple-700 transition-colors"
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); }}
            className="p-2 rounded-lg hover:bg-neutral-700 transition-colors"
          >
            <SkipBack size={16} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); }}
            className="p-2 rounded-lg hover:bg-neutral-700 transition-colors"
          >
            <SkipForward size={16} />
          </button>
        </div>
      </div>
      
      <div className={`flex-1 overflow-x-auto p-2 transition-opacity duration-200 ${collapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        {storyNodes.length === 0 ? (
          <div className="h-full flex items-center justify-center text-neutral-500 text-sm">
            <FilmIcon size={24} className="mr-2 opacity-50" />
            在工作流中添加节点来创建故事板
          </div>
        ) : (
          <div className="flex gap-2 h-full">
            {storyNodes.map((node, index) => (
              <div
                key={node.id}
                onClick={() => onSelect(node.id)}
                className={`relative shrink-0 w-36 h-full rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${
                  selectedId === node.id 
                    ? 'border-purple-500' 
                    : index === currentStoryIndex && isPlaying
                    ? 'border-yellow-500'
                    : 'border-transparent hover:border-neutral-600'
                }`}
              >
                <div className="absolute inset-0 bg-neutral-900">
                  {node.resultUrl ? (
                    node.type === 'video' ? (
                      <video src={node.resultUrl} className="w-full h-full object-cover" muted />
                    ) : (
                      <img src={node.resultUrl} alt={node.title} className="w-full h-full object-cover" />
                    )
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {node.type === 'image' && <ImageIcon size={24} className="text-neutral-600" />}
                      {node.type === 'video' && <VideoIcon size={24} className="text-neutral-600" />}
                      {node.type === 'text' && <TypeIcon size={24} className="text-neutral-600" />}
                    </div>
                  )}
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
                  <p className="text-xs truncate">{node.title || '场景 ' + (index + 1)}</p>
                  <p className="text-xs text-neutral-400">{index + 1} / {storyNodes.length}</p>
                </div>
                {isPlaying && index === currentStoryIndex && (
                  <div className="absolute top-2 right-2">
                    <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Context Menu Component
function ContextMenu({
  x,
  y,
  onClose,
  onDelete,
  onDuplicate,
  onLock,
  onHide,
  onCollapse,
  isLocked,
  isHidden,
  isCollapsed
}: {
  x: number;
  y: number;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onLock: () => void;
  onHide: () => void;
  onCollapse: () => void;
  isLocked: boolean;
  isHidden: boolean;
  isCollapsed: boolean;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);
  
  const menuItems = [
    { icon: <Copy size={14} />, label: '复制', action: onDuplicate, shortcut: 'Ctrl+D' },
    { icon: isLocked ? <Unlock size={14} /> : <Lock size={14} />, label: isLocked ? '解锁' : '锁定', action: onLock },
    { icon: isHidden ? <Eye size={14} /> : <EyeOffIcon size={14} />, label: isHidden ? '显示' : '隐藏', action: onHide },
    { icon: isCollapsed ? <ChevronRight size={14} /> : <ChevronUp size={14} />, label: isCollapsed ? '展开' : '折叠', action: onCollapse },
    { type: 'divider' as const },
    { icon: <Trash2 size={14} />, label: '删除', action: onDelete, shortcut: 'Del', danger: true },
  ];
  
  return (
    <div
      ref={menuRef}
      className="fixed bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl py-1 z-50 min-w-[160px]"
      style={{ left: x, top: y }}
    >
      {menuItems.map((item, index) => {
        if ('type' in item && item.type === 'divider') {
          return <div key={index} className="h-px bg-neutral-700 my-1" />;
        }
        return (
          <button
            key={index}
            onClick={() => { item.action(); onClose(); }}
            className={`w-full px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-neutral-700 ${
              'danger' in item && item.danger ? 'text-red-400' : ''
            }`}
          >
            {item.icon}
            <span className="flex-1">{item.label}</span>
            {'shortcut' in item && item.shortcut && (
              <span className="text-xs text-neutral-500">{item.shortcut}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Shortcuts Panel Component
function ShortcutsPanel({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    { category: '通用', items: [
      { key: 'Ctrl + Z', desc: '撤销' },
      { key: 'Ctrl + Y', desc: '重做' },
      { key: 'Ctrl + D', desc: '复制节点' },
      { key: 'Delete', desc: '删除选中节点' },
      { key: 'F', desc: '适应窗口' },
      { key: 'B', desc: '展开/收起故事板' },
      { key: 'Escape', desc: '取消操作' },
    ]},
    { category: '画布', items: [
      { key: '双击空白', desc: '快速添加节点' },
      { key: '鼠标滚轮', desc: '缩放画布' },
      { key: '空格 + 拖拽', desc: '平移画布' },
      { key: 'Ctrl + 0', desc: '重置缩放' },
    ]},
    { category: '节点', items: [
      { key: '点击节点', desc: '选中节点' },
      { key: '拖拽节点边缘', desc: '调整大小' },
      { key: '从连接点拖拽', desc: '创建连线' },
      { key: 'Ctrl + L', desc: '锁定/解锁节点' },
    ]},
  ];
  
  return (
    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 w-[480px] bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl z-50">
      <div className="p-4 border-b border-neutral-700 flex items-center justify-between">
        <span className="text-sm font-medium">快捷键</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-neutral-700">
          <X size={14} />
        </button>
      </div>
      
      <div className="p-4 max-h-[400px] overflow-auto">
        {shortcuts.map((group, i) => (
          <div key={i} className="mb-4 last:mb-0">
            <h3 className="text-xs font-medium text-neutral-400 uppercase mb-2">{group.category}</h3>
            <div className="space-y-1">
              {group.items.map((item, j) => (
                <div key={j} className="flex items-center justify-between py-1">
                  <span className="text-sm">{item.desc}</span>
                  <kbd className="px-2 py-0.5 bg-neutral-700 rounded text-xs">{item.key}</kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Canvas Selector Component
function CanvasSelector({
  currentCanvas,
  canvases,
  onSelect,
  onCreateNew,
  onClose
}: {
  currentCanvas: { id: string; name: string };
  canvases: Array<{ id: string; name: string }>;
  onSelect: (id: string) => void;
  onCreateNew: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);
  
  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl py-1 min-w-[200px] z-50"
    >
      <div className="px-3 py-2 text-xs text-neutral-400 border-b border-neutral-700">
        切换画布
      </div>
      {canvases.map((canvas) => (
        <button
          key={canvas.id}
          onClick={() => { onSelect(canvas.id); onClose(); }}
          className={`w-full px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-neutral-700 ${
            canvas.id === currentCanvas.id ? 'bg-purple-600/20 text-purple-300' : ''
          }`}
        >
          <Layout size={14} />
          <span className="flex-1 truncate">{canvas.name}</span>
          {canvas.id === currentCanvas.id && <Check size={14} className="text-purple-400" />}
        </button>
      ))}
      <div className="border-t border-neutral-700 mt-1 pt-1">
        <button
          onClick={() => { onCreateNew(); onClose(); }}
          className="w-full px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-neutral-700 text-purple-300"
        >
          <Plus size={14} />
          新建画布
        </button>
      </div>
    </div>
  );
}

// Smart Editing Panel Component
function SmartEditingPanel({
}: {
  onClose: () => void;
}) {
  const [mode, setMode] = useState('auto');
  
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium mb-2">智能剪辑模式</h4>
        <div className="space-y-2">
          {[
            { value: 'auto', label: '自动剪辑', desc: 'AI自动分析并剪辑' },
            { value: 'highlight', label: '精彩集锦', desc: '提取视频高光片段' },
            { value: 'trim', label: '智能裁剪', desc: '裁剪最佳画面比例' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setMode(opt.value)}
              className={`w-full p-3 rounded-lg text-left ${
                mode === opt.value ? 'bg-purple-600/20 border border-purple-500' : 'bg-neutral-700 hover:bg-neutral-600'
              }`}
            >
              <p className="text-sm font-medium">{opt.label}</p>
              <p className="text-xs text-neutral-400">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>
      
      <div className="flex gap-2">
        <button className="flex-1 py-2 bg-neutral-700 rounded text-sm hover:bg-neutral-600">
          上传视频
        </button>
        <button className="flex-1 py-2 bg-purple-600 rounded text-sm hover:bg-purple-700">
          开始剪辑
        </button>
      </div>
    </div>
  );
}

export function LibTVCanvas() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const surfaceRef = useRef<HTMLDivElement>(null);
  
  const [graph, setGraph] = useState<CanvasGraph>({ nodes: [], edges: [] });
  const [models, setModels] = useState<AIModel[]>([]);
  const [showNegativePrompt, setShowNegativePrompt] = useState<Record<string, boolean>>({});
  const [showAdvancedParams, setShowAdvancedParams] = useState<Record<string, boolean>>({});
  const [versionIdx, setVersionIdx] = useState<Record<string, number>>({});
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
  const [, setLinkingHover] = useState<string | null>(null);
  const [linkingMouse, setLinkingMouse] = useState<{ x: number; y: number } | null>(null);
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);
  const [quickAddAt, setQuickAddAt] = useState<{ x: number; y: number } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  
  // LibTV 特有状态
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('workflow');
  const [showTVDirector, setShowTVDirector] = useState(false);
  const [showAssetLibrary, setShowAssetLibrary] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showMinimap, setShowMinimap] = useState(false);
  const [hideEdges, setHideEdges] = useState(false);
  const [gridSnap, setGridSnap] = useState(true);
  const [canvasName, setCanvasName] = useState('未命名工作区');
  const [showCanvasSelector, setShowCanvasSelector] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const [showNodePanel, setShowNodePanel] = useState<string | null>(null);
  const [canvases, setCanvases] = useState<Array<{ id: string; name: string }>>([]);
  const [isStoryPlaying, setIsStoryPlaying] = useState(false);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [storyboardCollapsed, setStoryboardCollapsed] = useState(false);

  const toggleStoryboardCollapse = useCallback(() => {
    setStoryboardCollapsed(prev => !prev);
  }, []);
  
  // 撤销 / 重做栈
  const pastRef = useRef<CanvasGraph[]>([]);
  const futureRef = useRef<CanvasGraph[]>([]);
  const [, setHistoryTick] = useState(0);

  // ---------- 协同：乐观锁 + 串行保存 ----------
  const versionRef = useRef<number>(0);
  const saveChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const [syncMsg, setSyncMsg] = useState('');
  
  // 加载画布列表
  useEffect(() => {
    canvasApi.list(1, 50).then(res => {
      setCanvases(res.list.map(c => ({ id: c.id, name: c.name })));
    }).catch(() => {});
  }, []);
  
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
        if (c) setCanvasName(c.name || '未命名工作区');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);
  
  const loadedOnceRef = useRef(false);
  useEffect(() => {
    if (loading || loadedOnceRef.current) return;
    loadedOnceRef.current = true;
    requestAnimationFrame(() => fitView());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);
  
  /** 保存画布图（串行 + 乐观锁），冲突时自动重载服务端版本 */
  const saveGraph = useCallback(
    (next: CanvasGraph) => {
      saveChainRef.current = saveChainRef.current
        .then(async () => {
          try {
            const res: any = await canvasApi.updateGraph(id!, next, versionRef.current);
            versionRef.current = res?.version ?? versionRef.current;
            setSyncMsg('');
          } catch (err: any) {
            if (err?.response?.status === 409) {
              setSyncMsg('画布已在其他端更新，已为你重新加载最新版本');
              try {
                const fresh = await canvasApi.getGraph(id!);
                setGraph(fresh);
                versionRef.current = (fresh as any)?.version ?? 0;
              } catch {
                /* 忽略 */
              }
            } else {
              console.warn('[libtv-canvas] 保存失败', err);
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
      const prev = graph;
      if (prev !== next) {
        pastRef.current = [...pastRef.current.slice(-49), prev];
        futureRef.current = [];
      }
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
    const target = graph.nodes.find(n => n.id === nodeId);
    let newNodes = graph.nodes.filter((n) => n.id !== nodeId);
    // 如果删除的是 group，清空所有成员的 groupId
    if (target?.type === 'group') {
      newNodes = newNodes.map(n => n.groupId === nodeId ? { ...n, groupId: undefined } : n);
    }
    persist({
      nodes: newNodes,
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
  
  const toggleLock = (nodeId: string) => {
    const node = graph.nodes.find(n => n.id === nodeId);
    if (node) {
      updateNodeLocal(nodeId, { locked: !node.locked });
      persist(graph);
    }
  };
  
  const toggleVisibility = (nodeId: string) => {
    const node = graph.nodes.find(n => n.id === nodeId);
    if (node) {
      updateNodeLocal(nodeId, { visible: !node.visible });
      persist(graph);
    }
  };
  
  const toggleCollapse = (nodeId: string) => {
    const node = graph.nodes.find(n => n.id === nodeId);
    if (node) {
      updateNodeLocal(nodeId, { collapsed: !node.collapsed });
      persist(graph);
    }
  };
  
  const genKeyRef = useRef<Map<string, string>>(new globalThis.Map<string, string>());
  const generateOne = useCallback(async (nodeId: string) => {
    const n = graph.nodes.find((x) => x.id === nodeId);
    if (!n) return;
    if (!n.gen?.prompt?.trim()) {
      setNotice('请先填写 prompt');
      setTimeout(() => setNotice(''), 2000);
      return;
    }
    setBusy(true);
    setNotice('');
    updateNodeLocal(nodeId, { status: 'generating', error: null });
    // 幂等键：生成中重复点击复用同一个 key，避免重复扣费/重复生成
    const existingKey = genKeyRef.current.get(nodeId);
    const clientRequestId =
      n.status === 'generating' && existingKey ? existingKey : newRequestId();
    genKeyRef.current.set(nodeId, clientRequestId);
    try {
      await canvasApi.generateNode(id!, nodeId, clientRequestId);
      const fresh = await canvasApi.getGraph(id!);
      setGraph(fresh);
      setNotice('生成完成');
      setTimeout(() => setNotice(''), 2000);
    } catch (e: any) {
      setNotice(e?.response?.data?.message || e.message || '生成失败');
      setTimeout(() => setNotice(''), 3000);
      updateNodeLocal(nodeId, { status: 'failed', error: e?.response?.data?.message || e.message });
    } finally {
      setBusy(false);
    }
  }, [graph, id, updateNodeLocal]);
  
  const addNode = (type: CanvasNodeType, atX?: number, atY?: number, params?: any) => {
    let x: number, y: number;
    if (atX !== undefined && atY !== undefined) {
      x = atX; y = atY;
    } else if (graph.nodes.length > 0) {
      const rightmost = graph.nodes.reduce((acc, n) =>
        !acc || n.x + n.width > acc.x + acc.width ? n : acc, null as CanvasGraphNode | null);
      x = (rightmost ? rightmost.x + rightmost.width : 100) + 120;
      y = rightmost ? rightmost.y : 100;
    } else {
      x = 200; y = 160;
    }
    const node = makeNode(type, x, y);
    if (params) {
      node.title = params.title || node.title;
      if (params.prompt) node.gen = { ...node.gen!, prompt: params.prompt };
    }
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
      if ((e.key === 'b' || e.key === 'B') && !e.metaKey && !e.ctrlKey && canvasMode === 'workflow' && graph.nodes.length > 0) {
        toggleStoryboardCollapse();
      }
      if (e.key === 'Escape') {
        setLinkingFrom(null);
        setLinkingHover(null);
        setCtxMenu(null);
        setQuickAddAt(null);
        setShowNodePanel(null);
        cancelDelete();
        setShowCanvasSelector(false);
        setShowSettings(false);
        setShowUser(false);
        setShowShortcuts(false);
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
      if (mod && e.key === 'l' && selectedId) {
        e.preventDefault();
        toggleLock(selectedId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, graph, fitView, undo, redo, toggleStoryboardCollapse, canvasMode]);
  
  const onTitleDown = (e: React.PointerEvent, n: CanvasGraphNode) => {
    e.stopPropagation();
    if (n.locked) return;
    setSelectedId(n.id);
    if (linkingFrom) {
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
  
  const onSurfaceDown = (e: React.PointerEvent) => {
    if (linkingFrom) {
      setLinkingFrom(null);
      setLinkingHover(null);
      return;
    }
    if (e.button === 0 && e.target === surfaceRef.current) {
      setSelectedId(null);
      setCtxMenu(null);
      setQuickAddAt(null);
      setShowNodePanel(null);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      setPanning({ sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y });
    }
  };
  
  const onSurfaceMove = (e: React.PointerEvent) => {
    if (drag) {
      const dx = (e.clientX - drag.sx) / zoom;
      const dy = (e.clientY - drag.sy) / zoom;
      let nx = drag.nx + dx;
      let ny = drag.ny + dy;
      if (gridSnap) {
        nx = Math.round(nx / 20) * 20;
        ny = Math.round(ny / 20) * 20;
      }
      updateNodeLocal(drag.id, { x: nx, y: ny });
    } else if (resize) {
      const dx = (e.clientX - resize.sx) / zoom;
      const dy = (e.clientY - resize.sy) / zoom;
      updateNodeLocal(resize.id, {
        width: Math.max(200, resize.nw + dx),
        height: Math.max(200, resize.nh + dy),
      });
    } else if (panning) {
      setPan({ x: panning.px + (e.clientX - panning.sx), y: panning.py + (e.clientY - panning.sy) });
    }
    if (linkingFrom) {
      const r = surfaceRef.current?.getBoundingClientRect();
      if (r) {
        setLinkingMouse({ x: e.clientX - r.left, y: e.clientY - r.top });
      }
    }
  };
  
  const onSurfaceUp = () => {
    if (drag) {
      const n = graph.nodes.find((x) => x.id === drag.id);
      if (n) {
        // 如果不是 group 节点，检查是否进入某个 group 范围内
        if (n.type !== 'group') {
          let newGroupId: string | undefined = undefined;
          for (const g of graph.nodes) {
            if (g.type !== 'group' || g.id === n.id) continue;
            if (
              n.x >= g.x && n.x + n.width <= g.x + g.width &&
              n.y >= g.y && n.y + n.height <= g.y + g.height
            ) {
              newGroupId = g.id;
              break;
            }
          }
          if (newGroupId !== n.groupId) {
            updateNodeLocal(n.id, { groupId: newGroupId });
          }
        }
        persist({ ...graph, nodes: graph.nodes.map((x) => (x.id === drag.id ? { ...x, x: n.x, y: n.y, groupId: n.groupId } : x)) });
      }
    }
    if (resize) {
      const n = graph.nodes.find((x) => x.id === resize.id);
      if (n) persist({ ...graph, nodes: graph.nodes.map((x) => (x.id === resize.id ? { ...x, width: n.width, height: n.height } : x)) });
    }
    setDrag(null);
    setResize(null);
    setPanning(null);
    setLinkingMouse(null);
  };
  
  const onSurfaceDoubleClick = (e: React.MouseEvent) => {
    if (e.target !== surfaceRef.current) return;
    const r = surfaceRef.current.getBoundingClientRect();
    const x = (e.clientX - r.left - pan.x) / zoom;
    const y = (e.clientY - r.top - pan.y) / zoom;
    setQuickAddAt({ x, y });
  };
  
  const onNodeContextMenu = (e: React.MouseEvent, nodeId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, nodeId });
  };
  
  const organizeCanvas = () => {
    if (graph.nodes.length === 0) return;
    const sorted = [...graph.nodes].sort((a, b) => a.y - b.y || a.x - b.x);
    let currentX = 100;
    let currentY = 100;
    const maxHeight = Math.max(...sorted.map((n) => n.height));
    const newNodes = sorted.map((n) => {
      const updated = { ...n, x: currentX, y: currentY };
      currentX += n.width + 80;
      if (currentX > 2000) {
        currentX = 100;
        currentY += maxHeight + 80;
      }
      return updated;
    });
    persist({ ...graph, nodes: newNodes });
    setTimeout(() => fitView(), 100);
  };
  
  const handleTVDirectorAddNode = (type: CanvasNodeType, params?: any) => {
    addNode(type, undefined, undefined, params);
    setNotice(`已添加 ${type} 节点`);
    setTimeout(() => setNotice(''), 2000);
  };
  
  const handleCanvasSelect = (canvasId: string) => {
    navigate(`/libtv-canvas/${canvasId}`);
  };
  
  const handleCreateCanvas = async () => {
    const name = prompt('请输入画布名称', '新画布');
    if (!name) return;
    try {
      const canvas = await canvasApi.create({ name });
      setCanvases(prev => [...prev, { id: canvas.id, name: canvas.name }]);
      navigate(`/libtv-canvas/${canvas.id}`);
    } catch (e) {
      setNotice('创建画布失败');
      setTimeout(() => setNotice(''), 2000);
    }
  };
  
  const handleAssetSelect = (asset: Asset) => {
    if (selectedId) {
      const node = graph.nodes.find(n => n.id === selectedId);
      if (node && (node.type === 'image' || node.type === 'video')) {
        updateNodeLocal(selectedId, { resultUrl: asset.url });
        persist(graph);
        setNotice('资产已添加到节点');
        setTimeout(() => setNotice(''), 2000);
      }
    } else {
      addNode(asset.url.match(/\.(mp4|mov|avi)$/i) ? 'video' : 'image');
    }
  };
  
  const toggleStoryPlay = () => {
    if (isStoryPlaying) {
      setIsStoryPlaying(false);
    } else {
      setIsStoryPlaying(true);
      setCurrentStoryIndex(0);
    }
  };
  
  // 故事板播放逻辑
  useEffect(() => {
    if (!isStoryPlaying) return;
    const interval = setInterval(() => {
      setCurrentStoryIndex(prev => {
        const storyNodes = graph.nodes.filter(n => n.type === 'image' || n.type === 'video' || n.type === 'text');
        if (prev >= storyNodes.length - 1) {
          setIsStoryPlaying(false);
          return 0;
        }
        return prev + 1;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [isStoryPlaying, graph.nodes]);
  
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-neutral-800 text-white">
        <Loader2 size={32} className="animate-spin mr-3" />
        <span>加载画布中...</span>
      </div>
    );
  }
  
  return (
    <div className="h-screen flex flex-col bg-neutral-800 text-white overflow-hidden">
      {syncMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-amber-500 text-white text-xs rounded-lg shadow-lg">
          {syncMsg}
        </div>
      )}
      {/* 左侧图层面板 */}
      {showLayers && (
        <LayerPanel
          nodes={graph.nodes}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onToggleLock={toggleLock}
          onToggleVisibility={toggleVisibility}
          onDelete={(id) => requestDelete(id)}
          onDuplicate={duplicateNode}
          onCollapse={toggleCollapse}
          onClose={() => setShowLayers(false)}
        />
      )}
      
      {/* 主内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* 顶部导航栏 - LibTV 风格 */}
        <header className="h-12 bg-neutral-800 border-b border-neutral-700 flex items-center justify-between px-4 shrink-0 z-40">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/?mode=libtv')}
              className="p-1.5 rounded hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
              title="返回画布列表"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Film size={16} className="text-white" />
              </div>
            </div>
            <input
              value={canvasName}
              onChange={(e) => setCanvasName(e.target.value)}
              className="bg-transparent text-sm font-medium px-2 py-1 rounded hover:bg-neutral-700 focus:bg-neutral-700 focus:outline-none min-w-[120px]"
              placeholder="项目名称"
            />
            <div className="relative">
              <button
                onClick={() => setShowCanvasSelector(!showCanvasSelector)}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-neutral-700 rounded hover:bg-neutral-600"
              >
                {canvasName}
                <ChevronDown size={14} />
              </button>
              {showCanvasSelector && (
                <CanvasSelector
                  currentCanvas={{ id: id!, name: canvasName }}
                  canvases={canvases}
                  onSelect={handleCanvasSelect}
                  onCreateNew={handleCreateCanvas}
                  onClose={() => setShowCanvasSelector(false)}
                />
              )}
            </div>
            <div className="flex items-center gap-1 ml-2">
              <button
                onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
                className="p-1.5 rounded hover:bg-neutral-700"
                title="放大"
              >
                <ZoomIn size={14} />
              </button>
              <span className="text-xs text-neutral-400 min-w-[40px] text-center">{Math.round(zoom * 100)}%</span>
              <button
                onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}
                className="p-1.5 rounded hover:bg-neutral-700"
                title="缩小"
              >
                <ZoomOut size={14} />
              </button>
              <button
                onClick={() => setZoom(1)}
                className="p-1.5 rounded hover:bg-neutral-700"
                title="重置缩放"
              >
                <RotateCcw size={14} />
              </button>
            </div>
            <button
              onClick={organizeCanvas}
              className="p-1.5 rounded hover:bg-neutral-700"
              title="整理画布"
            >
              <AlignJustify size={14} />
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            {/* 模式切换 */}
            <div className="flex items-center bg-neutral-700 rounded-lg p-0.5 mr-2">
              <button
                onClick={() => setCanvasMode('workflow')}
                className={`px-3 py-1 text-xs rounded transition-all ${
                  canvasMode === 'workflow' ? 'bg-neutral-600 text-white' : 'text-neutral-400 hover:text-white'
                }`}
              >
                工作流
              </button>
              <button
                onClick={() => setCanvasMode('storyboard')}
                className={`px-3 py-1 text-xs rounded transition-all ${
                  canvasMode === 'storyboard' ? 'bg-neutral-600 text-white' : 'text-neutral-400 hover:text-white'
                }`}
              >
                故事板
              </button>
            </div>
            
            <button
              onClick={() => setShowTVDirector(!showTVDirector)}
              className={`p-2 rounded-lg transition-colors ${
                showTVDirector ? 'bg-purple-600 text-white' : 'bg-neutral-700 hover:bg-neutral-600'
              }`}
              title="TV Director"
            >
              <Wand2Icon size={16} />
            </button>
            <button
              onClick={() => setShowAssetLibrary(!showAssetLibrary)}
              className={`p-2 rounded-lg transition-colors ${
                showAssetLibrary ? 'bg-purple-600 text-white' : 'bg-neutral-700 hover:bg-neutral-600'
              }`}
              title="资产管理"
            >
              <FolderOpen size={16} />
            </button>
            <button
              onClick={() => setShowLayers(!showLayers)}
              className={`p-2 rounded-lg transition-colors ${
                showLayers ? 'bg-purple-600 text-white' : 'bg-neutral-700 hover:bg-neutral-600'
              }`}
              title="图层"
            >
              <Layers size={16} />
            </button>
          </div>
          
          {/* 设置面板 */}
          {showSettings && (
            <SettingsPanel
              onClose={() => setShowSettings(false)}
              gridSnap={gridSnap}
              onGridSnapChange={(v) => setGridSnap(v)}
              zoom={zoom}
              onZoomChange={setZoom}
            />
          )}
          
          {/* 用户面板 */}
          {showUser && (
            <UserPanel onClose={() => setShowUser(false)} />
          )}
        </header>
        
        {/* 画布内容区 */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* 小地图 */}
          {showMinimap && graph.nodes.length > 0 && (
            <div className="absolute top-4 left-4 z-30">
              <Minimap
                nodes={graph.nodes}
                pan={pan}
                zoom={zoom}
                containerWidth={800}
                containerHeight={600}
                onNavigate={(newPan) => setPan(newPan)}
              />
            </div>
          )}
          
          {canvasMode === 'workflow' ? (
            /* 工作流模式 */
            <div
              ref={surfaceRef}
              className="flex-1 overflow-hidden relative"
              style={{
                background: gridSnap 
                  ? `
                    linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)
                  `
                  : 'transparent',
                backgroundSize: gridSnap ? `${20 * zoom}px ${20 * zoom}px` : 'auto',
                backgroundPosition: gridSnap ? `${pan.x}px ${pan.y}px` : '0 0',
              }}
              onPointerDown={onSurfaceDown}
              onPointerMove={onSurfaceMove}
              onPointerUp={onSurfaceUp}
              onDoubleClick={onSurfaceDoubleClick}
            >
              {/* 节点列表 */}
              {graph.nodes.filter(n => {
                if (n.visible === false) return false;
                if (n.groupId) {
                  const g = graph.nodes.find(x => x.id === n.groupId);
                  if (g?.collapsed) return false;
                }
                return true;
              }).map((node) => (
                <div
                  key={node.id}
                  className={`absolute border rounded-lg overflow-hidden transition-shadow ${
                    node.type === 'group'
                      ? 'bg-blue-500/10 border-dashed'
                      : 'bg-neutral-800'
                  } ${
                    selectedId === node.id
                      ? 'border-purple-500 shadow-lg shadow-purple-500/20'
                      : node.type === 'group'
                      ? 'border-blue-400/40 hover:border-blue-400/60'
                      : 'border-neutral-700 hover:border-neutral-600'
                  } ${node.locked ? 'opacity-80' : ''}`}
                  style={{
                    left: node.x * zoom + pan.x,
                    top: node.y * zoom + pan.y,
                    width: node.width * zoom,
                    height: node.collapsed ? 48 * zoom : node.height * zoom,
                    zIndex: node.zIndex,
                    display: node.visible === false ? 'none' : 'block',
                  }}
                  onClick={(e) => onNodeBodyClick(e as unknown as React.PointerEvent, node)}
                  onContextMenu={(e) => onNodeContextMenu(e, node.id)}
                >
                  {/* 节点标题栏 */}
                  <div
                    className={`h-10 px-3 flex items-center justify-between border-b shrink-0 cursor-move ${
                      node.locked ? 'cursor-not-allowed' : ''
                    } ${
                      node.type === 'image' ? 'bg-purple-600/20 border-purple-500/30' :
                      node.type === 'video' ? 'bg-blue-600/20 border-blue-500/30' :
                      node.type === 'text' ? 'bg-green-600/20 border-green-500/30' :
                      node.type === 'media' ? 'bg-yellow-600/20 border-yellow-500/30' :
                      node.type === 'group' ? 'bg-blue-500/15 border-blue-400/30' :
                      'bg-neutral-700/50 border-neutral-600/30'
                    }`}
                    onPointerDown={(e) => onTitleDown(e, node)}
                  >
                    <div className="flex items-center gap-2">
                      {node.type === 'image' && <ImageIcon size={14} className="text-purple-400" />}
                      {node.type === 'video' && <VideoIcon size={14} className="text-blue-400" />}
                      {node.type === 'text' && <TypeIcon size={14} className="text-green-400" />}
                      {node.type === 'media' && <AudioLines size={14} className="text-yellow-400" />}
                      {node.type === 'group' && <Layout size={14} className="text-blue-400" />}
                      <span className="text-sm font-medium truncate">{node.title || node.type}</span>
                      {node.locked && <Lock size={12} className="text-yellow-400" />}
                    </div>
                    <div className="flex items-center gap-1">
                      {node.type === 'group' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleCollapse(node.id); }}
                          className="p-1 rounded hover:bg-neutral-600"
                          title={node.collapsed ? '展开' : '折叠'}
                        >
                          {node.collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleLock(node.id); }}
                        className="p-1 rounded hover:bg-neutral-600"
                        title={node.locked ? '解锁' : '锁定'}
                      >
                        {node.locked ? <Lock size={12} /> : <Unlock size={12} />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleVisibility(node.id); }}
                        className="p-1 rounded hover:bg-neutral-600"
                        title={node.visible ? '隐藏' : '显示'}
                      >
                        {node.visible ? <Eye size={12} /> : <EyeOffIcon size={12} />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); requestDelete(node.id, e as unknown as React.MouseEvent); }}
                        className="p-1 rounded hover:bg-red-600/50"
                        title="删除"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  
                  {/* 节点内容 */}
                  {!node.collapsed && (
                    <div className="p-3 space-y-2 overflow-auto" style={{ height: `calc(100% - 40px)` }}>
                      {/* 节点信息条 */}
                      <div className="flex items-center justify-between pb-2 border-b border-neutral-700/50">
                        <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                          {node.type === 'image' && <><ImageIcon size={12} className="text-purple-400" />图片生成</>}
                          {node.type === 'video' && <><VideoIcon size={12} className="text-blue-400" />视频生成</>}
                          {node.type === 'text' && <><TypeIcon size={12} className="text-green-400" />文本</>}
                          {node.type === 'media' && <><AudioLines size={12} className="text-yellow-400" />音频生成</>}
                          {node.type === 'group' && <><Layout size={12} className="text-blue-400" />分组</>}
                          {node.type === 'editor' && <><Scissors size={12} className="text-neutral-400" />图片编辑器</>}
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          {Math.round(node.width)} × {Math.round(node.height)}
                        </div>
                      </div>

                      {/* 状态指示器 */}
                      {node.status === 'generating' && (
                        <div className="flex items-center gap-2 text-sm text-purple-400">
                          <Loader2 size={14} className="animate-spin" />
                          生成中...
                        </div>
                      )}
                      {node.status === 'failed' && (
                        <div className="flex items-center gap-2 text-sm text-red-400">
                          <AlertCircle size={14} />
                          {node.error || '生成失败'}
                        </div>
                      )}
                      
                      {/* 内容区域 */}
                      {(node.type === 'image' || node.type === 'video') && (
                        <div className="space-y-2">
                          {/* 参考图 */}
                          {(() => {
                            const incoming = graph.edges.filter(e => e.to === node.id);
                            if (incoming.length === 0) return null;
                            return (
                              <div className="flex flex-wrap gap-1.5">
                                {incoming.map(edge => {
                                  const src = graph.nodes.find(n => n.id === edge.from);
                                  const role = edge.role || 'image';
                                  return (
                                    <div key={edge.id} className="flex items-center gap-1 bg-neutral-900 border border-neutral-700 rounded px-1.5 py-0.5">
                                      {src?.resultUrl ? (
                                        <img src={src.resultUrl} alt="" className="w-6 h-6 rounded object-cover" />
                                      ) : (
                                        <div className="w-6 h-6 rounded bg-neutral-700 flex items-center justify-center">
                                          <ImageIcon size={12} className="text-neutral-500" />
                                        </div>
                                      )}
                                      <span className="text-[10px] text-neutral-400 uppercase">{role}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}

                          {/* 版本切换条 */}
                          {node.versions && node.versions.length > 1 && (
                            <div className="flex items-center justify-center gap-3 text-xs text-neutral-400">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const idx = versionIdx[node.id] ?? 0;
                                  const newIdx = Math.max(0, idx - 1);
                                  setVersionIdx(v => ({ ...v, [node.id]: newIdx }));
                                }}
                                disabled={(versionIdx[node.id] ?? 0) === 0}
                                className="p-1 rounded hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <ChevronLeft size={14} />
                              </button>
                              <span className="text-neutral-300 font-medium">
                                {(versionIdx[node.id] ?? 0) + 1} / {node.versions.length}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const idx = versionIdx[node.id] ?? 0;
                                  const newIdx = Math.min(node.versions!.length - 1, idx + 1);
                                  setVersionIdx(v => ({ ...v, [node.id]: newIdx }));
                                }}
                                disabled={(versionIdx[node.id] ?? 0) >= (node.versions?.length ?? 1) - 1}
                                className="p-1 rounded hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <ChevronRight size={14} />
                              </button>
                            </div>
                          )}

                          {/* 结果预览 */}
                          {(() => {
                            const vIdx = versionIdx[node.id] ?? 0;
                            const displayUrl = (node.versions && node.versions.length > 1)
                              ? node.versions[vIdx]?.resultUrl
                              : node.resultUrl;
                            if (!displayUrl) return null;
                            if (node.type === 'image') {
                              return <img src={displayUrl} alt={node.title} className="w-full rounded" />;
                            }
                            return <video src={displayUrl} controls className="w-full rounded" />;
                          })()}

                          <textarea
                            value={node.gen?.prompt || ''}
                            onChange={(e) => updateGen(node.id, { prompt: e.target.value })}
                            placeholder={node.type === 'image' ? '输入图片描述...' : '输入视频描述...'}
                            className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm resize-none h-20 focus:outline-none focus:border-purple-500"
                          />
                          {/* 模型 + 尺寸 行内 */}
                          <div className="flex gap-2">
                            <select
                              value={node.gen?.model || ''}
                              onChange={(e) => updateGen(node.id, { model: e.target.value })}
                              className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-purple-500"
                            >
                              {models.length > 0 ? (
                                models.map(m => (
                                  <option key={m.id} value={m.id}>{m.name}</option>
                                ))
                              ) : (
                                <option value={node.gen?.model || ''}>{node.gen?.model || '默认模型'}</option>
                              )}
                            </select>
                            <select
                              value={node.gen?.aspectRatio || '1024x1024'}
                              onChange={(e) => updateGen(node.id, { aspectRatio: e.target.value })}
                              className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-purple-500"
                            >
                              <option value="1024x1024">1:1 (1024)</option>
                              <option value="512x512">1:1 (512)</option>
                              <option value="768x1344">9:16 (768×1344)</option>
                              <option value="1344x768">16:9 (1344×768)</option>
                            </select>
                          </div>
                          {/* 生成数量 */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-neutral-400 w-14">数量</span>
                            <div className="flex gap-1">
                              {[1, 2, 4].map(n => (
                                <button
                                  key={n}
                                  onClick={() => updateGen(node.id, { count: n })}
                                  className={`px-2 py-0.5 text-xs rounded ${
                                    (node.gen?.count ?? 1) === n
                                      ? 'bg-purple-600 text-white'
                                      : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
                                  }`}
                                >
                                  {n}
                                </button>
                              ))}
                            </div>
                          </div>
                          {/* 负向提示词 */}
                          <div>
                            <button
                              onClick={(e) => { e.stopPropagation(); setShowNegativePrompt(s => ({ ...s, [node.id]: !s[node.id] })); }}
                              className="text-xs text-neutral-400 hover:text-purple-400 flex items-center gap-1"
                            >
                              <ChevronDown size={12} style={{ transform: showNegativePrompt[node.id] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                              负向提示词
                            </button>
                            {showNegativePrompt[node.id] && (
                              <textarea
                                value={node.gen?.negativePrompt || ''}
                                onChange={(e) => updateGen(node.id, { negativePrompt: e.target.value })}
                                placeholder="描述不希望出现的内容..."
                                className="mt-1 w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-xs resize-none h-16 focus:outline-none focus:border-purple-500"
                              />
                            )}
                          </div>
                          {/* 高级参数 */}
                          <div>
                            <button
                              onClick={(e) => { e.stopPropagation(); setShowAdvancedParams(s => ({ ...s, [node.id]: !s[node.id] })); }}
                              className="text-xs text-neutral-400 hover:text-purple-400 flex items-center gap-1"
                            >
                              <ChevronDown size={12} style={{ transform: showAdvancedParams[node.id] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                              高级参数
                            </button>
                            {showAdvancedParams[node.id] && (
                              <div className="mt-1 space-y-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-neutral-400 w-14 shrink-0">种子</span>
                                  <input
                                    type="number"
                                    value={node.gen?.seed ?? ''}
                                    onChange={(e) => updateGen(node.id, { seed: e.target.value ? Number(e.target.value) : undefined })}
                                    placeholder="随机"
                                    className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-purple-500"
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-neutral-400 w-14 shrink-0">风格</span>
                                  <select
                                    value={node.gen?.style || ''}
                                    onChange={(e) => updateGen(node.id, { style: e.target.value || undefined })}
                                    className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-purple-500"
                                  >
                                    <option value="">通用</option>
                                    <option value="realistic">写实</option>
                                    <option value="anime">动漫</option>
                                    <option value="illustration">插画</option>
                                    <option value="3d">3D</option>
                                    <option value="oil">油画</option>
                                    <option value="watercolor">水彩</option>
                                    <option value="cyberpunk">赛博朋克</option>
                                  </select>
                                </div>
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => generateOne(node.id)}
                            disabled={busy || node.status === 'generating'}
                            className="w-full py-1.5 bg-purple-600 hover:bg-purple-700 rounded text-sm font-medium disabled:opacity-50"
                          >
                            {node.status === 'generating' ? '生成中...' : '生成'}
                          </button>
                          {/* 操作按钮组 */}
                          {node.resultUrl && (
                            <div className="flex gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const vIdx = versionIdx[node.id] ?? 0;
                                  const url = (node.versions && node.versions.length > 1)
                                    ? node.versions[vIdx]?.resultUrl
                                    : node.resultUrl;
                                  if (!url) return;
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = `${node.title || 'result'}_${vIdx + 1}${node.type === 'video' ? '.mp4' : '.png'}`;
                                  a.target = '_blank';
                                  document.body.appendChild(a);
                                  a.click();
                                  document.body.removeChild(a);
                                }}
                                className="flex-1 py-1.5 bg-neutral-700 hover:bg-neutral-600 rounded text-xs flex items-center justify-center gap-1"
                              >
                                <Download size={12} />
                                下载
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setNotice('已添加到资产库');
                                  setTimeout(() => setNotice(''), 2000);
                                }}
                                className="flex-1 py-1.5 bg-neutral-700 hover:bg-neutral-600 rounded text-xs flex items-center justify-center gap-1"
                              >
                                <Plus size={12} />
                                添加到资产库
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {node.type === 'media' && (
                        <div className="space-y-2">
                          <textarea
                            value={node.gen?.prompt || ''}
                            onChange={(e) => updateGen(node.id, { prompt: e.target.value })}
                            placeholder="描述你想生成的音频..."
                            className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm resize-none h-20 focus:outline-none focus:border-purple-500"
                          />
                          {/* 模型选择 */}
                          <select
                            value={node.gen?.model || 'mock-audio'}
                            onChange={(e) => updateGen(node.id, { model: e.target.value })}
                            className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-purple-500"
                          >
                            {(() => {
                              const audioModels = models.filter(m =>
                                (m as any).type === 'audio' || m.id.toLowerCase().includes('audio') || m.name.toLowerCase().includes('音频')
                              );
                              if (audioModels.length > 0) {
                                return audioModels.map(m => (
                                  <option key={m.id} value={m.id}>{m.name}</option>
                                ));
                              }
                              return <option value="mock-audio">Mock 音频生成</option>;
                            })()}
                          </select>
                          {/* 风格预设 */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-neutral-400 w-14 shrink-0">风格</span>
                            <select
                              value={node.gen?.style || ''}
                              onChange={(e) => updateGen(node.id, { style: e.target.value || undefined })}
                              className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-purple-500"
                            >
                              <option value="">通用</option>
                              <option value="upbeat">轻快</option>
                              <option value="relaxing">舒缓</option>
                              <option value="tense">紧张</option>
                              <option value="epic">史诗</option>
                              <option value="warm">温馨</option>
                            </select>
                          </div>
                          {/* 时长选择 */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-neutral-400 w-14">时长</span>
                            <div className="flex gap-1">
                              {[5, 10, 30].map(d => (
                                <button
                                  key={d}
                                  onClick={() => updateGen(node.id, { duration: d })}
                                  className={`px-2 py-0.5 text-xs rounded ${
                                    (node.gen?.duration ?? 10) === d
                                      ? 'bg-purple-600 text-white'
                                      : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
                                  }`}
                                >
                                  {d}s
                                </button>
                              ))}
                            </div>
                          </div>
                          {node.resultUrl && (
                            <audio controls className="w-full">
                              <source src={node.resultUrl} />
                            </audio>
                          )}
                          <button
                            onClick={() => generateOne(node.id)}
                            disabled={busy || node.status === 'generating'}
                            className="w-full py-1.5 bg-purple-600 hover:bg-purple-700 rounded text-sm font-medium disabled:opacity-50"
                          >
                            {node.status === 'generating' ? '生成中...' : '生成音频'}
                          </button>
                          {/* 下载按钮 */}
                          {node.resultUrl && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const a = document.createElement('a');
                                a.href = node.resultUrl!;
                                a.download = `${node.title || 'audio'}.mp3`;
                                a.target = '_blank';
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                              }}
                              className="w-full py-1.5 bg-neutral-700 hover:bg-neutral-600 rounded text-xs flex items-center justify-center gap-1"
                            >
                              <Download size={12} />
                              下载
                            </button>
                          )}
                        </div>
                      )}
                      {node.type === 'group' && (
                        <div className="space-y-2">
                          {/* 分组标题输入 */}
                          <input
                            type="text"
                            value={node.title || ''}
                            onChange={(e) => {
                              updateNodeLocal(node.id, { title: e.target.value });
                            }}
                            onBlur={() => persist(graph)}
                            placeholder="分组名称"
                            className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm font-medium focus:outline-none focus:border-purple-500"
                          />
                          {/* 成员计数 */}
                          <div className="text-xs text-neutral-400">
                            {graph.nodes.filter(n => n.groupId === node.id).length} 个成员
                          </div>
                          {/* 成员列表 */}
                          <div className="space-y-1 max-h-40 overflow-auto">
                            {graph.nodes.filter(n => n.groupId === node.id).length === 0 ? (
                              <div className="text-[11px] text-neutral-500 text-center py-4">
                                拖动节点到此处加入分组
                              </div>
                            ) : (
                              graph.nodes.filter(n => n.groupId === node.id).map(member => (
                                <button
                                  key={member.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedId(member.id);
                                    // 定位到该节点
                                    const targetX = member.x * zoom + pan.x - 100;
                                    const targetY = member.y * zoom + pan.y - 100;
                                    setPan({ x: -targetX + 200, y: -targetY + 150 });
                                  }}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-neutral-700/50 transition-colors"
                                >
                                  {member.type === 'image' && <ImageIcon size={12} className="text-purple-400 shrink-0" />}
                                  {member.type === 'video' && <VideoIcon size={12} className="text-blue-400 shrink-0" />}
                                  {member.type === 'text' && <TypeIcon size={12} className="text-green-400 shrink-0" />}
                                  {member.type === 'media' && <AudioLines size={12} className="text-yellow-400 shrink-0" />}
                                  {(member.type !== 'image' && member.type !== 'video' && member.type !== 'text' && member.type !== 'media') && (
                                    <Layout size={12} className="text-neutral-400 shrink-0" />
                                  )}
                                  <span className="text-xs text-neutral-300 truncate flex-1">
                                    {member.title || member.type}
                                  </span>
                                </button>
                              ))
                            )}
                          </div>
                          {/* 全部移除按钮 */}
                          {graph.nodes.filter(n => n.groupId === node.id).length > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const newNodes = graph.nodes.map(n =>
                                  n.groupId === node.id ? { ...n, groupId: undefined } : n
                                );
                                persist({ ...graph, nodes: newNodes });
                              }}
                              className="w-full py-1.5 bg-neutral-700 hover:bg-neutral-600 rounded text-xs text-neutral-300"
                            >
                              全部移除
                            </button>
                          )}
                        </div>
                      )}
                      {node.type === 'text' && (
                        <div className="space-y-2 h-full flex flex-col">
                          <input
                            type="text"
                            value={node.title || ''}
                            onChange={(e) => {
                              updateNodeLocal(node.id, { title: e.target.value });
                            }}
                            onBlur={() => persist(graph)}
                            placeholder="文本标题"
                            className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-purple-500"
                          />
                          <div className="relative flex-1">
                            <textarea
                              value={(node as ExtendedCanvasGraphNode).content || ''}
                              onChange={(e) => {
                                updateNodeLocal(node.id, { content: e.target.value } as Partial<CanvasGraphNode>);
                              }}
                              onBlur={() => persist(graph)}
                              placeholder="输入文本内容..."
                              className="w-full h-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm resize-none focus:outline-none focus:border-purple-500"
                            />
                            <div className="absolute bottom-1 right-2 text-[10px] text-neutral-500 pointer-events-none">
                              {((node as ExtendedCanvasGraphNode).content || '').length} 字
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* 连接点 - 输出 */}
                  <div
                    className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-neutral-600 border-2 border-neutral-500 rounded-full cursor-crosshair hover:border-purple-500 hover:bg-purple-500 transition-all z-50"
                    title="拖动创建连线"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setLinkingFrom(node.id);
                    }}
                  />
                  {/* 连接点 - 输入 */}
                  <div
                    className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-neutral-600 border-2 border-neutral-500 rounded-full transition-all z-50"
                    title="连接到这里"
                    onPointerEnter={() => linkingFrom && setLinkingHover(node.id)}
                    onPointerLeave={() => setLinkingHover(null)}
                  />
                </div>
              ))}
              
              {/* 连线 - 应用 zoom 和 pan 变换 */}
              {!hideEdges && graph.edges.map((edge) => {
                const from = graph.nodes.find((n) => n.id === edge.from);
                const to = graph.nodes.find((n) => n.id === edge.to);
                if (!from || !to) return null;
                // 连线坐标需要应用 zoom 和 pan 变换
                const x1 = (from.x + from.width) * zoom + pan.x;
                const y1 = from.y * zoom + pan.y + (from.height * zoom) / 2;
                const x2 = to.x * zoom + pan.x;
                const y2 = to.y * zoom + pan.y + (to.height * zoom) / 2;
                const midX = (x1 + x2) / 2;
                return (
                  <svg
                    key={edge.id}
                    className="absolute top-0 left-0 w-full h-full pointer-events-none"
                    style={{ overflow: 'visible' }}
                  >
                    <path
                      d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke={hoverEdgeId === edge.id ? '#a855f7' : '#525252'}
                      strokeWidth={2 * zoom}
                      className="pointer-events-auto cursor-pointer"
                      onMouseEnter={() => setHoverEdgeId(edge.id)}
                      onMouseLeave={() => setHoverEdgeId(null)}
                      onClick={() => deleteEdge(edge.id)}
                    />
                    {hoverEdgeId === edge.id && (
                      <circle cx={x2} cy={y2} r={4 * zoom} fill="#a855f7" className="pointer-events-auto" />
                    )}
                  </svg>
                );
              })}
              
              {/* 连线模式提示 */}
              {linkingFrom && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-purple-600/90 text-white text-xs shadow-lg z-50">
                  点击目标节点创建连线 · 按 ESC 取消
                </div>
              )}
              
              {/* 连线中 - 鼠标跟随线 */}
              {linkingFrom && linkingMouse && (
                (() => {
                  const fromNode = graph.nodes.find((n) => n.id === linkingFrom);
                  if (!fromNode) return null;
                  const x1 = (fromNode.x + fromNode.width) * zoom + pan.x;
                  const y1 = fromNode.y * zoom + pan.y + (fromNode.height * zoom) / 2;
                  return (
                    <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
                      <line
                        x1={x1}
                        y1={y1}
                        x2={linkingMouse.x}
                        y2={linkingMouse.y}
                        stroke="#a855f7"
                        strokeWidth={2 * zoom}
                        strokeDasharray={`${4 * zoom}`}
                      />
                    </svg>
                  );
                })()
              )}
              
              {/* 双击空白处提示 */}
              {graph.nodes.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-neutral-500 text-sm flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center">
                      <Plus size={16} />
                    </div>
                    双击画布 自由生成节点
                  </div>
                </div>
              )}
              
              {/* 快速添加菜单 */}
              {quickAddAt && (
                <div
                  className="absolute bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl py-1 z-50"
                  style={{ left: quickAddAt.x * zoom + pan.x, top: quickAddAt.y * zoom + pan.y }}
                >
                  <button
                    onClick={() => { addNode('image', quickAddAt.x, quickAddAt.y); setQuickAddAt(null); }}
                    className="w-full px-4 py-2 text-sm text-left hover:bg-neutral-700 flex items-center gap-2"
                  >
                    <ImageIcon size={14} />
                    图片生成
                  </button>
                  <button
                    onClick={() => { addNode('video', quickAddAt.x, quickAddAt.y); setQuickAddAt(null); }}
                    className="w-full px-4 py-2 text-sm text-left hover:bg-neutral-700 flex items-center gap-2"
                  >
                    <VideoIcon size={14} />
                    视频生成
                  </button>
                  <button
                    onClick={() => { addNode('media', quickAddAt.x, quickAddAt.y); setQuickAddAt(null); }}
                    className="w-full px-4 py-2 text-sm text-left hover:bg-neutral-700 flex items-center gap-2"
                  >
                    <AudioLines size={14} />
                    音频生成
                  </button>
                  <button
                    onClick={() => { addNode('text', quickAddAt.x, quickAddAt.y); setQuickAddAt(null); }}
                    className="w-full px-4 py-2 text-sm text-left hover:bg-neutral-700 flex items-center gap-2"
                  >
                    <TypeIcon size={14} />
                    文本
                  </button>
                  <button
                    onClick={() => { addNode('group', quickAddAt.x, quickAddAt.y); setQuickAddAt(null); }}
                    className="w-full px-4 py-2 text-sm text-left hover:bg-neutral-700 flex items-center gap-2"
                  >
                    <Layout size={14} />
                    分组
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* 故事板模式 */
            <div className="w-full h-full overflow-auto p-6 space-y-6">
              {/* 文本节点 */}
              <div className="bg-neutral-800 rounded-lg p-4">
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <TypeIcon size={14} />
                  文本 ({graph.nodes.filter(n => n.type === 'text').length})
                </h3>
                {graph.nodes.filter(n => n.type === 'text').length === 0 ? (
                  <div className="text-neutral-500 text-sm">暂无文本节点</div>
                ) : (
                  <div className="space-y-2">
                    {graph.nodes.filter(n => n.type === 'text').map(node => (
                      <div
                        key={node.id}
                        onClick={() => { setSelectedId(node.id); setCanvasMode('workflow'); }}
                        className="p-2 bg-neutral-700 rounded text-sm cursor-pointer hover:bg-neutral-600"
                      >
                        {node.title || '未命名文本'}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* 图片节点 */}
              <div className="bg-neutral-800 rounded-lg p-4">
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <ImageIcon size={14} />
                  图片 ({graph.nodes.filter(n => n.type === 'image').length})
                </h3>
                {graph.nodes.filter(n => n.type === 'image').length === 0 ? (
                  <div className="text-neutral-500 text-sm">暂无图片节点</div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {graph.nodes.filter(n => n.type === 'image').map(node => (
                      <div
                        key={node.id}
                        onClick={() => { setSelectedId(node.id); setCanvasMode('workflow'); }}
                        className="bg-neutral-700 rounded overflow-hidden cursor-pointer hover:ring-2 hover:ring-purple-500"
                      >
                        {node.resultUrl ? (
                          <img src={node.resultUrl} alt={node.title} className="w-full aspect-square object-cover" />
                        ) : (
                          <div className="w-full aspect-square flex items-center justify-center text-neutral-500">
                            <ImageIcon size={24} />
                          </div>
                        )}
                        <div className="p-2 text-xs text-neutral-400 truncate">{node.title || '未命名'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* 视频节点 */}
              <div className="bg-neutral-800 rounded-lg p-4">
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <VideoIcon size={14} />
                  视频 ({graph.nodes.filter(n => n.type === 'video').length})
                </h3>
                {graph.nodes.filter(n => n.type === 'video').length === 0 ? (
                  <div className="text-neutral-500 text-sm">暂无视频节点</div>
                ) : (
                  <div className="space-y-3">
                    {graph.nodes.filter(n => n.type === 'video').map(node => (
                      <div
                        key={node.id}
                        onClick={() => { setSelectedId(node.id); setCanvasMode('workflow'); }}
                        className="bg-neutral-700 rounded overflow-hidden cursor-pointer hover:ring-2 hover:ring-purple-500"
                      >
                        {node.resultUrl ? (
                          <video src={node.resultUrl} controls className="w-full" />
                        ) : (
                          <div className="w-full aspect-video flex items-center justify-center text-neutral-500">
                            <VideoIcon size={32} />
                          </div>
                        )}
                        <div className="p-2 text-sm">{node.title || '未命名'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* TV Director 面板 */}
          {showTVDirector && (
            <TVDirectorPanel
              onAddNode={handleTVDirectorAddNode}
            />
          )}
          
          {/* 资产管理面板 */}
          {showAssetLibrary && (
            <AssetLibraryPanel
              onClose={() => setShowAssetLibrary(false)}
              onSelectAsset={handleAssetSelect}
              canvasId={id!}
            />
          )}
          
          {/* 故事板面板 */}
          {canvasMode === 'workflow' && graph.nodes.length > 0 && (
            <StoryboardPanel
              graph={graph}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onPlay={toggleStoryPlay}
              isPlaying={isStoryPlaying}
              currentStoryIndex={currentStoryIndex}
              collapsed={storyboardCollapsed}
              onToggleCollapse={toggleStoryboardCollapse}
            />
          )}
        </div>
      </div>
      
      {/* 底部节点类型栏 */}
      <div className="h-14 bg-neutral-800 border-t border-neutral-700 flex items-center px-4 gap-2 overflow-x-auto shrink-0">
        <button
          onClick={() => addNode('image')}
          className="flex items-center gap-2 px-4 py-2 bg-neutral-700 rounded-lg hover:bg-neutral-600 whitespace-nowrap"
        >
          <ImageIcon size={16} />
          图片生成
        </button>
        <button
          onClick={() => addNode('video')}
          className="flex items-center gap-2 px-4 py-2 bg-neutral-700 rounded-lg hover:bg-neutral-600 whitespace-nowrap"
        >
          <VideoIcon size={16} />
          视频生成
        </button>
        <button
          onClick={() => addNode('media')}
          className="flex items-center gap-2 px-4 py-2 bg-neutral-700 rounded-lg hover:bg-neutral-600 whitespace-nowrap"
        >
          <AudioLines size={16} />
          音频生成
        </button>
        <button
          onClick={() => {
            const node = makeNode('text' as CanvasNodeType, 200, 200);
            node.title = '剧本节点';
            node.type = 'text';
            persist({ ...graph, nodes: [...graph.nodes, node] });
            setSelectedId(node.id);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-neutral-700 rounded-lg hover:bg-neutral-600 whitespace-nowrap"
        >
          <Scenarist size={16} />
          剧本生成
        </button>
        <button
          onClick={() => addNode('group')}
          className="flex items-center gap-2 px-4 py-2 bg-neutral-700 rounded-lg hover:bg-neutral-600 whitespace-nowrap"
        >
          <Layout size={16} />
          分组
        </button>
        <button
          onClick={() => setShowNodePanel('smartEdit')}
          className="flex items-center gap-2 px-4 py-2 bg-neutral-700 rounded-lg hover:bg-neutral-600 whitespace-nowrap"
        >
          <Scissors size={16} />
          智能剪辑
        </button>
        <button
          onClick={() => setShowAssetLibrary(!showAssetLibrary)}
          className="flex items-center gap-2 px-4 py-2 bg-neutral-700 rounded-lg hover:bg-neutral-600 whitespace-nowrap"
        >
          <FolderOpen size={16} />
          资产管理
        </button>
      </div>
      
      {/* 智能剪辑面板 */}
      {showNodePanel === 'smartEdit' && (
        <div className="absolute bottom-16 right-4 w-80 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl z-50">
          <div className="p-3 border-b border-neutral-700 flex items-center justify-between">
            <span className="text-sm font-medium">智能剪辑</span>
            <button onClick={() => setShowNodePanel(null)} className="p-1 rounded hover:bg-neutral-700">
              <X size={14} />
            </button>
          </div>
          <div className="p-4">
            <SmartEditingPanel onClose={() => setShowNodePanel(null)} />
          </div>
        </div>
      )}
      
      {/* 底部工具栏 */}
      <div className="h-10 bg-neutral-900 border-t border-neutral-800 flex items-center px-4 gap-1 shrink-0">
        <button
          onClick={() => setShowAssetLibrary(!showAssetLibrary)}
          className={`p-1.5 rounded ${showAssetLibrary ? 'bg-neutral-700' : 'hover:bg-neutral-800'}`}
          title="资产管理"
        >
          <FolderOpen size={14} />
        </button>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`p-1.5 rounded ${showSettings ? 'bg-neutral-700' : 'hover:bg-neutral-800'}`}
          title="设置"
        >
          <SettingsIcon size={14} />
        </button>
        <button
          onClick={() => setShowUser(!showUser)}
          className={`p-1.5 rounded ${showUser ? 'bg-neutral-700' : 'hover:bg-neutral-800'}`}
          title="用户"
        >
          <User size={14} />
        </button>
        <button
          onClick={() => setShowLayers(!showLayers)}
          className={`p-1.5 rounded ${showLayers ? 'bg-neutral-700' : 'hover:bg-neutral-800'}`}
          title="图层"
        >
          <Layers size={14} />
        </button>
        <button className="p-1.5 rounded hover:bg-neutral-800" title="链接">
          <Link2 size={14} />
        </button>
        <div className="flex items-center gap-1 px-2 py-1 text-xs">
          <Zap size={12} className="text-yellow-400" />
          <span>100</span>
        </div>
        <div className="w-px h-5 bg-neutral-700 mx-1" />
        <button
          onClick={() => addNode('image')}
          className="p-1.5 rounded bg-purple-600 hover:bg-purple-700"
          title="添加节点"
        >
          <Plus size={14} />
        </button>
        <button className="p-1.5 rounded hover:bg-neutral-800" title="移动">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" />
          </svg>
        </button>
        <button className="p-1.5 rounded hover:bg-neutral-800" title="工作流">
          <Layers size={14} />
        </button>
        <button className="p-1.5 rounded hover:bg-neutral-800" title="计时器">
          <Timer size={14} />
        </button>
        <button
          onClick={() => setShowShortcuts(!showShortcuts)}
          className={`p-1.5 rounded ${showShortcuts ? 'bg-neutral-700' : 'hover:bg-neutral-800'}`}
          title="快捷键"
        >
          <Keyboard size={14} />
        </button>
        <button className="p-1.5 rounded hover:bg-neutral-800" title="帮助">
          <HelpCircle size={14} />
        </button>
        <div className="flex-1" />
        <button
          onClick={organizeCanvas}
          className="p-1.5 rounded hover:bg-neutral-800"
          title="整理画布"
        >
          <AlignJustify size={14} />
        </button>
        <button
          onClick={() => setShowMinimap(!showMinimap)}
          className={`p-1.5 rounded ${showMinimap ? 'bg-neutral-700' : 'hover:bg-neutral-800'}`}
          title="小地图"
        >
          <Map size={14} />
        </button>
        <button
          onClick={() => setHideEdges(!hideEdges)}
          className={`p-1.5 rounded ${hideEdges ? 'bg-neutral-700' : 'hover:bg-neutral-800'}`}
          title="隐藏节点连线"
        >
          <EyeOff size={14} />
        </button>
        <button
          onClick={() => setGridSnap(!gridSnap)}
          className={`p-1.5 rounded ${gridSnap ? 'bg-neutral-700' : 'hover:bg-neutral-800'}`}
          title="网格吸附"
        >
          <Grid3x3 size={14} />
        </button>
        <button
          onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
          className="p-1.5 rounded hover:bg-neutral-800"
          title="放大"
        >
          <ZoomIn size={14} />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}
          className="p-1.5 rounded hover:bg-neutral-800"
          title="缩小"
        >
          <ZoomOut size={14} />
        </button>
      </div>
      
      {/* 快捷键面板 */}
      {showShortcuts && (
        <ShortcutsPanel onClose={() => setShowShortcuts(false)} />
      )}
      
      {/* 右键菜单 */}
      {ctxMenu && (() => {
        const node = graph.nodes.find(n => n.id === ctxMenu.nodeId);
        if (!node) return null;
        return (
          <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
            onClose={() => setCtxMenu(null)}
            onDelete={() => requestDelete(ctxMenu.nodeId)}
            onDuplicate={() => duplicateNode(ctxMenu.nodeId)}
            onLock={() => toggleLock(ctxMenu.nodeId)}
            onHide={() => toggleVisibility(ctxMenu.nodeId)}
            onCollapse={() => toggleCollapse(ctxMenu.nodeId)}
            isLocked={node.locked}
            isHidden={!node.visible}
            isCollapsed={node.collapsed || false}
          />
        );
      })()}
      
      {/* 通知 */}
      {notice && (
        <div className="fixed top-16 right-4 bg-neutral-800 border border-neutral-700 text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm flex items-center gap-2">
          <Info size={16} className="text-purple-400" />
          {notice}
        </div>
      )}
      
      {/* 删除确认 */}
      {deleteConfirm && (
        <div
          className="fixed bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl p-4 z-50 min-w-[200px]"
          style={{ left: deleteConfirm.x, top: deleteConfirm.y, transform: 'translate(0, -100%)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle size={18} className="text-red-400" />
            <p className="text-sm font-medium">确定删除此节点？</p>
          </div>
          <p className="text-xs text-neutral-400 mb-3">此操作无法撤销</p>
          <div className="flex gap-2">
            <button onClick={confirmDelete} className="flex-1 px-3 py-1.5 bg-red-600 rounded text-sm hover:bg-red-700">
              删除
            </button>
            <button onClick={cancelDelete} className="flex-1 px-3 py-1.5 bg-neutral-700 rounded text-sm hover:bg-neutral-600">
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

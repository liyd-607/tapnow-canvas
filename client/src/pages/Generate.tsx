import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Image as ImageIcon,
  Wand2,
  Clock,
  XCircle,
  Loader2,
  Download,
  Copy,
  Plus,
  RefreshCw,
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  Sparkles,
  ImageOff,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { generationApi } from '../api/generation';
import { assetsApi } from '../api/assets';
import type { AIModel, GenerationTask } from '../types';
import { useWebSocket } from '../hooks/useWebSocket';
import { extractError } from '../api/client';

// 扁平化后的单张图片/视频项
interface FlatImageItem {
  url: string;
  index: number;
  taskId: string;
  prompt: string;
  size?: string;
  model: string;
  type: string; // IMAGE / VIDEO / AUDIO
  createdAt: string;
  creditCost: number;
}

// 判断是否为视频
function isVideoUrl(url: string) {
  return /\\.(mp4|webm|mov|avi|mkv)(\\?|$)/i.test(url);
}

// 尺寸预设：按比例分组，每个比例下有多个分辨率可选
const SIZE_PRESETS = [
  {
    id: '1:1',
    label: '1:1',
    desc: '方形',
    resolutions: [
      { value: '512x512', label: '512 × 512' },
      { value: '768x768', label: '768 × 768' },
      { value: '1024x1024', label: '1024 × 1024' },
    ],
  },
  {
    id: '16:9',
    label: '16:9',
    desc: '横屏/壁纸',
    resolutions: [
      { value: '1024x576', label: '1024 × 576' },
      { value: '1280x720', label: '1280 × 720' },
      { value: '1920x1080', label: '1920 × 1080' },
    ],
  },
  {
    id: '9:16',
    label: '9:16',
    desc: '竖屏/手机',
    resolutions: [
      { value: '576x1024', label: '576 × 1024' },
      { value: '720x1280', label: '720 × 1280' },
      { value: '1080x1920', label: '1080 × 1920' },
    ],
  },
  {
    id: '4:3',
    label: '4:3',
    desc: '经典横屏',
    resolutions: [
      { value: '1024x768', label: '1024 × 768' },
      { value: '1152x864', label: '1152 × 864' },
    ],
  },
  {
    id: '3:4',
    label: '3:4',
    desc: '经典竖屏',
    resolutions: [
      { value: '768x1024', label: '768 × 1024' },
      { value: '864x1152', label: '864 × 1152' },
    ],
  },
  {
    id: '3:2',
    label: '3:2',
    desc: '摄影比例',
    resolutions: [
      { value: '1152x768', label: '1152 × 768' },
      { value: '1536x1024', label: '1536 × 1024' },
    ],
  },
  {
    id: '2:3',
    label: '2:3',
    desc: '肖像比例',
    resolutions: [
      { value: '768x1152', label: '768 × 1152' },
      { value: '1024x1536', label: '1024 × 1536' },
    ],
  },
];

const STYLES = [
  { id: 'general', label: '通用' },
  { id: 'photographic', label: '摄影' },
  { id: 'anime', label: '动漫' },
  { id: 'digital-art', label: '数字艺术' },
  { id: 'oil-painting', label: '油画' },
  { id: 'cinematic', label: '电影感' },
];

// Lightbox 大图预览组件
function Lightbox({
  images,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  images: string[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);

  const currentUrl = images[index];
  const isVideo = isVideoUrl(currentUrl);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = currentUrl;
    a.download = `generated-${index + 1}.${isVideo ? 'mp4' : 'png'}`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      {/* 关闭按钮 */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
      >
        <X size={20} />
      </button>

      {/* 图片计数器 */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
        {index + 1} / {images.length}
      </div>

      {/* 上一张 */}
      {images.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          className="absolute left-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
      )}

      {/* 图片主体 */}
      <div
        className="max-w-[90vw] max-h-[85vh] relative"
        onClick={(e) => e.stopPropagation()}
      >
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 size={32} className="animate-spin text-white/50" />
          </div>
        )}
        {isVideo ? (
          <video
            src={currentUrl}
            className={`max-w-full max-h-[85vh] object-contain transition-opacity duration-300 ${
              loaded ? 'opacity-100' : 'opacity-0'
            }`}
            onLoadedData={() => setLoaded(true)}
            controls
            autoPlay
            muted
            loop
            playsInline
          />
        ) : (
          <img
            src={currentUrl}
            alt={`preview-${index}`}
            className={`max-w-full max-h-[85vh] object-contain transition-opacity duration-300 ${
              loaded ? 'opacity-100' : 'opacity-0'
            }`}
            onLoad={() => setLoaded(true)}
          />
        )}
      </div>

      {/* 下一张 */}
      {images.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          className="absolute right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
        >
          <ChevronRight size={24} />
        </button>
      )}

      {/* 底部操作栏 */}
      <div
        className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-3 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleDownload}
          className="w-9 h-9 rounded-full hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          title="下载原图"
        >
          <Download size={18} />
        </button>
        <button
          onClick={() => {
            navigator.clipboard.writeText(currentUrl);
          }}
          className="w-9 h-9 rounded-full hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          title="复制链接"
        >
          <Copy size={18} />
        </button>
        <button
          onClick={() => {
            window.open(currentUrl, '_blank');
          }}
          className="w-9 h-9 rounded-full hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          title="在新标签页打开"
        >
          <ZoomIn size={18} />
        </button>
      </div>
    </div>
  );
}

// 瀑布流图片卡片（保留真实比例 + hover 蒙层元信息）
function StreamImageCard({
  item,
  onClick,
  onDownload,
  onAddToAssets,
  onRegenerate,
}: {
  item: FlatImageItem;
  onClick: () => void;
  onDownload: (url: string, e: React.MouseEvent) => void;
  onAddToAssets: (url: string, prompt: string, e: React.MouseEvent) => void;
  onRegenerate: (taskId: string, e: React.MouseEvent) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  // 从尺寸字符串计算 aspect-ratio，用于瀑布流占位
  const getAspectRatio = () => {
    if (!item.size) return undefined;
    const [w, h] = item.size.split('x').map(Number);
    if (w && h) return `${w} / ${h}`;
    return undefined;
  };

  const aspectRatio = getAspectRatio();

  if (error) {
    return (
      <div
        className="w-full rounded-lg bg-tn-panel2 flex flex-col items-center justify-center py-12 text-tn-muted cursor-pointer mb-3 break-inside-avoid"
        onClick={onClick}
      >
        <ImageOff size={20} className="mb-1 opacity-50" />
        <span className="text-xs">加载失败</span>
      </div>
    );
  }

  return (
    <div
      className="relative group rounded-lg overflow-hidden bg-tn-cream cursor-zoom-in mb-3 break-inside-avoid"
      style={{ aspectRatio }}
      onClick={onClick}
    >
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-tn-panel2">
          <Loader2 size={18} className="animate-spin text-tn-muted" />
        </div>
      )}
      {isVideoUrl(item.url) ? (
        <video
          src={item.url}
          className={`w-full h-auto block transition-all duration-300 group-hover:scale-[1.02] ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoadedData={() => setLoaded(true)}
          onError={() => setError(true)}
          muted
          loop
          playsInline
        />
      ) : (
        <img
          src={item.url}
          alt={item.prompt.slice(0, 30)}
          className={`w-full h-auto block transition-all duration-300 group-hover:scale-[1.02] ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      )}

      {/* hover 蒙层 */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        {/* 顶部尺寸标签 */}
        {item.size && loaded && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] backdrop-blur-sm">
            {item.size}
          </div>
        )}

        {/* 底部提示词 + 操作 */}
        <div className="absolute bottom-0 left-0 right-0 p-2.5">
          <p className="text-white text-xs line-clamp-2 mb-2 leading-relaxed">{item.prompt}</p>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => onDownload(item.url, e)}
              className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white backdrop-blur-sm transition-colors"
              title="下载"
            >
              <Download size={14} />
            </button>
            <button
              onClick={(e) => onAddToAssets(item.url, item.prompt, e)}
              className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white backdrop-blur-sm transition-colors"
              title="添加到资产库"
            >
              <Plus size={14} />
            </button>
            <button
              onClick={(e) => onRegenerate(item.taskId, e)}
              className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white backdrop-blur-sm transition-colors"
              title="重新生成"
            >
              <RefreshCw size={14} />
            </button>
            <div className="flex-1" />
            <span className="text-[10px] text-white/60">
              {new Date(item.createdAt).toLocaleDateString('zh-CN')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// 瀑布流骨架屏
function StreamSkeleton() {
  return (
    <div className="mb-3 break-inside-avoid">
      <div className="w-full rounded-lg bg-tn-panel2 animate-pulse aspect-square" />
    </div>
  );
}

// 非完成态任务紧凑卡片
function PendingTaskCard({ task }: { task: GenerationTask }) {
  const params = (task.params as Record<string, any>) || {};

  return (
    <div className="card p-3 mb-3 break-inside-avoid">
      <div className="flex items-center justify-between mb-2">
        {task.status === 'processing' ? (
          <span className="flex items-center gap-1 text-xs text-tn-warning">
            <Loader2 size={12} className="animate-spin" /> 生成中
          </span>
        ) : task.status === 'failed' ? (
          <span className="flex items-center gap-1 text-xs text-tn-error">
            <XCircle size={12} /> 失败
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-tn-muted">
            <Clock size={12} /> 排队中
          </span>
        )}
        <span className="text-[10px] text-tn-muted">
          {new Date(task.createdAt).toLocaleDateString('zh-CN')}
        </span>
      </div>

      <p className="text-xs text-tn-text line-clamp-2 mb-2">{task.prompt}</p>

      {task.status === 'processing' && (
        <div>
          <div className="w-full bg-tn-panel2 rounded-full h-1">
            <div
              className="bg-tn-primary h-1 rounded-full transition-all"
              style={{ width: `${task.progress || 0}%` }}
            />
          </div>
          <div className="text-[10px] text-tn-muted mt-1">{task.progress || 0}%</div>
        </div>
      )}

      {task.status === 'failed' && (
        <p className="text-[11px] text-tn-error line-clamp-1">
          {task.errorMsg || '生成失败'}
        </p>
      )}

      {params.size && (
        <div className="text-[10px] text-tn-muted mt-1.5">{params.size}</div>
      )}
    </div>
  );
}

export function Generate() {
  const { accessToken, setTapies, user } = useAuthStore();
  const [models, setModels] = useState<AIModel[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('1024x1024');
  const [selectedRatio, setSelectedRatio] = useState('1:1');
  const [style, setStyle] = useState('general');
  const [count, setCount] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<GenerationTask[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // 瀑布流分页
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Lightbox 状态（适配扁平化图片流）
  const [flatImages, setFlatImages] = useState<FlatImageItem[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [showLightbox, setShowLightbox] = useState(false);

  // Toast 提示
  const [toast, setToast] = useState('');
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }, []);

  const loadModels = async () => {
    try {
      const list = await generationApi.listModels();
      setModels(list);
      if (list.length > 0 && !selectedModel) {
        setSelectedModel(list[0].id);
      }
    } catch (e) {
      setError(extractError(e));
    }
  };

  // 将任务列表扁平化为单张图片/视频数组（仅已完成任务）
  const flattenImages = useCallback((tasks: GenerationTask[]): FlatImageItem[] => {
    const items: FlatImageItem[] = [];
    tasks.forEach((task) => {
      if (task.status === 'completed' && task.resultUrls?.length) {
        const params = (task.params as Record<string, any>) || {};
        task.resultUrls.forEach((url, index) => {
          items.push({
            url,
            index,
            taskId: task.id,
            prompt: task.prompt,
            size: params.size,
            model: task.model,
            type: task.type,
            createdAt: task.createdAt,
            creditCost: task.creditCost,
          });
        });
      }
    });
    return items;
  }, []);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await generationApi.list(1, 20);
      setHistory(res.list);
      setFlatImages(flattenImages(res.list));
      setPage(1);
      setHasMore(res.list.length >= 20);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await generationApi.list(nextPage, 20);
      setHistory((prev) => [...prev, ...res.list]);
      setFlatImages((prev) => [...prev, ...flattenImages(res.list)]);
      setPage(nextPage);
      setHasMore(res.list.length >= 20);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  };

  // 无限滚动监听
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loadingHistory) {
          loadMore();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadingHistory]);

  useEffect(() => {
    loadModels();
    loadHistory();
  }, []);

  const { subscribeTask } = useWebSocket(accessToken, {
    onProgress: (taskId, progress) => {
      setHistory((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: 'processing', progress } : t))
      );
    },
    onCompleted: (taskId, urls) => {
      setHistory((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: 'completed', progress: 100, resultUrls: urls } : t
        )
      );
      setGenerating(false);
      loadHistory();
    },
    onFailed: (taskId, err) => {
      setHistory((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: 'failed', errorMsg: err } : t))
      );
      setGenerating(false);
    },
  });

  const handleGenerate = async () => {
    if (!prompt.trim() || !selectedModel) return;
    setError('');
    setGenerating(true);
    try {
      const task = await generationApi.create({ model: selectedModel, prompt, size, style, count });
      subscribeTask(task.id);
      setHistory((prev) => [task, ...prev]);
      if (user) {
        setTapies(user.tapies - task.creditCost);
      }
    } catch (e) {
      setError(extractError(e));
      setGenerating(false);
    }
  };

  // 用同样参数重新生成
  const handleRegenerate = (task: GenerationTask) => {
    const params = task.params as Record<string, any> | undefined;
    const model = task.model;
    const p = task.prompt;
    const s = params?.size || '1024x1024';
    const st = params?.style || 'general';
    const c = params?.count || 1;

    setPrompt(p);
    setSize(s);
    setStyle(st);
    setCount(c);
    setSelectedModel(model);

    // 滚动到顶部，提示用户确认
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('参数已填充，点击开始生成即可重新创作');
  };

  // 添加到资产库
  const handleAddToAssets = async (url: string, promptText: string) => {
    try {
      await assetsApi.create({
        name: promptText.slice(0, 20) || '生成图片',
        type: 'REFERENCE',
        url,
        description: promptText,
      });
      showToast('已添加到资产库');
    } catch (e) {
      showToast('添加失败：' + extractError(e));
    }
  };

  // 打开 Lightbox（瀑布流模式）
  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setShowLightbox(true);
  };

  const closeLightbox = () => setShowLightbox(false);
  const prevImage = () =>
    setLightboxIndex((i) => (i - 1 + flatImages.length) % flatImages.length);
  const nextImage = () => setLightboxIndex((i) => (i + 1) % flatImages.length);

  // 单张下载
  const handleDownloadOne = (url: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const a = document.createElement('a');
    a.href = url;
    a.download = `generated-${Date.now()}.png`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // 单张添加资产库
  const handleAddOneToAssets = (url: string, promptText: string, e: React.MouseEvent) => {
    e.stopPropagation();
    handleAddToAssets(url, promptText);
  };

  // 单张重新生成（找到对应任务填充参数）
  const handleRegenerateOne = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const task = history.find((t) => t.id === taskId);
    if (task) handleRegenerate(task);
  };

  // 非完成态任务列表（显示在瀑布流顶部）
  const pendingTasks = history.filter(
    (t) => t.status !== 'completed' || !t.resultUrls?.length
  );

  const selectedModelInfo = models.find((m) => m.id === selectedModel);
  const estimatedCost = selectedModelInfo ? selectedModelInfo.creditCostPerImage * count : 0;

  return (
    <div className="h-full flex flex-col lg:flex-row">
      {/* Toast 提示 */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-tn-text text-white text-sm rounded-lg shadow-lg animate-fade-in">
          {toast}
        </div>
      )}

      {/* Lightbox */}
      {showLightbox && flatImages.length > 0 && (
        <Lightbox
          images={flatImages.map((f) => f.url)}
          index={lightboxIndex}
          onClose={closeLightbox}
          onPrev={prevImage}
          onNext={nextImage}
        />
      )}

      {/* Left panel - controls */}
      <div className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-tn-border bg-tn-panel/30 flex flex-col overflow-hidden flex-shrink-0 max-h-[40vh] lg:max-h-none">
        <div className="p-3 lg:p-4 border-b border-tn-border">
          <h2 className="font-semibold flex items-center gap-2 text-sm lg:text-base">
            <Wand2 size={18} className="text-tn-primary" />
            图像生成
          </h2>
        </div>

        <div className="flex-1 overflow-auto p-3 lg:p-4 space-y-4 lg:space-y-5">
          {/* Model */}
          <div>
            <label className="block text-sm text-tn-muted mb-2">AI 模型</label>
            <div className="space-y-2">
              {models.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedModel(m.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedModel === m.id
                      ? 'border-tn-primary bg-tn-primary/10'
                      : 'border-tn-border bg-tn-panel2 hover:border-tn-muted'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{m.name}</span>
                    <span className="text-xs text-tn-warning">{m.creditCostPerImage} 积分/张</span>
                  </div>
                </button>
              ))}
              {models.length === 0 && (
                <div className="text-sm text-tn-muted p-3 text-center border border-dashed border-tn-border rounded-lg">
                  加载模型中...
                </div>
              )}
            </div>
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-sm text-tn-muted mb-2">提示词</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="描述你想生成的图像..."
              className="input min-h-[100px] resize-none"
            />
          </div>

          {/* Size */}
          <div>
            <label className="block text-sm text-tn-muted mb-2">尺寸比例</label>
            <div className="grid grid-cols-4 gap-2 mb-2">
              {SIZE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => {
                    setSelectedRatio(preset.id);
                    // 切换比例时，默认选中该比例下的中间分辨率
                    const defaults = preset.resolutions;
                    const mid = defaults[Math.floor(defaults.length / 2)];
                    setSize(mid.value);
                  }}
                  className={`flex flex-col items-center justify-center py-2.5 rounded-lg border transition-all ${
                    selectedRatio === preset.id
                      ? 'border-tn-primary bg-tn-primary/10 text-tn-primary'
                      : 'border-tn-border text-tn-muted hover:border-tn-muted'
                  }`}
                  title={preset.desc}
                >
                  <span className="text-sm font-medium">{preset.label}</span>
                  <span className="text-[10px] mt-0.5 opacity-70">{preset.desc}</span>
                </button>
              ))}
            </div>
            {/* 分辨率选择 */}
            <div className="flex gap-2">
              {SIZE_PRESETS.find((p) => p.id === selectedRatio)?.resolutions.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setSize(r.value)}
                  className={`flex-1 text-xs py-1.5 rounded-md border transition-all ${
                    size === r.value
                      ? 'border-tn-primary bg-tn-primary/10 text-tn-primary'
                      : 'border-tn-border text-tn-muted hover:border-tn-muted'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Style */}
          <div>
            <label className="block text-sm text-tn-muted mb-2">风格</label>
            <div className="grid grid-cols-3 gap-2">
              {STYLES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStyle(s.id)}
                  className={`text-xs py-2 rounded-md border transition-all ${
                    style === s.id
                      ? 'border-tn-primary bg-tn-primary/10 text-tn-primary'
                      : 'border-tn-border text-tn-muted hover:border-tn-muted'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Count */}
          <div>
            <label className="block text-sm text-tn-muted mb-2">生成数量</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  className={`flex-1 py-2 rounded-md border text-sm transition-all ${
                    count === n
                      ? 'border-tn-primary bg-tn-primary/10 text-tn-primary'
                      : 'border-tn-border text-tn-muted hover:border-tn-muted'
                  }`}
                >
                  {n} 张
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-3 lg:p-4 border-t border-tn-border space-y-2 lg:space-y-3">
          {error && (
            <div className="text-xs lg:text-sm text-tn-error bg-tn-error/10 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between text-xs lg:text-sm">
            <span className="text-tn-muted">预计消耗</span>
            <span className="text-tn-warning font-semibold">{estimatedCost} 积分</span>
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating || !prompt.trim() || !selectedModel}
            className="btn-primary w-full py-2.5 lg:py-3 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {generating ? (
              <Loader2 size={18} className="animate-spin inline mr-2" />
            ) : (
              <Wand2 size={18} className="inline mr-2" />
            )}
            {generating ? '生成中...' : '开始生成'}
          </button>
        </div>
      </div>

      {/* Right panel - history */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="p-3 lg:p-4 border-b border-tn-border flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <Clock size={18} className="text-tn-muted" />
            生成历史
          </h2>
          <button
            onClick={loadHistory}
            className="text-xs text-tn-muted hover:text-tn-text flex items-center gap-1"
          >
            <RefreshCw size={12} className={loadingHistory ? 'animate-spin' : ''} />
            刷新
          </button>
        </div>

        <div className="flex-1 overflow-auto p-3 lg:p-4">
          {loadingHistory && flatImages.length === 0 ? (
            <div className="columns-3 lg:columns-2 xl:columns-3 gap-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <StreamSkeleton key={i} />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-tn-muted">
              <ImageIcon size={48} className="mb-3 opacity-30" />
              <p>暂无生成记录</p>
              <p className="text-sm mt-1">在左侧输入提示词开始创作</p>
            </div>
          ) : (
            <>
              {/* 非完成态任务（紧凑卡片） */}
              {pendingTasks.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-xs text-tn-muted mb-2 flex items-center gap-1.5">
                    <Sparkles size={12} /> 进行中的任务
                  </h3>
                  <div className="columns-3 lg:columns-2 xl:columns-3 gap-3">
                    {pendingTasks.map((task) => (
                      <PendingTaskCard key={task.id} task={task} />
                    ))}
                  </div>
                </div>
              )}

              {/* 瀑布流图片流 */}
              {flatImages.length > 0 && (
                <div className="columns-3 lg:columns-2 xl:columns-3 gap-3">
                  {flatImages.map((item, i) => (
                    <StreamImageCard
                      key={`${item.taskId}-${item.index}`}
                      item={item}
                      onClick={() => openLightbox(i)}
                      onDownload={handleDownloadOne}
                      onAddToAssets={handleAddOneToAssets}
                      onRegenerate={handleRegenerateOne}
                    />
                  ))}
                </div>
              )}

              {/* 加载更多哨兵 */}
              {flatImages.length > 0 && hasMore && (
                <div ref={sentinelRef} className="flex items-center justify-center py-6">
                  {loadingMore && (
                    <div className="flex items-center gap-2 text-xs text-tn-muted">
                      <Loader2 size={14} className="animate-spin" />
                      加载更多...
                    </div>
                  )}
                </div>
              )}

              {flatImages.length > 0 && !hasMore && (
                <div className="text-center text-xs text-tn-muted py-6">
                  — 已加载全部图片
                </div>
              )}

              {/* 全是非完成态也没有完成图片时的兜底展示  */}
              {flatImages.length === 0 && pendingTasks.length > 0 && (
                <div className="text-center text-xs text-tn-muted py-6">
                  暂无已完成的生成图片
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

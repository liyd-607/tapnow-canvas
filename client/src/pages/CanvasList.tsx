import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Palette, Film, Trash2, Clock, Loader2 } from 'lucide-react';
import { canvasApi } from '../api/canvas';
import type { Canvas } from '../types';
import { extractError } from '../api/client';

export function CanvasList() {
  const [searchParams] = useSearchParams();
  const isLibTV = searchParams.get('mode') === 'libtv';
  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const navigate = useNavigate();

  const loadCanvases = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await canvasApi.list(1, 50);
      setCanvases(res.list);
    } catch (e) {
      setError(extractError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCanvases();
  }, []);

  const handleCreate = async () => {
    // 校验名称
    if (!name.trim()) {
      setNameError('请输入画布名称');
      return;
    }
    setNameError('');
    try {
      const canvas = await canvasApi.create({
        name: name.trim(),
        width,
        height,
      });
      navigate(isLibTV ? `/libtv-canvas/${canvas.id}` : `/canvas/${canvas.id}`);
    } catch (e) {
      setError(extractError(e));
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定删除此画布？')) return;
    try {
      await canvasApi.remove(id);
      setCanvases((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setError(extractError(e));
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{isLibTV ? 'LibTV 画布' : '我的画布'}</h1>
          <p className="text-tn-muted text-sm mt-1">
            {isLibTV ? 'AI 视频创作工作流画布' : '管理你的所有创意画布'}
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={18} className="inline mr-2" />
          新建画布
        </button>
      </div>

      {error && (
        <div className="mb-4 text-sm text-tn-error bg-tn-error/10 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-tn-muted">
          <Loader2 size={24} className="animate-spin mr-2" />
          加载中...
        </div>
      ) : canvases.length === 0 ? (
        <div className="card p-12 text-center">
          {isLibTV ? (
            <Film size={48} className="mx-auto mb-4 text-tn-muted opacity-30" />
          ) : (
            <Palette size={48} className="mx-auto mb-4 text-tn-muted opacity-30" />
          )}
          <p className="text-tn-muted mb-4">
            {isLibTV ? '还没有 LibTV 画布，开始你的 AI 视频创作之旅吧' : '还没有画布，开始你的第一次创作吧'}
          </p>
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus size={18} className="inline mr-2" />
            {isLibTV ? '创建第一个 LibTV 画布' : '创建第一个画布'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {canvases.map((canvas) => (
            <div
              key={canvas.id}
              onClick={() => navigate(isLibTV ? `/libtv-canvas/${canvas.id}` : `/canvas/${canvas.id}`)}
              className="card overflow-hidden cursor-pointer group hover:border-tn-primary/50 transition-all"
            >
              <div className="aspect-video bg-tn-cream relative overflow-hidden">
                {canvas.thumbnail ? (
                  <img
                    src={canvas.thumbnail}
                    alt={canvas.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    {isLibTV ? (
                      <Film size={32} className="text-tn-muted opacity-30" />
                    ) : (
                      <Palette size={32} className="text-tn-muted opacity-30" />
                    )}
                  </div>
                )}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => handleDelete(canvas.id, e)}
                    className="p-1.5 rounded-md bg-tn-error/20 text-tn-error hover:bg-tn-error/30"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="p-3">
                <h3 className="font-medium truncate">{canvas.name}</h3>
                <div className="flex items-center justify-between mt-1 text-xs text-tn-muted">
                  <span>{canvas.width} × {canvas.height}</span>
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    {new Date(canvas.updatedAt).toLocaleDateString('zh-CN')}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              {isLibTV ? '新建 LibTV 画布' : '新建画布'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-tn-muted mb-1.5">画布名称</label>
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (nameError) setNameError('');
                  }}
                  placeholder="输入画布名称"
                  className={`input ${nameError ? 'border-tn-error focus:border-tn-error' : ''}`}
                  autoFocus
                />
                {nameError && <p className="text-xs text-tn-error mt-1">{nameError}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-tn-muted mb-1.5">宽度 (px)</label>
                  <input
                    type="number"
                    value={width}
                    onChange={(e) => setWidth(Number(e.target.value))}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm text-tn-muted mb-1.5">高度 (px)</label>
                  <input
                    type="number"
                    value={height}
                    onChange={(e) => setHeight(Number(e.target.value))}
                    className="input"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1">
                取消
              </button>
              <button onClick={handleCreate} className="btn-primary flex-1">
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

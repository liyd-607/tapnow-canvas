import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutTemplate, Search, Loader2, Play } from 'lucide-react';
import { templatesApi, type Template } from '../api/templates';
import { extractError } from '../api/client';

const CATEGORIES = ['all', 'character', 'product', 'video', 'poster', 'custom'];

export function Templates() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [usingId, setUsingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await templatesApi.list(category === 'all' ? undefined : category, keyword));
    } catch (e) {
      setError(extractError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const useTemplate = async (id: string) => {
    setUsingId(id);
    try {
      const canvas = await templatesApi.instantiate(id);
      navigate(`/canvas/${canvas.id}`);
    } catch (e) {
      setError(extractError(e));
      setUsingId(null);
    }
  };

  const catLabel = (c: string) =>
    ({ all: '全部', character: '角色', product: '产品', video: '视频', poster: '海报', custom: '自定义' }[c] || c);

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 border-b border-tn-border">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <LayoutTemplate size={24} className="text-tn-primary" /> 模板库
        </h1>
        <p className="text-sm text-tn-muted mt-1">选择模板一键生成预布线画布，在其基础上继续创作</p>

        <div className="flex items-center gap-3 mt-4">
          <div className="flex gap-1">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-3 py-1 text-xs rounded-full transition-all ${
                  category === c
                    ? 'bg-tn-primary/20 text-tn-primary border border-tn-primary/30'
                    : 'bg-tn-panel2 text-tn-muted border border-transparent hover:border-tn-border'
                }`}
              >
                {catLabel(c)}
              </button>
            ))}
          </div>
          <div className="relative w-64 ml-auto">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-tn-muted" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              placeholder="搜索模板…"
              className="input pl-9 py-1.5 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div className="mb-4 text-sm text-tn-error bg-tn-error/10 px-4 py-3 rounded-lg">{error}</div>
        )}

        {loading ? (
          <div className="flex justify-center text-tn-muted py-12">
            <Loader2 size={26} className="animate-spin mr-2" /> 加载…
          </div>
        ) : items.length === 0 ? (
          <div className="text-center text-tn-muted py-12">
            暂无模板，可在画布中点击「另存为模板」来创建
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {items.map((t) => (
              <div key={t.id} className="card overflow-hidden group">
                <div className="aspect-video bg-tn-cream relative">
                  {t.thumbnail ? (
                    <img src={t.thumbnail} alt={t.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-tn-muted">
                      <LayoutTemplate size={36} className="opacity-30" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <button
                      onClick={() => useTemplate(t.id)}
                      disabled={usingId === t.id}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-tn-primary text-white text-sm"
                    >
                      {usingId === t.id ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                      使用此模板
                    </button>
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold truncate">{t.name}</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-tn-muted shrink-0 ml-2">
                      {catLabel(t.category)}
                    </span>
                  </div>
                  <p className="text-xs text-tn-muted line-clamp-2 mb-2">
                    {t.description || `${t.graph.nodes.length} 节点 / ${t.graph.edges.length} 连线`}
                  </p>
                  <span className="text-[11px] text-tn-muted">{t.usageCount} 次使用</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

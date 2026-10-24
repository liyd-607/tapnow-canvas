import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Search, Tag, Star, Loader2, Zap, Play } from 'lucide-react';
import { skillsApi } from '../api/skills';
import { canvasApi } from '../api/canvas';
import type { Skill, Canvas } from '../types';
import { extractError } from '../api/client';

export function Skills() {
  const navigate = useNavigate();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [type, setType] = useState<string>('all');
  const [keyword, setKeyword] = useState('');
  const [runningId, setRunningId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      let [res, cRes] = await Promise.all([
        skillsApi.list(category === 'all' ? undefined : category, type === 'all' ? undefined : type, 1, 50),
        canvasApi.list(1, 50).catch(() => ({ list: [] })),
      ]);
      if (res.list.length === 0) {
        await skillsApi.seed().catch(() => {});
        res = await skillsApi.list(
          category === 'all' ? undefined : category,
          type === 'all' ? undefined : type,
          1,
          50,
        );
      }
      setSkills(res.list);
      setCanvases((cRes as any).list);
    } catch (e) {
      setError(extractError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, type]);

  /** 执行技能：无画布则新建，有画布则选第一个；执行后跳转并选中新节点 */
  const executeSkill = async (skill: Skill) => {
    setRunningId(skill.id);
    setError('');
    try {
      let targetCanvas: Canvas;
      if (canvases.length === 0) {
        targetCanvas = await canvasApi.create({ name: `技能·${skill.name}` });
      } else {
        targetCanvas = canvases[0];
      }
      const result = await skillsApi.execute(skill.id, targetCanvas.id);
      navigate(`/canvas/${targetCanvas.id}`);
      // 节点 id 已返回，编辑器加载后即为最新图；可在此扩展选中
      console.log('inserted node', result.nodeId);
    } catch (e) {
      setError(extractError(e));
    } finally {
      setRunningId(null);
    }
  };

  const filtered = keyword.trim()
    ? skills.filter((s) => s.name.includes(keyword.trim()) || (s.description || '').includes(keyword.trim()))
    : skills;

  const typeBadge = (t: string) => {
    const map: Record<string, { label: string; color: string }> = {
      image: { label: '图像', color: 'bg-tn-primary/20 text-tn-primary border-tn-primary/30' },
      video: { label: '视频', color: 'bg-tn-accent/20 text-tn-accent border-tn-accent/30' },
      workflow: { label: '工作流', color: 'bg-tn-success/20 text-tn-success border-tn-success/30' },
    };
    const m = map[t] || { label: t, color: 'bg-tn-panel2 text-tn-muted border-tn-border' };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full border ${m.color}`}>{m.label}</span>
    );
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 border-b border-tn-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles size={24} className="text-tn-primary" />
              技能市场
            </h1>
            <p className="text-sm text-tn-muted mt-1">点击技能即在画布中插入预配置节点，立即开始创作</p>
          </div>
          <div className="relative w-72">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-tn-muted" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              type="text"
              placeholder="搜索技能..."
              className="input pl-10"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Tag size={14} className="text-tn-muted" />
            <span className="text-sm text-tn-muted">分类：</span>
            <div className="flex gap-1">
              {['all', 'official', 'community'].map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`px-3 py-1 text-xs rounded-full transition-all ${
                    category === c
                      ? 'bg-tn-primary/20 text-tn-primary border border-tn-primary/30'
                      : 'bg-tn-panel2 text-tn-muted border border-transparent hover:border-tn-border'
                  }`}
                >
                  {c === 'all' ? '全部' : c === 'official' ? '官方' : '社区'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-tn-muted">类型：</span>
            <div className="flex gap-1">
              {['all', 'image', 'video', 'workflow'].map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`px-3 py-1 text-xs rounded-full transition-all ${
                    type === t
                      ? 'bg-tn-primary/20 text-tn-primary border border-tn-primary/30'
                      : 'bg-tn-panel2 text-tn-muted border border-transparent hover:border-tn-border'
                  }`}
                >
                  {t === 'all' ? '全部' : t === 'image' ? '图像' : t === 'video' ? '视频' : '工作流'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div className="mb-4 text-sm text-tn-error bg-tn-error/10 px-4 py-3 rounded-lg">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64 text-tn-muted">
            <Loader2 size={28} className="animate-spin mr-2" /> 加载中...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-tn-muted py-16">暂无技能</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((skill) => (
              <div
                key={skill.id}
                className="card overflow-hidden hover:border-tn-primary/50 transition-all flex flex-col"
              >
                <div className="h-28 bg-gradient-to-br from-tn-primary/30 to-tn-accent/30 flex items-center justify-center relative">
                  <Zap size={38} className="text-white/80" />
                  <div className="absolute top-2 left-2">{typeBadge(skill.type)}</div>
                </div>
                <div className="p-4 flex flex-col flex-1">
                  <h3 className="font-semibold truncate mb-1">{skill.name}</h3>
                  <p className="text-sm text-tn-muted line-clamp-2 mb-3 flex-1">
                    {skill.description || '暂无描述'}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-xs text-tn-muted">
                      <Star size={12} /> {skill.usageCount}
                    </span>
                    <button
                      onClick={() => executeSkill(skill)}
                      disabled={runningId === skill.id}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-tn-primary/90 hover:bg-tn-primary text-white text-xs disabled:opacity-50"
                    >
                      {runningId === skill.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Play size={13} />
                      )}
                      使用
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

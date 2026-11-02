import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot, Sparkles, Clock, CheckCircle, XCircle, Loader2, Lightbulb, Film,
  Wand2, ExternalLink, ChevronDown, ChevronUp, Play, Image as ImageIcon,
} from 'lucide-react';
import { agentApi } from '../api/agent';
import type { AgentTask } from '../types';
import { extractError } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useWebSocket } from '../hooks/useWebSocket';

const visionTemplates = [
  { icon: '🎬', title: '产品广告片', desc: '为电商产品制作一支30秒炫酷广告' },
  { icon: '🎨', title: '艺术概念图', desc: '生成一组赛博朋克风格的角色概念图' },
  { icon: '🎭', title: '短片故事', desc: '讲述一个关于时间旅行的温情故事' },
  { icon: '🏔️', title: '风景大片', desc: '制作冰岛极光下的雪山延时摄影' },
];

// 解析脚本数据，提取镜头信息
const parseScript = (script: any) => {
  if (!script) return { shots: [], title: '', summary: '' };
  let data = script;
  if (typeof script === 'string') {
    try {
      data = JSON.parse(script);
    } catch {
      return { shots: [], title: '', summary: script };
    }
  }
  const shots = data.shots || data.scenes || [];
  const title = data.title || '';
  const summary = data.summary || data.description || '';
  return { shots, title, summary };
};

// 格式化时间显示
const formatDuration = (seconds: number) => {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
};

// 获取状态中文标签
const getStatusLabel = (status: string) => {
  const map: Record<string, string> = {
    planning: '规划中',
    writing_script: '撰写脚本',
    predicting_shots: '预测镜头',
    generating: '生成中',
    completed: '已完成',
    failed: '失败',
  };
  return map[status] || status;
};

export function Agent() {
  const [vision, setVision] = useState('');
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { accessToken } = useAuthStore();

  const loadTasks = async () => {
    setLoadingTasks(true);
    try {
      const res = await agentApi.list(1, 20);
      setTasks(res.list);
    } catch (e) {
      // ignore
    } finally {
      setLoadingTasks(false);
    }
  };

  const { subscribeTask } = useWebSocket(accessToken, {
    onProgress: (taskId, progress) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: 'generating', progress } : t)),
      );
    },
    onCompleted: () => {
      loadTasks();
    },
    onFailed: () => {
      loadTasks();
    },
  });

  useEffect(() => {
    loadTasks();
  }, []);

  const handleCreate = async (customVision?: string) => {
    const v = customVision || vision;
    if (!v.trim()) return;
    setCreating(true);
    setError('');
    try {
      const task = await agentApi.create(v);
      setTasks((prev) => [task, ...prev]);
      subscribeTask(task.id);
      if (!customVision) setVision('');
    } catch (e) {
      setError(extractError(e));
    } finally {
      setCreating(false);
    }
  };

  const statusBadge = (status: string, progress: number) => {
    const map: Record<string, { label: string; color: string; icon: any }> = {
      planning: { label: '规划中', color: 'text-tn-primary bg-tn-primary/20', icon: Lightbulb },
      writing_script: { label: '撰写脚本', color: 'text-tn-accent bg-tn-accent/20', icon: Film },
      predicting_shots: { label: '预测镜头', color: 'text-tn-warning bg-tn-warning/20', icon: Wand2 },
      generating: { label: `生成中 ${progress}%`, color: 'text-tn-primary bg-tn-primary/20', icon: Loader2 },
      completed: { label: '已完成', color: 'text-tn-success bg-tn-success/20', icon: CheckCircle },
      failed: { label: '失败', color: 'text-tn-error bg-tn-error/20', icon: XCircle },
    };
    const m = map[status] || { label: status, color: 'text-tn-muted bg-tn-panel2', icon: Clock };
    const Icon = m.icon;
    return (
      <span className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${m.color}`}>
        <Icon size={12} className={status === 'generating' ? 'animate-spin' : ''} />
        {m.label}
      </span>
    );
  };

  return (
    <div className="h-full flex">
      {/* Left - input */}
      <div className="w-96 border-r border-tn-border flex flex-col">
        <div className="p-6 border-b border-tn-border">
          <h1 className="text-xl font-bold flex items-center gap-2 mb-1">
            <Bot size={22} className="text-tn-primary" />
            Agent 模式
          </h1>
          <p className="text-sm text-tn-muted">
            告诉 Agent 你的创作愿景，它会自动规划脚本、预测镜头、执行生成
          </p>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">创作愿景</label>
            <textarea
              value={vision}
              onChange={(e) => setVision(e.target.value)}
              placeholder="描述你想创作的内容...例如：为一款智能手表制作一支15秒的产品广告，风格科技感十足，背景音乐动感"
              className="input w-full h-40 resize-none"
            />
          </div>

          {error && (
            <div className="text-sm text-tn-error bg-tn-error/10 px-3 py-2 rounded-lg">{error}</div>
          )}

          <button
            onClick={() => handleCreate()}
            disabled={creating || !vision.trim()}
            className="btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? (
              <Loader2 size={18} className="animate-spin inline mr-2" />
            ) : (
              <Sparkles size={18} className="inline mr-2" />
            )}
            启动 Agent
          </button>

          <div className="pt-4 border-t border-tn-border">
            <p className="text-sm text-tn-muted mb-3">快速开始：</p>
            <div className="space-y-2">
              {visionTemplates.map((t, i) => (
                <button
                  key={i}
                  onClick={() => setVision(t.desc)}
                  className="w-full text-left p-3 rounded-lg bg-tn-panel2 border border-tn-border hover:border-tn-primary/50 transition-all group"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{t.icon}</span>
                    <span className="text-sm font-medium group-hover:text-tn-primary transition-colors">
                      {t.title}
                    </span>
                  </div>
                  <p className="text-xs text-tn-muted line-clamp-1">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right - task list */}
      <div className="flex-1 flex flex-col overflow-hidden bg-tn-bg">
        <div className="px-6 py-4 border-b border-tn-border bg-white">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Clock size={18} className="text-tn-primary" />
              Agent 任务
            </h2>
            <span className="text-xs text-tn-muted">
              共 {tasks.length} 个任务
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {loadingTasks && tasks.length === 0 ? (
            <div className="flex items-center justify-center h-full text-tn-muted">
              <Loader2 size={24} className="animate-spin mr-2" />
              加载中...
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-tn-muted">
              <Bot size={48} className="mb-3 opacity-30" />
              <p>还没有 Agent 任务</p>
              <p className="text-sm mt-1">在左侧输入愿景开始自动创作</p>
            </div>
          ) : (
            <div className="space-y-4 max-w-4xl mx-auto">
              {tasks.map((task) => {
                const { shots, title, summary } = parseScript(task.script);
                const totalDuration = shots.reduce((sum: number, s: any) => sum + (s.duration || 0), 0);
                const isExpanded = expandedId === task.id;
                const isCompleted = task.status === 'completed';
                const isFailed = task.status === 'failed';
                const isRunning = !isCompleted && !isFailed;

                return (
                  <div
                    key={task.id}
                    className="bg-white rounded-xl border border-tn-border shadow-sm hover:shadow-md transition-all overflow-hidden"
                  >
                    {/* 卡片头部 */}
                    <div
                      className="p-4 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : task.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs px-2 py-0.5 rounded bg-tn-primary/10 text-tn-primary font-medium">
                              #{task.id.slice(0, 8)}
                            </span>
                            <span className="text-xs text-tn-muted">
                              {new Date(task.createdAt).toLocaleString('zh-CN')}
                            </span>
                          </div>
                          <p className="font-semibold text-tn-text leading-snug line-clamp-2">
                            {task.vision}
                          </p>

                          {/* 元信息栏 */}
                          <div className="flex items-center gap-4 mt-2 text-xs text-tn-muted">
                            {shots.length > 0 && (
                              <span className="flex items-center gap-1">
                                <Film size={12} />
                                {shots.length} 个镜头
                              </span>
                            )}
                            {totalDuration > 0 && (
                              <span className="flex items-center gap-1">
                                <Clock size={12} />
                                时长 {formatDuration(totalDuration)}
                              </span>
                            )}
                            {isCompleted && task.resultUrls && task.resultUrls.length > 0 && (
                              <span className="flex items-center gap-1">
                                <ImageIcon size={12} />
                                {task.resultUrls.length} 张结果
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-start gap-2 shrink-0">
                          {statusBadge(task.status, task.progress)}
                          <button
                            className="p-1 rounded hover:bg-tn-panel2 text-tn-muted transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        </div>
                      </div>

                      {/* 进度条（运行中状态） */}
                      {isRunning && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-xs text-tn-muted mb-1">
                            <span>{getStatusLabel(task.status)}</span>
                            <span>{task.progress}%</span>
                          </div>
                          <div className="w-full bg-tn-cream rounded-full h-2 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-tn-primary to-tn-accent"
                              style={{ width: `${task.progress}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 展开内容 */}
                    <div
                      className={`overflow-hidden transition-all duration-300 ${
                        isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
                      }`}
                    >
                      <div className="px-4 pb-4 border-t border-tn-border/60 pt-4 space-y-4">
                        {/* 脚本概览 */}
                        {task.script && (
                          <div>
                            <h4 className="text-xs font-semibold text-tn-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                              <Film size={12} /> 脚本概览
                            </h4>
                            {title && (
                              <p className="text-sm font-medium text-tn-text mb-1">{title}</p>
                            )}
                            {summary && (
                              <p className="text-sm text-tn-muted leading-relaxed mb-3">{summary}</p>
                            )}
                          </div>
                        )}

                        {/* 镜头列表 */}
                        {shots.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-tn-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                              <Wand2 size={12} /> 分镜脚本
                            </h4>
                            <div className="space-y-2">
                              {shots.map((shot: any, idx: number) => (
                                <div
                                  key={idx}
                                  className="flex gap-3 p-3 bg-tn-cream/50 rounded-lg hover:bg-tn-cream transition-colors"
                                >
                                  <div className="shrink-0 w-8 h-8 rounded-md bg-tn-primary/15 text-tn-primary flex items-center justify-center text-xs font-bold">
                                    {shot.id || idx + 1}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-sm font-medium text-tn-text">
                                        {shot.title || shot.scene || `镜头 ${idx + 1}`}
                                      </span>
                                      {shot.duration && (
                                        <span className="text-xs px-1.5 py-0.5 rounded bg-tn-panel2 text-tn-muted">
                                          {shot.duration}s
                                        </span>
                                      )}
                                    </div>
                                    {shot.camera && (
                                      <p className="text-xs text-tn-primary/80 mb-1">
                                        🎥 {shot.camera}
                                      </p>
                                    )}
                                    {shot.description && (
                                      <p className="text-xs text-tn-muted leading-relaxed line-clamp-2">
                                        {shot.description}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 生成结果 */}
                        {isCompleted && task.resultUrls && task.resultUrls.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-tn-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                              <ImageIcon size={12} /> 生成结果
                            </h4>
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                              {task.resultUrls.map((url, i) => (
                                <a
                                  key={i}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="aspect-square rounded-lg overflow-hidden bg-tn-cream group relative"
                                >
                                  <img
                                    src={url}
                                    alt={`result-${i}`}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                  />
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                    <ExternalLink
                                      size={18}
                                      className="text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                    />
                                  </div>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 操作按钮 */}
                        <div className="flex items-center gap-2 pt-1">
                          {isCompleted && task.metadata && (task.metadata as any).canvasId && (
                            <Link
                              to={`/canvas/${(task.metadata as any).canvasId}`}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-tn-primary text-white text-sm font-medium hover:bg-tn-primary/90 transition-colors"
                            >
                              <ExternalLink size={14} /> 在画布中继续编辑
                            </Link>
                          )}
                          {isCompleted && (
                            <button
                              onClick={() => handleCreate(task.vision)}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-tn-border text-sm hover:bg-tn-panel2 transition-colors"
                            >
                              <Play size={14} /> 基于此重新生成
                            </button>
                          )}
                          {isFailed && (
                            <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-tn-error/30 text-tn-error text-sm hover:bg-tn-error/5 transition-colors">
                              <Wand2 size={14} /> 重试
                            </button>
                          )}
                        </div>

                        {/* 失败信息 */}
                        {isFailed && task.errorMsg && (
                          <div className="p-3 bg-tn-error/10 border border-tn-error/20 rounded-lg">
                            <p className="text-sm text-tn-error font-medium mb-1">失败原因</p>
                            <p className="text-sm text-tn-error/80">{task.errorMsg}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

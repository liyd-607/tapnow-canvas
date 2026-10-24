import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Image as ImageIcon, Video, FileText, Pencil, Trash2,
  Power, Sparkles, Coins, X, Check
} from 'lucide-react';
import { modelApi } from '../api/model';
import type { AIModel } from '../api/model';
import { extractError } from '../api/client';

const typeColors = {
  image: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  video: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
  text: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
};

export function ModelSettings() {
  const navigate = useNavigate();
  const [models, setModels] = useState<AIModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingModel, setEditingModel] = useState<AIModel | null>(null);
  const [form, setForm] = useState({
    name: '',
    type: 'image' as 'image' | 'video' | 'text',
    modelKey: '',
    creditCost: 5,
    enabled: true,
    config: {} as Record<string, any>,
  });

  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    try {
      setLoading(true);
      const data = await modelApi.list();
      setModels(data);
    } catch (e) {
      setError(extractError(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSeed = async () => {
    try {
      const data = await modelApi.seed();
      setModels(data);
    } catch (e) {
      setError(extractError(e));
    }
  };

  const openModal = (model?: AIModel) => {
    if (model) {
      setEditingModel(model);
      setForm({
        name: model.name,
        type: model.type.toLowerCase() as 'image' | 'video' | 'text',
        modelKey: model.modelKey,
        creditCost: model.creditCost,
        enabled: model.enabled,
        config: (model.config as Record<string, string>) || {},
      });
    } else {
      setEditingModel(null);
      setForm({ name: '', type: 'image', modelKey: '', creditCost: 5, enabled: true, config: {} });
    }
    setShowModal(true);
  };

  const handleSubmit = async () => {
    try {
      // 准备发送到后端的数据，确保类型正确
      const submitData = {
        name: form.name,
        type: form.type.toUpperCase() as 'IMAGE' | 'VIDEO' | 'TEXT', // 转大写，匹配后端枚举
        modelKey: form.modelKey,
        creditCost: Number(form.creditCost),
        enabled: form.enabled,
        config: {
          baseUrl: form.config?.baseUrl || '',
          provider: form.config?.provider || 'other',
          authType: form.config?.authType || 'api_key',
          docs: form.config?.docs || '',
          models: form.config?.models || [],
          requiresKey: form.config?.requiresKey === true,
        }
      };

      if (editingModel) {
        await modelApi.update(editingModel.id, submitData);
      } else {
        await modelApi.create(submitData);
      }
      setShowModal(false);
      loadModels();
    } catch (e) {
      setError(extractError(e));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此模型？')) return;
    try {
      await modelApi.remove(id);
      loadModels();
    } catch (e) {
      setError(extractError(e));
    }
  };

  const handleToggleModel = async (id: string) => {
    try {
      await modelApi.toggle(id);
      loadModels();
    } catch (e) {
      setError(extractError(e));
    }
  };

  const groupedModels = {
    image: models.filter(m => m.type === 'IMAGE'),
    video: models.filter(m => m.type === 'VIDEO'),
    text: models.filter(m => m.type === 'TEXT'),
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="p-2 rounded-lg hover:bg-tn-panel2 text-tn-muted">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold">模型配置</h1>
            <p className="text-sm text-tn-muted mt-1">管理 AI 生成模型，配置各平台 API Key 和参数</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleSeed} className="btn-secondary flex items-center gap-2">
            <Sparkles size={18} />
            初始化默认模型
          </button>
          <button onClick={() => openModal()} className="btn-primary flex items-center gap-2">
            <Plus size={18} />
            添加模型
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm text-tn-error bg-tn-error/10 px-4 py-3 rounded-lg">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-tn-muted">加载中...</div>
      ) : (
        <div className="space-y-8">
          {(['image', 'video', 'text'] as const).map(type => (
            <div key={type}>
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${typeColors[type].bg}`}>
                  {type === 'image' && <ImageIcon size={20} className={typeColors[type].text} />}
                  {type === 'video' && <Video size={20} className={typeColors[type].text} />}
                  {type === 'text' && <FileText size={20} className={typeColors[type].text} />}
                </div>
                <div>
                  <h2 className="font-semibold text-white capitalize">{type} 模型</h2>
                  <p className="text-xs text-tn-muted">{groupedModels[type].length} 个模型</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {groupedModels[type].map(model => (
                  <div
                    key={model.id}
                    className={`card p-4 transition-all ${!model.enabled ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${typeColors[model.type as keyof typeof typeColors]?.bg || typeColors.image.bg}`}>
                          {type === 'image' && <ImageIcon size={18} className={typeColors[model.type as keyof typeof typeColors]?.text || typeColors.image.text} />}
                          {type === 'video' && <Video size={18} className={typeColors[model.type as keyof typeof typeColors]?.text || typeColors.video.text} />}
                          {type === 'text' && <FileText size={18} className={typeColors[model.type as keyof typeof typeColors]?.text || typeColors.text.text} />}
                        </div>
                        <div>
                          <h3 className="font-medium">{model.name}</h3>
                          <p className="text-xs text-tn-muted font-mono">{model.modelKey}</p>
                          {model.config?.provider && (
                            <p className="text-xs text-tn-muted">提供商: {
                              {
                                'alibaba': '阿里百炼/通义',
                                'bytes': '字节跳动',
                                'baidu': '百度',
                                'tencent': '腾讯',
                                'zhipu': '智谱AI',
                                'iflytek': '讯飞星火',
                                'openai': 'OpenAI',
                                'other': '其他'
                              }[model.config.provider as string] || model.config.provider
                            }</p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleToggleModel(model.id)}
                        className={`p-2 rounded-lg transition-all ${
                          model.enabled ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' : 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30'
                        }`}
                      >
                        <Power size={16} />
                      </button>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-tn-muted mb-2">
                      <div className="flex items-center gap-1">
                        <Coins size={14} className="text-tn-warning" />
                        <span>{model.creditCost} 积分/次</span>
                      </div>
                      <div className={`px-2 py-0.5 rounded text-xs ${
                        model.enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {model.enabled ? '已启用' : '已禁用'}
                      </div>
                      {model.config?.requiresKey === false ? (
                        <div className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400">
                          无需密钥
                        </div>
                      ) : model.config?.apiKey ? (
                        <div className="px-2 py-0.5 rounded text-xs bg-violet-500/20 text-violet-400">
                          已配置密钥
                        </div>
                      ) : (
                        <div className="px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-400">
                          未配置密钥
                        </div>
                      )}
                    </div>

                    {model.config?.baseUrl && (
                      <div className="text-xs text-tn-muted truncate" title={model.config.baseUrl}>
                        URL: {model.config.baseUrl}
                      </div>
                    )}

                    {model.config?.docs && (
                      <div className="text-xs">
                        <a href={model.config.docs as string} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                          官方文档 →
                        </a>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => openModal(model)}
                        className="flex-1 btn-ghost text-sm flex items-center justify-center gap-1"
                      >
                        <Pencil size={14} />
                        编辑
                      </button>
                      <button
                        onClick={() => handleDelete(model.id)}
                        className="flex-1 btn-ghost text-sm flex items-center justify-center gap-1 text-tn-error hover:bg-tn-error/10"
                      >
                        <Trash2 size={14} />
                        删除
                      </button>
                    </div>
                  </div>
                ))}

                {groupedModels[type].length === 0 && (
                  <div className="col-span-full card p-8 text-center text-tn-muted">
                    暂无 {type} 模型，点击上方按钮添加
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold">{editingModel ? '编辑模型' : '添加模型'}</h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-tn-panel2 rounded-lg text-tn-muted">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-tn-muted mb-1.5">模型名称</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="如：DALL-E 3"
                  className="input"
                />
              </div>

              <div>
                <label className="block text-sm text-tn-muted mb-1.5">模型标识</label>
                <input
                  value={form.modelKey}
                  onChange={e => setForm(f => ({ ...f, modelKey: e.target.value }))}
                  placeholder="如：dall-e-3"
                  className="input font-mono"
                  disabled={!!editingModel}
                />
                <p className="text-xs text-tn-muted mt-1">唯一标识，创建后不可修改</p>
              </div>

              <div>
                <label className="block text-sm text-tn-muted mb-1.5">类型</label>
                <div className="flex gap-2">
                  {(['image', 'video', 'text'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setForm(f => ({ ...f, type: t }))}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                        form.type === t
                          ? `${typeColors[t].bg} ${typeColors[t].text} border ${typeColors[t].border}`
                          : 'bg-tn-panel2 hover:bg-tn-border'
                      }`}
                    >
                      {t === 'image' && <ImageIcon size={16} />}
                      {t === 'video' && <Video size={16} />}
                      {t === 'text' && <FileText size={16} />}
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm text-tn-muted mb-1.5">单次消耗积分</label>
                <input
                  type="number"
                  value={form.creditCost}
                  onChange={e => setForm(f => ({ ...f, creditCost: Number(e.target.value) }))}
                  className="input"
                  min={1}
                />
              </div>

              {/* API 配置 */}
              <div>
                <label className="block text-sm text-tn-muted mb-1.5">API 配置</label>
                <div className="space-y-2">
                  <div>
                    <input
                      type="text"
                      value={form.config?.baseUrl || ''}
                      onChange={e => setForm(f => ({ ...f, config: { ...f.config, baseUrl: e.target.value } }))}
                      placeholder="API Base URL (如: https://ark.cn-beijing.volces.com/api/v3)"
                      className="input text-sm font-mono"
                    />
                    <p className="text-xs text-tn-muted mt-1">模型的 API 地址</p>
                  </div>
                  <div>
                    <input
                      type="password"
                      value={form.config?.apiKey || ''}
                      onChange={e => setForm(f => ({ ...f, config: { ...f.config, apiKey: e.target.value } }))}
                      placeholder="API Key"
                      className="input text-sm font-mono"
                    />
                  </div>
                  <div>
                    <input
                      type="password"
                      value={form.config?.apiSecret || ''}
                      onChange={e => setForm(f => ({ ...f, config: { ...f.config, apiSecret: e.target.value } }))}
                      placeholder="API Secret (可选)"
                      className="input text-sm font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
                  className={`w-12 h-6 rounded-full transition-all ${form.enabled ? 'bg-emerald-500' : 'bg-gray-600'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-all ${form.enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
                <span className="text-sm">{form.enabled ? '启用' : '禁用'}</span>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">取消</button>
              <button onClick={handleSubmit} className="btn-primary flex-1 flex items-center justify-center gap-2">
                <Check size={18} />
                {editingModel ? '保存' : '添加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

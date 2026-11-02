import { useState, useEffect, useRef } from 'react';
import {
  FolderOpen, Search, Loader2, Upload, Trash2, User, Box, Palette, Paperclip, Save, Sparkles,
} from 'lucide-react';
import { assetsApi, type Asset, type AssetType } from '../api/assets';
import { uploadApi } from '../api/upload';
import { extractError } from '../api/client';

const TYPE_META: Record<AssetType, { label: string; icon: any; color: string }> = {
  CHARACTER: { label: '角色', icon: User, color: 'text-tn-primary bg-tn-primary/15' },
  PRODUCT: { label: '产品', icon: Box, color: 'text-tn-accent bg-tn-accent/15' },
  STYLE: { label: '风格', icon: Palette, color: 'text-tn-warning bg-tn-warning/15' },
  REFERENCE: { label: '参考', icon: Paperclip, color: 'text-tn-success bg-tn-success/15' },
};

export function Assets() {
  const [items, setItems] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [type, setType] = useState('all');
  const [keyword, setKeyword] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // 新增表单
  const [uploading, setUploading] = useState(false);
  const [draftUrl, setDraftUrl] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftType, setDraftType] = useState<AssetType>('CHARACTER');
  const [draftDesc, setDraftDesc] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setItems(await assetsApi.list(type === 'all' ? undefined : type, keyword));
    } catch (e) {
      setError(extractError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const res = await uploadApi.image(file);
      setDraftUrl(res.url);
      if (!draftName) setDraftName(file.name.replace(/\.[^.]+$/, '').slice(0, 30));
    } catch (err) {
      setError(extractError(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const saveAsset = async () => {
    if (!draftUrl || !draftName.trim()) return;
    setUploading(true);
    try {
      await assetsApi.create({
        name: draftName.trim(),
        type: draftType,
        url: draftUrl,
        thumbnail: draftUrl,
        description: draftDesc,
      });
      setDraftUrl('');
      setDraftName('');
      setDraftDesc('');
      await load();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: string) => {
    await assetsApi.remove(id);
    setItems((prev) => prev.filter((a) => a.id !== id));
  };

  const [seeding, setSeeding] = useState(false);
  const seedClassics = async () => {
    setSeeding(true);
    setError('');
    try {
      await assetsApi.seedClassics();
      await load();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 border-b border-tn-border">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FolderOpen size={24} className="text-tn-primary" /> 资产库
        </h1>
        <p className="text-sm text-tn-muted mt-1">
          保存角色 / 产品 / 风格 / 参考素材，生成节点时可引用，保持一致性
        </p>

        <div className="flex items-center gap-3 mt-4">
          <div className="flex gap-1">
            {['all', 'CHARACTER', 'PRODUCT', 'STYLE', 'REFERENCE'].map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`px-3 py-1 text-xs rounded-full transition-all ${
                  type === t
                    ? 'bg-tn-primary/20 text-tn-primary border border-tn-primary/30'
                    : 'bg-tn-panel2 text-tn-muted border border-transparent hover:border-tn-border'
                }`}
              >
                {t === 'all' ? '全部' : TYPE_META[t as AssetType].label}
              </button>
            ))}
          </div>

          <button
            onClick={seedClassics}
            disabled={seeding}
            className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-full bg-tn-accent/15 text-tn-accent border border-tn-accent/30 hover:bg-tn-accent/25 transition-all disabled:opacity-50"
            title="内置 12 个经典素材：角色 / 道具 / 风格 / 场景参考，一键入库（重复点击不会重复添加）"
          >
            {seeding ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            添加经典资产
          </button>

          <div className="relative w-64 ml-auto">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-tn-muted" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              placeholder="搜索资产…"
              className="input pl-9 py-1.5 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div className="mb-4 text-sm text-tn-error bg-tn-error/10 px-4 py-3 rounded-lg">{error}</div>
        )}

        {/* 上传/新增区 */}
        <div className="card p-4 mb-6">
          <div className="flex items-center gap-4 flex-wrap">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm"
            >
              {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              {draftUrl ? '重新上传图片' : '上传图片'}
            </button>

            {draftUrl && (
              <img src={draftUrl} alt="draft" className="w-14 h-14 rounded-lg object-cover border border-white/10" />
            )}

            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="资产名称"
              className="input py-1.5 text-sm w-40"
            />

            <select
              value={draftType}
              onChange={(e) => setDraftType(e.target.value as AssetType)}
              className="input py-1.5 text-sm w-28"
            >
              {(['CHARACTER', 'PRODUCT', 'STYLE', 'REFERENCE'] as AssetType[]).map((t) => (
                <option key={t} value={t}>{TYPE_META[t].label}</option>
              ))}
            </select>

            <input
              value={draftDesc}
              onChange={(e) => setDraftDesc(e.target.value)}
              placeholder="描述（可选）"
              className="input py-1.5 text-sm flex-1 min-w-[160px]"
            />

            <button
              onClick={saveAsset}
              disabled={uploading || !draftUrl || !draftName.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-tn-primary/90 hover:bg-tn-primary text-white text-sm disabled:opacity-50"
            >
              <Save size={15} /> 存入资产库
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center text-tn-muted py-12">
            <Loader2 size={26} className="animate-spin mr-2" /> 加载…
          </div>
        ) : items.length === 0 ? (
          <div className="text-center text-tn-muted py-12">
            还没有资产。
            <button onClick={seedClassics} disabled={seeding} className="text-tn-accent hover:underline disabled:opacity-50">
              一键添加经典资产
            </button>
            ，或上传一张图片开始建立可复用素材
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {items.map((asset) => {
              const meta = TYPE_META[asset.type];
              const Icon = meta.icon;
              return (
                <div key={asset.id} className="card overflow-hidden group">
                  <div className="aspect-square bg-tn-cream relative">
                    <img src={asset.thumbnail || asset.url} alt={asset.name} className="w-full h-full object-cover" />
                    <span className={`absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 ${meta.color}`}>
                      <Icon size={10} /> {meta.label}
                    </span>
                    <button
                      onClick={() => remove(asset.id)}
                      className="absolute top-2 right-2 p-1 rounded bg-black/50 text-tn-error opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium truncate">{asset.name}</p>
                    <p className="text-xs text-tn-muted truncate mt-0.5">{asset.description || `已使用 ${asset.usageCount} 次`}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

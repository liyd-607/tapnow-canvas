import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Image as ImageIcon,
  Sparkles,
  Palette,
  Bot,
  Wallet,
  LogOut,
  Menu,
  X,
  Zap,
  Settings,
  FolderOpen,
  LayoutTemplate,
  Film,
} from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '../store/authStore';

const navItems = [
  { path: '/', label: '画布', icon: Palette },
  { path: '/?mode=libtv', label: 'LibTV 画布', icon: Film },
  { path: '/generate', label: '图像生成', icon: ImageIcon },
  { path: '/agent', label: 'Agent 模式', icon: Bot },
  { path: '/skills', label: '技能市场', icon: Sparkles },
  { path: '/assets', label: '资产库', icon: FolderOpen },
  { path: '/templates', label: '模板库', icon: LayoutTemplate },
  { path: '/models', label: '模型配置', icon: Settings },
];

export function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  // 根据 pathname + search params 手动判断菜单项是否激活
  const isNavActive = (path: string) => {
    const itemPath = path.split('?')[0];
    const itemSearch = path.split('?')[1] || '';
    if (location.pathname !== itemPath) return false;
    if (!itemSearch) return !location.search;
    return location.search.includes(itemSearch);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-tn-bg overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-60' : 'w-0'
        } transition-all duration-300 bg-tn-panel border-r border-tn-border flex flex-col overflow-hidden`}
      >
        <div className="p-5 border-b border-tn-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-tn-primary to-tn-accent flex items-center justify-center">
              <Zap size={18} className="text-white" />
            </div>
            <span className="font-bold text-lg bg-gradient-to-r from-tn-primary to-tn-accent bg-clip-text text-transparent">
              TapNow
            </span>
          </div>
          <p className="text-xs text-tn-muted mt-1">AI 创意画布</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={() =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  isNavActive(item.path)
                    ? 'bg-tn-primary/20 text-tn-primary border border-tn-primary/30'
                    : 'text-tn-muted hover:text-tn-text hover:bg-tn-panel2'
                }`
              }
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-tn-border space-y-2">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-tn-panel2 border border-tn-border flex items-center justify-center text-xs">
              {user?.nickname?.[0] || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.nickname}</p>
              <p className="text-xs text-tn-muted truncate">{user?.phone}</p>
            </div>
          </div>

          <div className="flex items-center justify-between px-3 py-2 bg-tn-panel2 rounded-lg">
            <div className="flex items-center gap-2">
              <Wallet size={14} className="text-tn-warning" />
              <span className="text-xs text-tn-muted">积分</span>
            </div>
            <span className="text-sm font-semibold text-tn-warning">
              {user?.tapies ?? 0}
            </span>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-tn-muted hover:text-tn-error hover:bg-tn-error/10 transition-all"
          >
            <LogOut size={16} />
            <span>退出登录</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-tn-border bg-tn-panel/50 backdrop-blur flex items-center justify-between px-5">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-md hover:bg-tn-panel2 text-tn-muted hover:text-tn-text transition-all"
            >
              {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="chip bg-tn-primary/10 text-tn-primary border-tn-primary/30">
              MVP Beta
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Phone, Lock, Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { extractError } from '../api/client';

export function Login() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const { login, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleSendCode = async () => {
    if (!phone || phone.length < 11) {
      setError('请输入正确的手机号');
      return;
    }
    setSending(true);
    setError('');
    try {
      await useAuthStore.getState().sendCode(phone);
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            clearInterval(timer);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } catch (e) {
      setError(extractError(e));
    } finally {
      setSending(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(phone, code);
      navigate('/');
    } catch (e) {
      setError(extractError(e));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-tn-bg p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-tn-primary to-tn-accent mb-4 shadow-xl shadow-tn-primary/30">
            <Zap size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-tn-primary to-tn-accent bg-clip-text text-transparent">
            TapNow Canvas
          </h1>
          <p className="text-tn-muted mt-2">AI 创意操作系统 · 零摩擦创作</p>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-5">登录 / 注册</h2>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-tn-muted mb-1.5">手机号</label>
              <div className="relative">
                <Phone size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-tn-muted" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  placeholder="请输入手机号"
                  className="input pl-10"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-tn-muted mb-1.5">验证码</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-tn-muted" />
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6 位验证码"
                    className="input pl-10"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={countdown > 0 || sending}
                  className="btn-secondary whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? (
                    <Loader2 size={16} className="animate-spin inline mr-1" />
                  ) : null}
                  {countdown > 0 ? `${countdown}s` : '获取验证码'}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-sm text-tn-error bg-tn-error/10 px-3 py-2 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !phone || !code}
              className="btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 size={18} className="animate-spin inline mr-2" />
              ) : null}
              登 录
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-tn-border text-xs text-tn-muted text-center">
            开发环境：验证码会打印在后端控制台，也可查看浏览器 Network
          </div>
        </div>

        <p className="text-center text-xs text-tn-muted mt-6">
          登录即表示同意服务条款和隐私政策
        </p>
      </div>
    </div>
  );
}

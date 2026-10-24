import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import { Login } from './pages/Login';
import { CanvasList } from './pages/CanvasList';
import { CanvasEditor } from './pages/CanvasEditor';
import { Generate } from './pages/Generate';
import { Skills } from './pages/Skills';
import { Agent } from './pages/Agent';
import { Assets } from './pages/Assets';
import { Templates } from './pages/Templates';
import { ModelSettings } from './pages/ModelSettings';
import { LibTVCanvas } from './pages/LibTVCanvas';
import { useAuthStore } from './store/authStore';
import { useEffect } from 'react';

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(err: Error) { return { err: err.message + '\n' + (err.stack || '') }; }
  componentDidCatch(err: Error, info: any) { console.error('[AppErrorBoundary]', err, info); }
  render() {
    if (this.state.err) {
      const msg = this.state.err;
      return (
        <div className="h-screen flex items-center justify-center p-6 bg-black text-rose-300 text-xs font-mono whitespace-pre-wrap">
          <div className="max-w-3xl">
            <div className="font-bold text-rose-200 mb-2">画布渲染失败</div>
            {String(msg)}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, accessToken, fetchMe } = useAuthStore();

  useEffect(() => {
    if (accessToken && !user) {
      fetchMe().catch(() => {});
    }
  }, [accessToken, user, fetchMe]);

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <AppErrorBoundary>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/canvas/:id"
            element={
              <ProtectedRoute>
                <CanvasEditor />
              </ProtectedRoute>
            }
          />
          <Route
            path="/libtv-canvas/:id"
            element={
              <ProtectedRoute>
                <LibTVCanvas />
              </ProtectedRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<CanvasList />} />
            <Route path="generate" element={<Generate />} />
            <Route path="agent" element={<Agent />} />
            <Route path="skills" element={<Skills />} />
            <Route path="assets" element={<Assets />} />
            <Route path="templates" element={<Templates />} />
            <Route path="models" element={<ModelSettings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppErrorBoundary>
    </BrowserRouter>
  );
}

export default App;

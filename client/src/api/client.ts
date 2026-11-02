import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

/** 与后端约定的追踪号请求头（对标即梦 logid） */
export const REQUEST_ID_HEADER = 'x-request-id';

/** 生成一个客户端追踪号（用于串联一次请求 → 任务 → WebSocket 事件） */
export function newRequestId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export const apiClient = axios.create({
  baseURL,
  timeout: 30000,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // 附带客户端追踪号：后端会在响应头回传同一个值，便于问题定位
  if (!config.headers[REQUEST_ID_HEADER]) {
    config.headers[REQUEST_ID_HEADER] = newRequestId();
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const extractError = (err: any): string => {
  const msg = err?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join('; ');
  return msg || err?.message || '请求失败，请稍后重试';
};

/** 取服务端返回的追踪号（响应头 / 错误体） */
export const extractRequestId = (err: any): string | undefined => {
  return (
    err?.response?.data?.requestId ||
    err?.response?.headers?.[REQUEST_ID_HEADER] ||
    err?.config?.headers?.[REQUEST_ID_HEADER]
  );
};

/** 生成错误提示（附带追踪号，便于提交工单） */
export const extractErrorWithTrace = (err: any): string => {
  const base = extractError(err);
  const rid = extractRequestId(err);
  return rid ? `${base}（追踪号 ${rid}）` : base;
};

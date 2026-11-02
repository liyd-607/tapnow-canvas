import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

/** 请求/响应头名称：对外暴露，用于前端上报与日志串联 */
export const REQUEST_ID_HEADER = 'x-request-id';
/** request 对象上挂载 requestId 的属性名 */
export const REQUEST_ID_KEY = 'requestId';

/**
 * 请求上下文中间件
 *
 * 对标即梦的 `logid`：为每个 HTTP 请求生成（或透传）一个全局唯一追踪号，
 * 贯穿 响应头 → 错误体 → 生成任务 traceId → WebSocket 事件。
 *
 * - 若上游已带 `x-request-id`（网关 / 前端重试），则沿用，保证一次重试链路的追踪号一致
 * - 否则生成 uuid v4
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const raw = Array.isArray(incoming) ? incoming[0] : incoming;
    const requestId = (raw && String(raw).trim()) || randomUUID();

    (req as any)[REQUEST_ID_KEY] = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);

    next();
  }
}

/** 从 request 上取 requestId（异常过滤器 / 拦截器可用） */
export function getRequestId(req: Request | undefined): string | undefined {
  if (!req) return undefined;
  return (req as any)[REQUEST_ID_KEY];
}

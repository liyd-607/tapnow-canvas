import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { getRequestId } from '../middleware/request-context.middleware';

/**
 * 全局异常过滤器
 *
 * 统一错误响应结构，便于前端与日志按 requestId 串联：
 *   { statusCode, message, error, requestId, timestamp, path }
 *
 * 注意：`message` 字段保持与原有 Nest 默认格式一致（字符串），
 * 前端 `extractError` 无需改动即可继续工作。
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const requestId = getRequestId(req);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器内部错误';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        error = HttpStatus[status] || error;
      } else if (body && typeof body === 'object') {
        const obj = body as Record<string, any>;
        if (Array.isArray(obj.message)) {
          message = obj.message.join('; ');
        } else if (typeof obj.message === 'string') {
          message = obj.message;
        }
        error = obj.error || HttpStatus[status] || error;
      }
    } else if (exception instanceof Error) {
      message = exception.message || message;
    }

    if (status >= 500) {
      this.logger.error(
        `[${requestId || '-'}] ${req?.method} ${req?.url} -> ${status} ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`[${requestId || '-'}] ${req?.method} ${req?.url} -> ${status} ${message}`);
    }

    res.status(status).json({
      statusCode: status,
      message,
      error,
      requestId,
      timestamp: new Date().toISOString(),
      path: req?.url,
      ...pickExtraBody(exception),
    });
  }
}

/** 取出 HttpException body 中的额外字段（如 serverVersion / serverGraph），原样透传 */
function pickExtra(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    if (key === 'message' || key === 'error' || key === 'statusCode') continue;
    out[key] = obj[key];
  }
  return out;
}

function pickExtraBody(exception: unknown): Record<string, any> {
  if (exception instanceof HttpException) {
    const body = exception.getResponse();
    if (body && typeof body === 'object') return pickExtra(body as Record<string, any>);
  }
  return {};
}

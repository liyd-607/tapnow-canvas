import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

/**
 * 机器主体守卫（服务令牌）
 *
 * 用途：给「外部编排器」用。典型场景是 WorkBuddy 通过 LibTV MCP 驱动本平台：
 * 编排器需要读写画布图，但它不是一个真人用户（没有手机号、不能走短信验证码登录）。
 *
 * 设计要点：
 *  - 与现有 JwtAuthGuard **完全隔离**：本守卫只挂在 OrchestratorController 上，
 *    用户面路由（/canvas、/generations…）的 JwtAuthGuard 一行不动。
 *    这是「新增面」而不是「放宽面」，前端永远拿不到这个令牌。
 *  - 认证与授权分离：
 *      X-TapNow-Service-Token  → 你是谁（认证）
 *      X-TapNow-User-Id        → 你代表谁（授权），缺省回落 ORCHESTRATOR_USER_ID
 *  - 令牌只从服务端环境变量读取，比较用 timingSafeEqual 防时序侧信道。
 */

export const SERVICE_TOKEN_HEADER = 'x-tapnow-service-token';
export const SERVICE_USER_HEADER = 'x-tapnow-user-id';

export interface ServiceTokenCheck {
  ok: boolean;
  userId?: string;
  reason?: string;
}

/**
 * 校验服务令牌并解析出代理的用户。
 *
 * 纯函数 —— Nest 的 Guard 与 MCP 的 express 中间件共用同一份实现，
 * 避免两处各写一遍鉴权逻辑而走样。
 */
export function checkServiceToken(headers: Record<string, any>): ServiceTokenCheck {
  const expected = process.env.ORCHESTRATOR_TOKEN;
  if (!expected) {
    return { ok: false, reason: '服务端未配置 ORCHESTRATOR_TOKEN' };
  }

  const provided = headers?.[SERVICE_TOKEN_HEADER];
  if (typeof provided !== 'string' || !safeEqual(provided, expected)) {
    return { ok: false, reason: '服务令牌无效' };
  }

  const userId = headers?.[SERVICE_USER_HEADER] || process.env.ORCHESTRATOR_USER_ID;
  if (!userId) {
    return {
      ok: false,
      reason: `缺少 ${SERVICE_USER_HEADER} 请求头，且服务端未配置 ORCHESTRATOR_USER_ID`,
    };
  }
  return { ok: true, userId: String(userId) };
}

@Injectable()
export class ServiceTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const check = checkServiceToken(req.headers ?? {});

    if (!check.ok) {
      // 未配置令牌属于服务端问题（403），令牌不对属于认证失败（401）
      const isServerConfig = /未配置/.test(check.reason ?? '');
      if (isServerConfig) throw new ForbiddenException(check.reason);
      throw new UnauthorizedException(check.reason);
    }

    // 供控制器读取：req.actingUserId
    req.actingUserId = check.userId;
    return true;
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

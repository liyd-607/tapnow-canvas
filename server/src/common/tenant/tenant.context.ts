/*
 * ===========================================
 * 租户上下文
 * ===========================================
 */

import { Injectable } from '@nestjs/common';
import { Request } from 'express';

export interface TenantContextData {
  tenantId: string;
  userId: string;
  userRole: string;
}

export class TenantContext {
  static readonly KEY = 'tenantContext';

  static get(req: Request): TenantContextData | undefined {
    return (req as any)[TenantContext.KEY];
  }

  static set(req: Request, data: TenantContextData): void {
    (req as any)[TenantContext.KEY] = data;
  }
}

@Injectable()
export class TenantMiddleware {
  constructor() {}

  use(req: Request, res: any, next: () => void) {
    // 租户上下文初始化
    // 实际实现需要在 JwtAuthGuard 中设置
    next();
  }
}

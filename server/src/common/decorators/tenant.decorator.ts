/*
 * ===========================================
 * 租户上下文装饰器和守卫
 * ===========================================
 */

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantContext } from '../tenant/tenant.context';

/**
 * 获取当前租户ID
 */
export const CurrentTenantId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request[TenantContext.KEY]?.tenantId;
  },
);

/**
 * 获取当前用户ID
 */
export const CurrentUserId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request[TenantContext.KEY]?.userId;
  },
);

/**
 * 获取当前用户角色
 */
export const CurrentUserRole = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request[TenantContext.KEY]?.userRole;
  },
);

/**
 * 获取当前用户
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

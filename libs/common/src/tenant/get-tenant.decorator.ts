import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import './express-augment';

/**
 * Injects the resolved `tenantId` for the current HTTP request (set by
 * {@link TenantMiddleware} / {@link TenantInterceptor} when `x-tenant-id` is present).
 */
export const GetTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    if (ctx.getType() !== 'http') {
      throw new BadRequestException(
        '@GetTenant() is only valid on HTTP routes',
      );
    }
    const req = ctx.switchToHttp().getRequest<Request>();
    const id = req.tenantId?.trim();
    if (!id) {
      throw new BadRequestException(
        'Tenant context is not available for this handler',
      );
    }
    return id;
  },
);

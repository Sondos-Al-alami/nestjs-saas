import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

@Injectable()
export class GatewayThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const request = req as Request;
    return request.ip ?? 'unknown-ip';
  }

  protected generateKey(
    context: ExecutionContext,
    tracker: string,
    name: string,
  ): string {
    const req = context.switchToHttp().getRequest<Request>();
    const tenantRaw = req.headers['x-tenant-id'];
    const tenantId = Array.isArray(tenantRaw) ? tenantRaw[0] : tenantRaw;

    if (name === 'tenant') {
      const tenantKey = tenantId?.trim() || 'public';
      return `${name}:${tenantKey}`;
    }
    return `${name}:${tracker}`;
  }
}

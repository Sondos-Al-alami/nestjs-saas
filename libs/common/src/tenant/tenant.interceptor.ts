import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import './express-augment';
import { TENANT_ID_HEADER } from './tenant.constants';
import { isTenantOptionalRoute, normalizeRequestPath } from './tenant-route.util';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request>();
    const path = normalizeRequestPath(req.path);
    const method = req.method;

    const raw = req.headers[TENANT_ID_HEADER] ?? req.headers['x-tenant-id'];
    const fromHeader = Array.isArray(raw) ? raw[0] : raw;
    if (fromHeader?.trim()) {
      req.tenantId = fromHeader.trim();
    }

    if (isTenantOptionalRoute(method, path)) {
      return next.handle();
    }

    if (!req.tenantId?.trim()) {
      throw new BadRequestException(`Missing required header: ${TENANT_ID_HEADER}`);
    }

    return next.handle();
  }
}

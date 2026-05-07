import {
  BadRequestException,
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import './express-augment';
import { TENANT_ID_HEADER } from './tenant.constants';
import {
  isTenantOptionalRoute,
  normalizeRequestPath,
} from './tenant-route.util';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const path = normalizeRequestPath(req.path);
    const method = req.method;

    const raw = req.headers[TENANT_ID_HEADER] ?? req.headers['x-tenant-id'];
    const fromHeader = Array.isArray(raw) ? raw[0] : raw;
    if (fromHeader?.trim()) {
      req.tenantId = fromHeader.trim();
    }

    if (isTenantOptionalRoute(method, path)) {
      next();
      return;
    }

    if (!req.tenantId?.trim()) {
      throw new BadRequestException(
        `Missing required header: ${TENANT_ID_HEADER}`,
      );
    }

    next();
  }
}

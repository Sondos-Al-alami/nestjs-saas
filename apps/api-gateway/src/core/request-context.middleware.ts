import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { GatewayMetricsService } from './gateway-metrics.service';

// Middleware applied to incoming gateway requests to:
// 1) ensure each request has a correlation id (`x-request-id`)
// 2) expose that id on the response
// 3) log one timing line when the response finishes
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger('GatewayRequest');
  constructor(private readonly metrics: GatewayMetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const requestIdHeader = req.headers['x-request-id'];
    const requestId =
      (Array.isArray(requestIdHeader)
        ? requestIdHeader[0]
        : requestIdHeader
      )?.trim() || randomUUID();

    req.headers['x-request-id'] = requestId;
    res.setHeader('x-request-id', requestId);

    const startedAt = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      this.metrics.recordRequest(res.statusCode, durationMs);
      this.logger.log(
        JSON.stringify({
          event: 'gateway_request',
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          requestId,
          durationMs,
        }),
      );
    });

    next();
  }
}

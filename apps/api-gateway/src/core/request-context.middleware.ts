// Nest helpers:
// - Injectable: registers this middleware in Nest DI container.
// - Logger: structured logger utility.
// - NestMiddleware: interface requiring `use(req, res, next)`.
import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
// Express types for strongly typed middleware arguments.
import type { NextFunction, Request, Response } from 'express';
// Node crypto helper to generate a fallback request id when missing.
import { randomUUID } from 'node:crypto';

// Middleware applied to incoming gateway requests to:
// 1) ensure each request has a correlation id (`x-request-id`)
// 2) expose that id on the response
// 3) log one timing line when the response finishes
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  // Dedicated log context label shown in Nest logs.
  private readonly logger = new Logger('GatewayRequest');

  // Standard Express middleware entry point.
  use(req: Request, res: Response, next: NextFunction): void {
    // Read incoming correlation id header, if client/proxy already sent one.
    const requestIdHeader = req.headers['x-request-id'];
    // Normalize header to a single non-empty string:
    // - when header is array, use first value
    // - trim whitespace
    // - if still empty/missing, generate a new UUID
    const requestId =
      (Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader)?.trim() ||
      randomUUID();

    // Store normalized id back on request headers so downstream logic can read it.
    req.headers['x-request-id'] = requestId;
    // Return same id to caller for client/server log correlation.
    res.setHeader('x-request-id', requestId);

    // Capture start time once for duration calculation.
    const startedAt = Date.now();
    // Emit final log after response completes (status code is now final).
    res.on('finish', () => {
      this.logger.log(
        // Single-line structured summary for request tracing.
        `${req.method} ${req.originalUrl} ${res.statusCode} requestId=${requestId} durationMs=${
          Date.now() - startedAt
        }`,
      );
    });

    // Continue request pipeline.
    next();
  }
}

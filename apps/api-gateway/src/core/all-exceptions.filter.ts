import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { GatewayMetricsService } from './gateway-metrics.service';

// Standardizes error payloads and keeps requestId visible for client-side debugging.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  constructor(private readonly metrics: GatewayMetricsService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const responseBody = isHttpException
      ? exception.getResponse()
      : { message: 'Internal server error' };

    const requestIdHeader = req.headers['x-request-id'];
    const requestId = Array.isArray(requestIdHeader)
      ? requestIdHeader[0]
      : requestIdHeader;

    if (status >= 500) {
      this.metrics.record5xxError();
      this.logger.error(
        JSON.stringify({
          event: 'gateway_exception',
          method: req.method,
          path: req.originalUrl,
          statusCode: status,
          requestId: requestId ?? null,
        }),
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    res.status(status).json({
      statusCode: status,
      path: req.originalUrl,
      requestId: requestId ?? null,
      error: responseBody,
      timestamp: new Date().toISOString(),
    });
  }
}

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { NextFunction, Request, Response, json, urlencoded } from 'express';
import helmet from 'helmet';
import { ApiGatewayModule } from './api-gateway.module';
import { AllExceptionsFilter } from './core/all-exceptions.filter';
import { GatewayMetricsService } from './core/gateway-metrics.service';

function assertRequiredSecretsInProduction(): void {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }
  const required = ['JWT_SECRET', 'INTERNAL_SERVICE_SECRET'];
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing required production secret env vars: ${missing.join(', ')}`,
    );
  }
}

function resolveCorsOrigins(): string[] {
  const raw = process.env.GATEWAY_CORS_ORIGINS?.trim();
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

async function bootstrap() {
  assertRequiredSecretsInProduction();
  const app =
    await NestFactory.create<NestExpressApplication>(ApiGatewayModule);
  const trustProxyRaw = process.env.GATEWAY_TRUST_PROXY?.trim() || 'false';
  const trustProxy = trustProxyRaw === 'true' || trustProxyRaw === '1';
  if (trustProxy) {
    app.set('trust proxy', 1);
  }
  app.use(helmet());
  const corsOrigins = resolveCorsOrigins();
  if (corsOrigins.length > 0) {
    app.enableCors({
      origin: corsOrigins,
      credentials: true,
    });
  }

  const jsonLimit = process.env.GATEWAY_JSON_LIMIT?.trim() || '256kb';
  const urlencodedLimit =
    process.env.GATEWAY_URLENCODED_LIMIT?.trim() || '256kb';
  app.use(json({ limit: jsonLimit }));
  app.use(urlencoded({ limit: urlencodedLimit, extended: true }));
  const requestTimeoutMs = parseInt(
    process.env.GATEWAY_REQUEST_TIMEOUT_MS ?? '30000',
    10,
  );
  app.use((req: Request, res: Response, next: NextFunction) => {
    req.setTimeout(requestTimeoutMs);
    res.setTimeout(requestTimeoutMs, () => {
      if (!res.headersSent) {
        res.status(408).json({ message: 'Request timeout' });
      }
    });
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter(app.get(GatewayMetricsService)));
  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);
}
void bootstrap();

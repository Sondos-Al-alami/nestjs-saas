import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';
import { NestExpressApplication } from '@nestjs/platform-express';
import { config as dotenvConfig } from 'dotenv';
import { AuthOrgServiceModule } from './auth-org-service.module';

function loadAuthOrgEnv(): void {
  const rootEnv = resolve(process.cwd(), '.env');
  const appEnv = resolve(process.cwd(), 'apps/auth-org-service/.env');
  if (existsSync(rootEnv)) {
    dotenvConfig({ path: rootEnv });
  }
  if (existsSync(appEnv)) {
    dotenvConfig({ path: appEnv, override: true });
  }
}

async function bootstrap() {
  loadAuthOrgEnv();

  const app = await NestFactory.create<NestExpressApplication>(
    AuthOrgServiceModule,
    { rawBody: true },
  );

  app.connectMicroservice({
    transport: Transport.TCP,
    options: {
      host: process.env.TCP_HOST ?? '0.0.0.0',
      port: parseInt(process.env.AUTH_ORG_TCP_PORT ?? '3001', 10),
    },
  });

  await app.startAllMicroservices();

  const httpPort = parseInt(process.env.AUTH_ORG_HTTP_PORT ?? '3011', 10);
  await app.listen(httpPort);
}
bootstrap();

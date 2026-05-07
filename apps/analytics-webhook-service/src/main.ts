import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';
import { AnalyticsWebhookServiceModule } from './analytics-webhook-service.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice(
    AnalyticsWebhookServiceModule,
    {
      transport: Transport.TCP,
      options: {
        host: process.env.TCP_HOST ?? '0.0.0.0',
        port: parseInt(process.env.ANALYTICS_TCP_PORT ?? '3003', 10),
      },
    },
  );
  await app.listen();
}
void bootstrap();

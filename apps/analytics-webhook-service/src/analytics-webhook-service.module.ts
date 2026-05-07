import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AnalyticsWebhookServiceController } from './analytics-webhook-service.controller';
import { AnalyticsWebhookServiceService } from './analytics-webhook-service.service';

@Module({
  imports: [PrismaModule, ScheduleModule.forRoot()],
  controllers: [AnalyticsWebhookServiceController],
  providers: [AnalyticsWebhookServiceService],
})
export class AnalyticsWebhookServiceModule {}

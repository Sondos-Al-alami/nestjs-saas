import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { MSG_ANALYTICS_HEALTH } from '@saas/common';
import { AnalyticsWebhookServiceService } from './analytics-webhook-service.service';

@Controller()
export class AnalyticsWebhookServiceController {
  constructor(
    private readonly analyticsWebhookServiceService: AnalyticsWebhookServiceService,
  ) {}

  @MessagePattern(MSG_ANALYTICS_HEALTH)
  health() {
    return this.analyticsWebhookServiceService.health();
  }
}

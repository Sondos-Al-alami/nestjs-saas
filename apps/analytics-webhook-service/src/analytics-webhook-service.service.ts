import { Injectable } from '@nestjs/common';

@Injectable()
export class AnalyticsWebhookServiceService {
  health() {
    return { service: 'analytics-webhook-service', ok: true as const };
  }
}

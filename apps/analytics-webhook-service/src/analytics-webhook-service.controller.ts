import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import {
  MSG_ANALYTICS_CERTIFICATION_EARNED,
  MSG_ANALYTICS_COURSE_COMPLETED,
  MSG_ANALYTICS_DLQ_LIST,
  MSG_ANALYTICS_DLQ_REQUEUE,
  MSG_ANALYTICS_DLQ_SUMMARY,
  MSG_ANALYTICS_EVENTS_LIST,
  MSG_ANALYTICS_HEALTH,
  MSG_ANALYTICS_LESSON_COMPLETED,
  MSG_ANALYTICS_LESSON_STARTED,
  MSG_ANALYTICS_REPORT_COMPLETIONS,
  MSG_ANALYTICS_REPORT_ENGAGEMENT,
  MSG_ANALYTICS_REPORT_EVENT_VOLUME,
  MSG_ANALYTICS_WEBHOOK_ENDPOINT_UPSERT,
} from '@saas/common';
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

  @MessagePattern(MSG_ANALYTICS_LESSON_STARTED)
  lessonStarted(payload: {
    tenantId: string;
    userId: string;
    courseId: string;
    enrollmentId: string;
    idempotencyKey: string;
    occurredAt?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.analyticsWebhookServiceService.trackLessonStarted(payload);
  }

  @MessagePattern(MSG_ANALYTICS_LESSON_COMPLETED)
  lessonCompleted(payload: {
    tenantId: string;
    userId: string;
    courseId: string;
    enrollmentId: string;
    idempotencyKey: string;
    occurredAt?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.analyticsWebhookServiceService.trackLessonCompleted(payload);
  }

  @MessagePattern(MSG_ANALYTICS_COURSE_COMPLETED)
  courseCompleted(payload: {
    tenantId: string;
    userId: string;
    courseId: string;
    enrollmentId: string;
    idempotencyKey: string;
    occurredAt?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.analyticsWebhookServiceService.trackCourseCompleted(payload);
  }

  @MessagePattern(MSG_ANALYTICS_CERTIFICATION_EARNED)
  certificationEarned(payload: {
    tenantId: string;
    userId: string;
    courseId: string;
    enrollmentId: string;
    idempotencyKey: string;
    occurredAt?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.analyticsWebhookServiceService.trackCertificationEarned(
      payload,
    );
  }

  @MessagePattern(MSG_ANALYTICS_WEBHOOK_ENDPOINT_UPSERT)
  upsertWebhookEndpoint(payload: {
    tenantId: string;
    url: string;
    secret: string;
    isActive?: boolean;
  }) {
    return this.analyticsWebhookServiceService.upsertWebhookEndpoint(payload);
  }

  @MessagePattern(MSG_ANALYTICS_EVENTS_LIST)
  listEvents(payload: {
    tenantId: string;
    limit?: number;
    cursor?: string;
    eventType?: string;
  }) {
    return this.analyticsWebhookServiceService.listEvents(payload);
  }

  @MessagePattern(MSG_ANALYTICS_REPORT_COMPLETIONS)
  completionReport(payload: { tenantId: string }) {
    return this.analyticsWebhookServiceService.completionReport(payload);
  }

  @MessagePattern(MSG_ANALYTICS_REPORT_ENGAGEMENT)
  engagementReport(payload: { tenantId: string; days?: number }) {
    return this.analyticsWebhookServiceService.engagementReport(payload);
  }

  @MessagePattern(MSG_ANALYTICS_REPORT_EVENT_VOLUME)
  eventVolumeReport(payload: { tenantId: string; days?: number }) {
    return this.analyticsWebhookServiceService.eventVolumeReport(payload);
  }

  @MessagePattern(MSG_ANALYTICS_DLQ_LIST)
  listDeadLetters(payload: {
    tenantId: string;
    limit?: number;
    cursor?: string;
    eventType?: string;
  }) {
    return this.analyticsWebhookServiceService.listDeadLetters(payload);
  }

  @MessagePattern(MSG_ANALYTICS_DLQ_REQUEUE)
  requeueDeadLetter(payload: { tenantId: string; deadLetterId: string }) {
    return this.analyticsWebhookServiceService.requeueDeadLetter(payload);
  }

  @MessagePattern(MSG_ANALYTICS_DLQ_SUMMARY)
  dlqSummary(payload: { hours?: number }) {
    return this.analyticsWebhookServiceService.dlqSummary(payload);
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
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
import { firstValueFrom } from 'rxjs';
import { type HealthResponse, tcpCall } from '../core/tcp-rpc';

type EnrollmentSnapshot = {
  id: string;
  tenantId: string;
  userId: string;
  courseId: string;
  progressPercent: number;
  lessonsCompleted: number;
  completedAt: string | Date | null;
};

@Injectable()
export class AnalyticsGatewayService {
  constructor(
    @Inject('ANALYTICS_WEBHOOK_SERVICE')
    private readonly analytics: ClientProxy,
  ) {}

  private call<T>(pattern: string, payload: unknown): Promise<T> {
    return tcpCall<T>(this.analytics, pattern, payload);
  }

  health(): Promise<HealthResponse> {
    return firstValueFrom(
      this.analytics.send<HealthResponse>(MSG_ANALYTICS_HEALTH, {}),
    );
  }

  upsertWebhookEndpoint(payload: {
    tenantId: string;
    url: string;
    secret: string;
    isActive?: boolean;
  }) {
    return this.call(MSG_ANALYTICS_WEBHOOK_ENDPOINT_UPSERT, payload);
  }

  listEvents(payload: {
    tenantId: string;
    limit?: number;
    cursor?: string;
    eventType?: string;
  }) {
    return this.call(MSG_ANALYTICS_EVENTS_LIST, payload);
  }

  completionReport(payload: { tenantId: string }) {
    return this.call(MSG_ANALYTICS_REPORT_COMPLETIONS, payload);
  }

  engagementReport(payload: { tenantId: string; days?: number }) {
    return this.call(MSG_ANALYTICS_REPORT_ENGAGEMENT, payload);
  }

  eventVolumeReport(payload: { tenantId: string; days?: number }) {
    return this.call(MSG_ANALYTICS_REPORT_EVENT_VOLUME, payload);
  }

  listDlq(payload: {
    tenantId: string;
    limit?: number;
    cursor?: string;
    eventType?: string;
  }) {
    return this.call(MSG_ANALYTICS_DLQ_LIST, payload);
  }

  requeueDlq(payload: { tenantId: string; deadLetterId: string }) {
    return this.call(MSG_ANALYTICS_DLQ_REQUEUE, payload);
  }

  dlqSummary(payload: { hours?: number }): Promise<{
    windowHours: number;
    totals: number;
    requeued: number;
    open: number;
    oldestOpenAgeMinutes: number;
    oldestOpen: {
      createdAt: string;
      eventType: string;
      tenantId: string;
    } | null;
  }> {
    return this.call(MSG_ANALYTICS_DLQ_SUMMARY, payload);
  }

  /** Fire-and-forget learning events derived from an enrollment progress update. */
  async emitLearningEventsFromEnrollmentUpdate(args: {
    before: EnrollmentSnapshot;
    after: EnrollmentSnapshot;
    touchAccess?: boolean;
    actingUserId: string;
  }): Promise<void> {
    const { before, after, touchAccess, actingUserId } = args;
    const basePayload = {
      tenantId: after.tenantId,
      userId: after.userId,
      courseId: after.courseId,
      enrollmentId: after.id,
      occurredAt: new Date().toISOString(),
    };
    const events: Array<Promise<unknown>> = [];
    const progressIncreased = after.progressPercent > before.progressPercent;
    const lessonsIncreased = after.lessonsCompleted > before.lessonsCompleted;
    const completedNow = !before.completedAt && !!after.completedAt;

    if (touchAccess || progressIncreased || lessonsIncreased) {
      events.push(
        this.call(MSG_ANALYTICS_LESSON_STARTED, {
          ...basePayload,
          idempotencyKey: `${after.id}:lesson.started:${after.lessonsCompleted}:${after.progressPercent}:${touchAccess ? 1 : 0}`,
          metadata: {
            trigger: touchAccess ? 'touch-access' : 'progress',
            actorUserId: actingUserId,
            progressPercent: after.progressPercent,
            lessonsCompleted: after.lessonsCompleted,
          },
        }),
      );
    }
    if (lessonsIncreased) {
      events.push(
        this.call(MSG_ANALYTICS_LESSON_COMPLETED, {
          ...basePayload,
          idempotencyKey: `${after.id}:lesson.completed:${after.lessonsCompleted}`,
          metadata: {
            actorUserId: actingUserId,
            lessonsCompleted: after.lessonsCompleted,
            deltaLessonsCompleted:
              after.lessonsCompleted - before.lessonsCompleted,
          },
        }),
      );
    }
    if (completedNow) {
      const completedAt =
        after.completedAt instanceof Date
          ? after.completedAt.toISOString()
          : after.completedAt;
      events.push(
        this.call(MSG_ANALYTICS_COURSE_COMPLETED, {
          ...basePayload,
          idempotencyKey: `${after.id}:course.completed:${completedAt ?? 'unknown'}`,
          metadata: {
            actorUserId: actingUserId,
            completedAt,
          },
        }),
      );
      events.push(
        this.call(MSG_ANALYTICS_CERTIFICATION_EARNED, {
          ...basePayload,
          idempotencyKey: `${after.id}:certification.earned:${completedAt ?? 'unknown'}`,
          metadata: { actorUserId: actingUserId, source: 'course-completion' },
        }),
      );
    }
    if (events.length > 0) {
      await Promise.allSettled(events);
    }
  }
}

import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  MSG_ANALYTICS_CERTIFICATION_EARNED,
  MSG_ANALYTICS_DLQ_LIST,
  MSG_ANALYTICS_DLQ_REQUEUE,
  MSG_ANALYTICS_DLQ_SUMMARY,
  MSG_ANALYTICS_EVENTS_LIST,
  MSG_ANALYTICS_HEALTH,
  MSG_ANALYTICS_COURSE_COMPLETED,
  MSG_ANALYTICS_LESSON_COMPLETED,
  MSG_ANALYTICS_LESSON_STARTED,
  MSG_ANALYTICS_REPORT_COMPLETIONS,
  MSG_ANALYTICS_REPORT_ENGAGEMENT,
  MSG_ANALYTICS_REPORT_EVENT_VOLUME,
  MSG_ANALYTICS_WEBHOOK_ENDPOINT_UPSERT,
  MSG_AUTH_ORG_ACCEPT_INVITE,
  MSG_AUTH_ORG_BILLING_OPS_SUMMARY,
  MSG_AUTH_ORG_CREATE_INVITE,
  MSG_AUTH_ORG_HEALTH,
  MSG_AUTH_ORG_LOGIN,
  MSG_AUTH_ORG_LOGOUT,
  MSG_AUTH_ORG_LOGOUT_ALL,
  MSG_AUTH_ORG_REFRESH,
  MSG_AUTH_ORG_REGISTER_TENANT,
  MSG_AUTH_ORG_SEAT_ASSERT_AVAILABLE,
  MSG_AUTH_ORG_TENANT_ECHO,
  MSG_COURSE_CREATE,
  MSG_COURSE_DELETE,
  MSG_COURSE_ENROLLMENT_CREATE,
  MSG_COURSE_ENROLLMENT_DELETE,
  MSG_COURSE_ENROLLMENT_GET,
  MSG_COURSE_ENROLLMENT_LIST_BY_COURSE,
  MSG_COURSE_ENROLLMENT_LIST_BY_USER,
  MSG_COURSE_ENROLLMENT_UPDATE,
  MSG_COURSE_GET,
  MSG_COURSE_HEALTH,
  MSG_COURSE_LESSON_CREATE,
  MSG_COURSE_LESSON_DELETE,
  MSG_COURSE_LESSON_GET,
  MSG_COURSE_LESSONS_LIST,
  MSG_COURSE_LESSON_UPDATE,
  MSG_COURSE_LIST,
  MSG_COURSE_UPDATE,
  Role,
  SEAT_ENFORCEMENT_REASONS,
  SubscriptionTier,
} from '@saas/common';
import { firstValueFrom } from 'rxjs';
import { GatewayMetricsService } from './core/gateway-metrics.service';

type HealthResponse = { service: string; ok: boolean };

@Injectable()
export class ApiGatewayService {
  private readonly logger = new Logger(ApiGatewayService.name);
  private readonly readinessTimeoutMs = parseInt(
    process.env.GATEWAY_READINESS_TIMEOUT_MS ?? '2500',
    10,
  );
  constructor(
    @Inject('AUTH_ORG_SERVICE') private readonly authOrg: ClientProxy,
    @Inject('COURSE_SERVICE') private readonly course: ClientProxy,
    @Inject('ANALYTICS_WEBHOOK_SERVICE')
    private readonly analytics: ClientProxy,
    private readonly metrics: GatewayMetricsService,
  ) {}

  getHello(): string {
    return 'API Gateway';
  }

  private normalizeRpcError(error: unknown): never {
    const fallbackMessage = 'Downstream service error';
    const e = error as
      | {
          status?: number;
          statusCode?: number;
          message?: string | string[];
          error?: {
            status?: number;
            statusCode?: number;
            message?: string | string[];
          };
          response?: {
            status?: number;
            statusCode?: number;
            message?: string | string[];
          };
        }
      | undefined;

    const status =
      e?.status ??
      e?.statusCode ??
      e?.error?.status ??
      e?.error?.statusCode ??
      e?.response?.status ??
      e?.response?.statusCode;

    const messageValue =
      e?.message ??
      e?.error?.message ??
      e?.response?.message ??
      fallbackMessage;
    const message = Array.isArray(messageValue)
      ? messageValue.join(', ')
      : String(messageValue || fallbackMessage);

    if (/already exists/i.test(message)) {
      throw new HttpException({ message }, HttpStatus.CONFLICT);
    }

    if (typeof status === 'number' && status >= 400 && status <= 599) {
      throw new HttpException({ message }, status);
    }

    throw new HttpException({ message }, HttpStatus.INTERNAL_SERVER_ERROR);
  }

  private async tcpCall<T>(
    client: ClientProxy,
    pattern: string,
    payload: unknown,
  ): Promise<T> {
    try {
      return await firstValueFrom(client.send<T>(pattern, payload));
    } catch (error) {
      this.normalizeRpcError(error);
    }
  }

  private authOrgCall<T>(pattern: string, payload: unknown): Promise<T> {
    return this.tcpCall<T>(this.authOrg, pattern, payload);
  }

  private courseCall<T>(pattern: string, payload: unknown): Promise<T> {
    return this.tcpCall<T>(this.course, pattern, payload);
  }

  private analyticsCall<T>(pattern: string, payload: unknown): Promise<T> {
    return this.tcpCall<T>(this.analytics, pattern, payload);
  }

  private async emitLearningEventsFromEnrollmentUpdate(args: {
    before: {
      id: string;
      tenantId: string;
      userId: string;
      courseId: string;
      progressPercent: number;
      lessonsCompleted: number;
      completedAt: string | Date | null;
    };
    after: {
      id: string;
      tenantId: string;
      userId: string;
      courseId: string;
      progressPercent: number;
      lessonsCompleted: number;
      completedAt: string | Date | null;
    };
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
        this.analyticsCall(MSG_ANALYTICS_LESSON_STARTED, {
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
        this.analyticsCall(MSG_ANALYTICS_LESSON_COMPLETED, {
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
        this.analyticsCall(MSG_ANALYTICS_COURSE_COMPLETED, {
          ...basePayload,
          idempotencyKey: `${after.id}:course.completed:${completedAt ?? 'unknown'}`,
          metadata: {
            actorUserId: actingUserId,
            completedAt,
          },
        }),
      );
      events.push(
        this.analyticsCall(MSG_ANALYTICS_CERTIFICATION_EARNED, {
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

  async downstreamHealth() {
    const [authOrg, course, analytics] = await Promise.all([
      firstValueFrom(
        this.authOrg.send<HealthResponse>(MSG_AUTH_ORG_HEALTH, {}),
      ),
      firstValueFrom(this.course.send<HealthResponse>(MSG_COURSE_HEALTH, {})),
      firstValueFrom(
        this.analytics.send<HealthResponse>(MSG_ANALYTICS_HEALTH, {}),
      ),
    ]);
    return { authOrg, course, analytics };
  }

  private async probeWithTimeout<T>(name: string, promise: Promise<T>) {
    const startedAt = Date.now();
    try {
      const value = await Promise.race([
        promise,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`${name} probe timeout`)),
            this.readinessTimeoutMs,
          ),
        ),
      ]);
      const details = value as { ok?: boolean };
      const ok = details?.ok !== false;
      return {
        ok,
        name,
        latencyMs: Date.now() - startedAt,
        details: value,
        ...(ok ? {} : { error: `${name} reported not ready` }),
      };
    } catch (error) {
      return {
        ok: false as const,
        name,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async readiness() {
    const checks = await Promise.all([
      this.probeWithTimeout(
        'auth-org-service',
        firstValueFrom(
          this.authOrg.send<HealthResponse>(MSG_AUTH_ORG_HEALTH, {}),
        ),
      ),
      this.probeWithTimeout(
        'course-service',
        firstValueFrom(this.course.send<HealthResponse>(MSG_COURSE_HEALTH, {})),
      ),
      this.probeWithTimeout(
        'analytics-webhook-service',
        firstValueFrom(
          this.analytics.send<HealthResponse>(MSG_ANALYTICS_HEALTH, {}),
        ),
      ),
    ]);
    const ok = checks.every((c) => c.ok);
    return {
      ok,
      service: 'api-gateway',
      checkedAt: new Date().toISOString(),
      checks,
    };
  }

  async alerts(hoursRaw?: string) {
    const hoursParsed = parseInt(hoursRaw ?? '24', 10);
    const hours = Number.isFinite(hoursParsed)
      ? Math.min(168, Math.max(1, hoursParsed))
      : 24;
    const [metrics, readiness, billingWebhookOps, analyticsDlq] =
      await Promise.all([
        Promise.resolve(this.metrics.snapshot()),
        this.readiness(),
        this.billingOpsSummary({ hours }),
        this.analyticsDlqSummary({ hours }),
      ]);
    const threshold5xxRate = Number(
      process.env.ALERT_5XX_RATE_THRESHOLD ?? '0.05',
    );
    const thresholdBillingFailureRate = Number(
      process.env.ALERT_BILLING_WEBHOOK_FAILURE_RATE_THRESHOLD ?? '0.02',
    );
    const thresholdDlqOpen = parseInt(
      process.env.ALERT_ANALYTICS_DLQ_OPEN_THRESHOLD ?? '25',
      10,
    );
    const thresholdDlqOldestMinutes = parseInt(
      process.env.ALERT_ANALYTICS_DLQ_OLDEST_MINUTES_THRESHOLD ?? '30',
      10,
    );
    const alerts = [
      {
        key: 'gateway.5xx-rate',
        triggered: metrics.errorRate5xx >= threshold5xxRate,
        severity:
          metrics.errorRate5xx >= threshold5xxRate * 2 ? 'critical' : 'warning',
        current: metrics.errorRate5xx,
        threshold: threshold5xxRate,
        message: 'Gateway 5xx error rate above threshold',
      },
      {
        key: 'gateway.readiness',
        triggered: !readiness.ok,
        severity: 'critical',
        current: readiness.ok ? 0 : 1,
        threshold: 0,
        message: 'At least one downstream dependency is not ready',
      },
      {
        key: 'billing.webhook-failure-rate',
        triggered: billingWebhookOps.failureRate >= thresholdBillingFailureRate,
        severity:
          billingWebhookOps.failureRate >= thresholdBillingFailureRate * 2
            ? 'critical'
            : 'warning',
        current: billingWebhookOps.failureRate,
        threshold: thresholdBillingFailureRate,
        message: 'Stripe webhook processing failure rate above threshold',
      },
      {
        key: 'analytics.dlq-open',
        triggered: analyticsDlq.open >= thresholdDlqOpen,
        severity:
          analyticsDlq.open >= thresholdDlqOpen * 2 ? 'critical' : 'warning',
        current: analyticsDlq.open,
        threshold: thresholdDlqOpen,
        message: 'Analytics DLQ backlog is above threshold',
      },
      {
        key: 'analytics.dlq-oldest-age',
        triggered:
          analyticsDlq.oldestOpenAgeMinutes >= thresholdDlqOldestMinutes,
        severity:
          analyticsDlq.oldestOpenAgeMinutes >= thresholdDlqOldestMinutes * 2
            ? 'critical'
            : 'warning',
        current: analyticsDlq.oldestOpenAgeMinutes,
        threshold: thresholdDlqOldestMinutes,
        message: 'Oldest open analytics DLQ item is too old',
      },
    ];
    return {
      ok: alerts.every((a) => !a.triggered),
      checkedAt: new Date().toISOString(),
      windowHours: hours,
      alerts,
      sources: { metrics, readiness, billingWebhookOps, analyticsDlq },
    };
  }

  async tenantAuthEcho(payload: {
    tenantId: string;
    userId: string;
    role: string;
  }) {
    return this.authOrgCall(MSG_AUTH_ORG_TENANT_ECHO, payload);
  }

  async registerTenant(payload: {
    tenantName: string;
    adminEmail: string;
    adminDisplayName?: string;
    adminPassword: string;
    allowedDomains?: string[];
  }) {
    return this.authOrgCall(MSG_AUTH_ORG_REGISTER_TENANT, payload);
  }

  async createInvite(payload: {
    tenantId: string;
    invitedByUserId: string;
    email: string;
    role: Role;
    expiresInDays?: number;
  }) {
    return this.authOrgCall(MSG_AUTH_ORG_CREATE_INVITE, payload);
  }

  async acceptInvite(payload: {
    token: string;
    displayName?: string;
    password: string;
  }) {
    return this.authOrgCall(MSG_AUTH_ORG_ACCEPT_INVITE, payload);
  }

  async login(payload: { tenantId: string; email: string; password: string }) {
    return this.authOrgCall(MSG_AUTH_ORG_LOGIN, payload);
  }

  async refreshSession(payload: { refreshToken: string }) {
    return this.authOrgCall(MSG_AUTH_ORG_REFRESH, payload);
  }

  async logoutSession(payload: { refreshToken: string }) {
    return this.authOrgCall(MSG_AUTH_ORG_LOGOUT, payload);
  }

  async logoutAllSessions(payload: { userId: string; tenantId: string }) {
    return this.authOrgCall(MSG_AUTH_ORG_LOGOUT_ALL, payload);
  }

  billingOpsSummary(payload: { hours?: number }): Promise<{
    windowHours: number;
    totals: number;
    processed: number;
    failed: number;
    pending: number;
    failureRate: number;
    byEventType: Array<{ eventType: string; count: number }>;
    recentFailures: Array<{
      stripeEventId: string;
      eventType: string;
      updatedAt: string;
      handlingError: string | null;
    }>;
  }> {
    return this.authOrgCall(MSG_AUTH_ORG_BILLING_OPS_SUMMARY, payload);
  }

  listCourses(payload: { tenantId: string }) {
    return this.courseCall(MSG_COURSE_LIST, payload);
  }

  getCourse(payload: { tenantId: string; courseId: string }) {
    return this.courseCall(MSG_COURSE_GET, payload);
  }

  createCourse(payload: {
    tenantId: string;
    title: string;
    subscriptionTier: SubscriptionTier;
  }) {
    return this.courseCall(MSG_COURSE_CREATE, payload);
  }

  updateCourse(payload: { tenantId: string; courseId: string; title: string }) {
    return this.courseCall(MSG_COURSE_UPDATE, payload);
  }

  deleteCourse(payload: { tenantId: string; courseId: string }) {
    return this.courseCall(MSG_COURSE_DELETE, payload);
  }

  listLessons(payload: { tenantId: string; courseId: string }) {
    return this.courseCall(MSG_COURSE_LESSONS_LIST, payload);
  }

  getLesson(payload: { tenantId: string; courseId: string; lessonId: string }) {
    return this.courseCall(MSG_COURSE_LESSON_GET, payload);
  }

  createLesson(payload: {
    tenantId: string;
    courseId: string;
    title: string;
    body?: string;
    sortOrder?: number;
  }) {
    return this.courseCall(MSG_COURSE_LESSON_CREATE, payload);
  }

  updateLesson(payload: {
    tenantId: string;
    courseId: string;
    lessonId: string;
    title?: string;
    body?: string;
    sortOrder?: number;
  }) {
    return this.courseCall(MSG_COURSE_LESSON_UPDATE, payload);
  }

  deleteLesson(payload: {
    tenantId: string;
    courseId: string;
    lessonId: string;
  }) {
    return this.courseCall(MSG_COURSE_LESSON_DELETE, payload);
  }

  createEnrollment(payload: {
    tenantId: string;
    courseId: string;
    userId: string;
  }) {
    return this.authOrgCall(MSG_AUTH_ORG_SEAT_ASSERT_AVAILABLE, {
      tenantId: payload.tenantId,
      reason: SEAT_ENFORCEMENT_REASONS[1],
    }).then(() => this.courseCall(MSG_COURSE_ENROLLMENT_CREATE, payload));
  }

  listEnrollmentsByCourse(payload: { tenantId: string; courseId: string }) {
    return this.courseCall(MSG_COURSE_ENROLLMENT_LIST_BY_COURSE, payload);
  }

  listEnrollmentsByUser(payload: { tenantId: string; userId: string }) {
    return this.courseCall(MSG_COURSE_ENROLLMENT_LIST_BY_USER, payload);
  }

  getEnrollment(payload: {
    tenantId: string;
    enrollmentId: string;
    actingUserId: string;
    actingRole: Role;
  }) {
    return this.courseCall(MSG_COURSE_ENROLLMENT_GET, payload);
  }

  updateEnrollment(payload: {
    tenantId: string;
    enrollmentId: string;
    actingUserId: string;
    actingRole: Role;
    progressPercent?: number;
    lessonsCompleted?: number;
    completed?: boolean;
    touchAccess?: boolean;
  }) {
    return this.courseCall<{
      id: string;
      tenantId: string;
      userId: string;
      courseId: string;
      progressPercent: number;
      lessonsCompleted: number;
      completedAt: string | Date | null;
    }>(MSG_COURSE_ENROLLMENT_GET, {
      tenantId: payload.tenantId,
      enrollmentId: payload.enrollmentId,
      actingUserId: payload.actingUserId,
      actingRole: payload.actingRole,
    }).then(async (before) => {
      const updated = await this.courseCall<{
        id: string;
        tenantId: string;
        userId: string;
        courseId: string;
        progressPercent: number;
        lessonsCompleted: number;
        completedAt: string | Date | null;
      }>(MSG_COURSE_ENROLLMENT_UPDATE, payload);
      try {
        await this.emitLearningEventsFromEnrollmentUpdate({
          before,
          after: updated,
          touchAccess: payload.touchAccess,
          actingUserId: payload.actingUserId,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to emit learning events for enrollment update: ${msg}`,
        );
      }
      return updated;
    });
  }

  deleteEnrollment(payload: { tenantId: string; enrollmentId: string }) {
    return this.courseCall(MSG_COURSE_ENROLLMENT_DELETE, payload);
  }

  upsertAnalyticsWebhookEndpoint(payload: {
    tenantId: string;
    url: string;
    secret: string;
    isActive?: boolean;
  }) {
    return this.analyticsCall(MSG_ANALYTICS_WEBHOOK_ENDPOINT_UPSERT, payload);
  }

  listAnalyticsEvents(payload: {
    tenantId: string;
    limit?: number;
    cursor?: string;
    eventType?: string;
  }) {
    return this.analyticsCall(MSG_ANALYTICS_EVENTS_LIST, payload);
  }

  completionReport(payload: { tenantId: string }) {
    return this.analyticsCall(MSG_ANALYTICS_REPORT_COMPLETIONS, payload);
  }

  engagementReport(payload: { tenantId: string; days?: number }) {
    return this.analyticsCall(MSG_ANALYTICS_REPORT_ENGAGEMENT, payload);
  }

  eventVolumeReport(payload: { tenantId: string; days?: number }) {
    return this.analyticsCall(MSG_ANALYTICS_REPORT_EVENT_VOLUME, payload);
  }

  listAnalyticsDlq(payload: {
    tenantId: string;
    limit?: number;
    cursor?: string;
    eventType?: string;
  }) {
    return this.analyticsCall(MSG_ANALYTICS_DLQ_LIST, payload);
  }

  requeueAnalyticsDlq(payload: { tenantId: string; deadLetterId: string }) {
    return this.analyticsCall(MSG_ANALYTICS_DLQ_REQUEUE, payload);
  }

  analyticsDlqSummary(payload: { hours?: number }): Promise<{
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
    return this.analyticsCall(MSG_ANALYTICS_DLQ_SUMMARY, payload);
  }
}

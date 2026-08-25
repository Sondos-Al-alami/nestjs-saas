import { Injectable } from '@nestjs/common';
import { AnalyticsGatewayService } from './analytics/analytics-gateway.service';
import { AuthGatewayService } from './auth/auth-gateway.service';
import { CourseGatewayService } from './courses/course-gateway.service';
import { GatewayMetricsService } from './core/gateway-metrics.service';

/**
 * Cross-cutting gateway ops only (hello, health, readiness, alerts).
 * Domain TCP proxies live in Auth / Course / Analytics gateway services.
 */
@Injectable()
export class ApiGatewayService {
  private readonly readinessTimeoutMs = parseInt(
    process.env.GATEWAY_READINESS_TIMEOUT_MS ?? '2500',
    10,
  );

  constructor(
    private readonly authGateway: AuthGatewayService,
    private readonly courseGateway: CourseGatewayService,
    private readonly analyticsGateway: AnalyticsGatewayService,
    private readonly metrics: GatewayMetricsService,
  ) {}

  getHello(): string {
    return 'API Gateway';
  }

  async downstreamHealth() {
    const [authOrg, course, analytics] = await Promise.all([
      this.authGateway.health(),
      this.courseGateway.health(),
      this.analyticsGateway.health(),
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
      this.probeWithTimeout('auth-org-service', this.authGateway.health()),
      this.probeWithTimeout('course-service', this.courseGateway.health()),
      this.probeWithTimeout(
        'analytics-webhook-service',
        this.analyticsGateway.health(),
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
        this.authGateway.billingOpsSummary({ hours }),
        this.analyticsGateway.dlqSummary({ hours }),
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
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHmac } from 'node:crypto';
import type { Prisma } from './generated/prisma';
import { PrismaService } from './prisma/prisma.service';

type LearningEventPayload = {
  tenantId: string;
  userId: string;
  courseId: string;
  enrollmentId: string;
  idempotencyKey: string;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class AnalyticsWebhookServiceService {
  private readonly logger = new Logger(AnalyticsWebhookServiceService.name);
  constructor(private readonly prisma: PrismaService) {}

  health() {
    return { service: 'analytics-webhook-service', ok: true as const };
  }

  private async appendEvent(eventType: string, payload: LearningEventPayload) {
    const occurredAt = payload.occurredAt
      ? new Date(payload.occurredAt)
      : new Date();
    const analyticsPayload: Prisma.InputJsonObject = {
      eventType,
      tenantId: payload.tenantId,
      userId: payload.userId,
      courseId: payload.courseId,
      enrollmentId: payload.enrollmentId,
      occurredAt: occurredAt.toISOString(),
      metadata: (payload.metadata ?? {}) as Prisma.InputJsonValue,
    };
    return this.prisma.eventBuffer.upsert({
      where: { idempotencyKey: payload.idempotencyKey },
      create: {
        tenantId: payload.tenantId,
        eventType,
        idempotencyKey: payload.idempotencyKey,
        payload: analyticsPayload,
      },
      update: {},
      select: { id: true, createdAt: true, idempotencyKey: true },
    });
  }

  trackLessonStarted(payload: LearningEventPayload) {
    return this.appendEvent('lesson.started', payload);
  }

  trackLessonCompleted(payload: LearningEventPayload) {
    return this.appendEvent('lesson.completed', payload);
  }

  trackCourseCompleted(payload: LearningEventPayload) {
    return this.appendEvent('course.completed', payload);
  }

  trackCertificationEarned(payload: LearningEventPayload) {
    return this.appendEvent('certification.earned', payload);
  }

  upsertWebhookEndpoint(payload: {
    tenantId: string;
    url: string;
    secret: string;
    isActive?: boolean;
  }) {
    const tenantId = payload.tenantId.trim();
    const url = payload.url.trim();
    const secret = payload.secret.trim();
    if (!tenantId || !url || !secret) {
      return {
        ok: false as const,
        message: 'tenantId, url, and secret are required',
      };
    }
    return this.prisma.webhookEndpoint.upsert({
      where: { tenantId },
      create: {
        tenantId,
        url,
        secret,
        isActive: payload.isActive ?? true,
      },
      update: {
        url,
        secret,
        isActive: payload.isActive ?? true,
      },
      select: { tenantId: true, url: true, isActive: true, updatedAt: true },
    });
  }

  async listEvents(payload: {
    tenantId: string;
    limit?: number;
    cursor?: string;
    eventType?: string;
  }) {
    const limit = Math.min(200, Math.max(1, payload.limit ?? 50));
    const where: Record<string, unknown> = { tenantId: payload.tenantId };
    if (payload.eventType?.trim()) {
      where.eventType = payload.eventType.trim();
    }
    const items = await this.prisma.eventBuffer.findMany({
      where,
      take: limit + 1,
      ...(payload.cursor ? { cursor: { id: payload.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        tenantId: true,
        eventType: true,
        idempotencyKey: true,
        deliveryStatus: true,
        deliveryAttempts: true,
        deliveredAt: true,
        lastError: true,
        payload: true,
      },
    });
    const nextCursor = items.length > limit ? (items[limit]?.id ?? null) : null;
    return { items: items.slice(0, limit), nextCursor };
  }

  async completionReport(payload: { tenantId: string }) {
    const events = await this.prisma.eventBuffer.findMany({
      where: { tenantId: payload.tenantId, eventType: 'course.completed' },
      select: { payload: true },
      take: 5000,
      orderBy: { createdAt: 'desc' },
    });
    const counts = new Map<string, number>();
    for (const e of events) {
      const p = e.payload as unknown as { courseId?: string };
      if (!p?.courseId) {
        continue;
      }
      counts.set(p.courseId, (counts.get(p.courseId) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([courseId, completions]) => ({
      courseId,
      completions,
    }));
  }

  async engagementReport(payload: { tenantId: string; days?: number }) {
    const days = Math.min(365, Math.max(1, payload.days ?? 30));
    const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const events = await this.prisma.eventBuffer.findMany({
      where: {
        tenantId: payload.tenantId,
        createdAt: { gte: threshold },
        eventType: {
          in: ['lesson.started', 'lesson.completed', 'course.completed'],
        },
      },
      select: { eventType: true, payload: true },
      take: 20_000,
      orderBy: { createdAt: 'desc' },
    });
    const activeLearners = new Set<string>();
    const perCourse = new Map<string, { started: number; completed: number }>();
    for (const e of events) {
      const p = e.payload as unknown as { userId?: string; courseId?: string };
      if (p.userId) {
        activeLearners.add(p.userId);
      }
      if (!p.courseId) {
        continue;
      }
      const row = perCourse.get(p.courseId) ?? { started: 0, completed: 0 };
      if (e.eventType === 'lesson.started') {
        row.started += 1;
      }
      if (e.eventType === 'course.completed') {
        row.completed += 1;
      }
      perCourse.set(p.courseId, row);
    }
    return {
      windowDays: days,
      activeLearners: activeLearners.size,
      perCourse: Array.from(perCourse.entries()).map(([courseId, row]) => ({
        courseId,
        started: row.started,
        completed: row.completed,
        completionRate:
          row.started > 0
            ? Number((row.completed / row.started).toFixed(4))
            : 0,
      })),
    };
  }

  async eventVolumeReport(payload: { tenantId: string; days?: number }) {
    const days = Math.min(365, Math.max(1, payload.days ?? 14));
    const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const events = await this.prisma.eventBuffer.findMany({
      where: { tenantId: payload.tenantId, createdAt: { gte: threshold } },
      select: { eventType: true, createdAt: true },
      take: 50_000,
      orderBy: { createdAt: 'asc' },
    });
    const byDay = new Map<string, Record<string, number>>();
    for (const e of events) {
      const day = e.createdAt.toISOString().slice(0, 10);
      const row = byDay.get(day) ?? {};
      row[e.eventType] = (row[e.eventType] ?? 0) + 1;
      byDay.set(day, row);
    }
    return {
      windowDays: days,
      series: Array.from(byDay.entries()).map(([day, counts]) => ({
        day,
        counts,
      })),
    };
  }

  async listDeadLetters(payload: {
    tenantId: string;
    limit?: number;
    cursor?: string;
    eventType?: string;
  }) {
    const limit = Math.min(200, Math.max(1, payload.limit ?? 50));
    const items = await this.prisma.deadLetterEvent.findMany({
      where: {
        tenantId: payload.tenantId,
        ...(payload.eventType?.trim()
          ? { eventType: payload.eventType.trim() }
          : {}),
      },
      take: limit + 1,
      ...(payload.cursor ? { cursor: { id: payload.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });
    const nextCursor = items.length > limit ? (items[limit]?.id ?? null) : null;
    return { items: items.slice(0, limit), nextCursor };
  }

  async requeueDeadLetter(payload: { tenantId: string; deadLetterId: string }) {
    const row = await this.prisma.deadLetterEvent.findFirst({
      where: { id: payload.deadLetterId, tenantId: payload.tenantId },
      select: { id: true, eventBufferId: true },
    });
    if (!row) {
      return { ok: false as const, message: 'Dead letter not found' };
    }
    await this.prisma.$transaction([
      this.prisma.eventBuffer.update({
        where: { id: row.eventBufferId },
        data: {
          deliveryStatus: 'PENDING',
          nextAttemptAt: new Date(),
          lastError: null,
        },
      }),
      this.prisma.deadLetterEvent.update({
        where: { id: row.id },
        data: { requeuedAt: new Date() },
      }),
    ]);
    return { ok: true as const };
  }

  async dlqSummary(payload: { hours?: number }) {
    const hours = Math.min(24 * 30, Math.max(1, payload.hours ?? 24));
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const [totals, requeued, oldestOpen] = await Promise.all([
      this.prisma.deadLetterEvent.count({
        where: { createdAt: { gte: since } },
      }),
      this.prisma.deadLetterEvent.count({
        where: { createdAt: { gte: since }, requeuedAt: { not: null } },
      }),
      this.prisma.deadLetterEvent.findFirst({
        where: { requeuedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true, eventType: true, tenantId: true },
      }),
    ]);
    const open = totals - requeued;
    const oldestOpenAgeMinutes = oldestOpen
      ? Math.max(
          0,
          Math.round((Date.now() - oldestOpen.createdAt.getTime()) / 60000),
        )
      : 0;
    return {
      windowHours: hours,
      totals,
      requeued,
      open,
      oldestOpenAgeMinutes,
      oldestOpen:
        oldestOpen == null
          ? null
          : {
              createdAt: oldestOpen.createdAt.toISOString(),
              eventType: oldestOpen.eventType,
              tenantId: oldestOpen.tenantId,
            },
    };
  }

  private backoffMs(attempt: number): number {
    const base = 30_000; // 30s
    const max = 60 * 60 * 1000; // 1h
    const pow = Math.min(10, Math.max(0, attempt));
    const exp = Math.min(max, base * Math.pow(2, pow));
    // +/- 20% jitter to avoid synchronized retries (thundering herd).
    const jitter = 0.8 + Math.random() * 0.4;
    return Math.round(exp * jitter);
  }

  private circuitFailureThreshold(): number {
    const raw = parseInt(
      process.env.ANALYTICS_WEBHOOK_CIRCUIT_FAILURE_THRESHOLD ?? '5',
      10,
    );
    if (!Number.isFinite(raw)) {
      return 5;
    }
    return Math.max(1, raw);
  }

  private circuitOpenMs(): number {
    const raw = parseInt(
      process.env.ANALYTICS_WEBHOOK_CIRCUIT_OPEN_MS ?? '180000',
      10,
    );
    if (!Number.isFinite(raw)) {
      return 180_000;
    }
    return Math.max(10_000, raw);
  }

  private signPayload(secret: string, raw: string): string {
    return createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async deliverPendingWebhooks(): Promise<void> {
    const now = new Date();
    const batch = await this.prisma.eventBuffer.findMany({
      where: {
        deliveryStatus: 'PENDING',
        nextAttemptAt: { lte: now },
      },
      take: 50,
      orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        tenantId: true,
        eventType: true,
        idempotencyKey: true,
        payload: true,
        deliveryAttempts: true,
      },
    });
    if (batch.length === 0) {
      return;
    }

    for (const evt of batch) {
      const endpoint = await this.prisma.webhookEndpoint.findUnique({
        where: { tenantId: evt.tenantId },
        select: {
          id: true,
          url: true,
          secret: true,
          isActive: true,
          consecutiveFailures: true,
          circuitOpenUntil: true,
        },
      });
      if (!endpoint || !endpoint.isActive) {
        await this.prisma.eventBuffer.update({
          where: { id: evt.id },
          data: {
            deliveryStatus: 'SKIPPED',
            lastAttemptAt: new Date(),
            lastError: 'No active webhook endpoint configured for tenant',
          },
        });
        continue;
      }

      const nowTs = Date.now();
      if (
        endpoint.circuitOpenUntil &&
        endpoint.circuitOpenUntil.getTime() > nowTs
      ) {
        await this.prisma.eventBuffer.update({
          where: { id: evt.id },
          data: {
            nextAttemptAt: new Date(
              endpoint.circuitOpenUntil.getTime() + this.backoffMs(0),
            ),
            lastAttemptAt: new Date(),
            lastError: `Circuit open until ${endpoint.circuitOpenUntil.toISOString()}`,
          },
        });
        continue;
      }

      const bodyObj = {
        id: evt.id,
        tenantId: evt.tenantId,
        eventType: evt.eventType,
        idempotencyKey: evt.idempotencyKey,
        payload: evt.payload,
      };
      const raw = JSON.stringify(bodyObj);
      const signature = this.signPayload(endpoint.secret, raw);

      const attempt = evt.deliveryAttempts + 1;
      try {
        const res = await fetch(endpoint.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-webhook-event-id': evt.id,
            'x-webhook-idempotency-key': evt.idempotencyKey,
            'x-webhook-signature': signature,
          },
          body: raw,
        });

        if (res.ok) {
          await this.prisma.$transaction([
            this.prisma.eventBuffer.update({
              where: { id: evt.id },
              data: {
                deliveryStatus: 'DELIVERED',
                deliveredAt: new Date(),
                lastAttemptAt: new Date(),
                deliveryAttempts: attempt,
                lastError: null,
              },
            }),
            this.prisma.webhookEndpoint.update({
              where: { id: endpoint.id },
              data: {
                consecutiveFailures: 0,
                circuitOpenUntil: null,
                lastSuccessAt: new Date(),
              },
            }),
          ]);
          continue;
        }

        const text = await res.text().catch(() => '');
        const msg = `HTTP ${res.status} ${res.statusText}${text ? `: ${text.slice(0, 300)}` : ''}`;
        const next = new Date(Date.now() + this.backoffMs(attempt));
        const nextConsecutiveFailures = endpoint.consecutiveFailures + 1;
        const openCircuit =
          nextConsecutiveFailures >= this.circuitFailureThreshold();
        const circuitOpenUntil = openCircuit
          ? new Date(Date.now() + this.circuitOpenMs())
          : null;
        if (attempt >= 10) {
          await this.prisma.$transaction([
            this.prisma.eventBuffer.update({
              where: { id: evt.id },
              data: {
                deliveryAttempts: attempt,
                lastAttemptAt: new Date(),
                nextAttemptAt: next,
                lastError: msg,
                deliveryStatus: 'FAILED',
              },
            }),
            this.prisma.deadLetterEvent.upsert({
              where: { eventBufferId: evt.id },
              create: {
                tenantId: evt.tenantId,
                eventBufferId: evt.id,
                eventType: evt.eventType,
                idempotencyKey: evt.idempotencyKey,
                payload: evt.payload as Prisma.InputJsonValue,
                failureReason: msg,
              },
              update: {
                failureReason: msg,
                failedAt: new Date(),
              },
            }),
            this.prisma.webhookEndpoint.update({
              where: { id: endpoint.id },
              data: {
                consecutiveFailures: nextConsecutiveFailures,
                lastFailureAt: new Date(),
                ...(openCircuit && circuitOpenUntil
                  ? { circuitOpenUntil }
                  : {}),
              },
            }),
          ]);
        } else {
          await this.prisma.$transaction([
            this.prisma.eventBuffer.update({
              where: { id: evt.id },
              data: {
                deliveryAttempts: attempt,
                lastAttemptAt: new Date(),
                nextAttemptAt: next,
                lastError: msg,
                deliveryStatus: 'PENDING',
              },
            }),
            this.prisma.webhookEndpoint.update({
              where: { id: endpoint.id },
              data: {
                consecutiveFailures: nextConsecutiveFailures,
                lastFailureAt: new Date(),
                ...(openCircuit && circuitOpenUntil
                  ? { circuitOpenUntil }
                  : {}),
              },
            }),
          ]);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Webhook delivery failed for event ${evt.id}: ${msg}`);
        const next = new Date(Date.now() + this.backoffMs(attempt));
        const nextConsecutiveFailures = endpoint.consecutiveFailures + 1;
        const openCircuit =
          nextConsecutiveFailures >= this.circuitFailureThreshold();
        const circuitOpenUntil = openCircuit
          ? new Date(Date.now() + this.circuitOpenMs())
          : null;
        if (attempt >= 10) {
          await this.prisma.$transaction([
            this.prisma.eventBuffer.update({
              where: { id: evt.id },
              data: {
                deliveryAttempts: attempt,
                lastAttemptAt: new Date(),
                nextAttemptAt: next,
                lastError: msg,
                deliveryStatus: 'FAILED',
              },
            }),
            this.prisma.deadLetterEvent.upsert({
              where: { eventBufferId: evt.id },
              create: {
                tenantId: evt.tenantId,
                eventBufferId: evt.id,
                eventType: evt.eventType,
                idempotencyKey: evt.idempotencyKey,
                payload: evt.payload as Prisma.InputJsonValue,
                failureReason: msg,
              },
              update: {
                failureReason: msg,
                failedAt: new Date(),
              },
            }),
            this.prisma.webhookEndpoint.update({
              where: { id: endpoint.id },
              data: {
                consecutiveFailures: nextConsecutiveFailures,
                lastFailureAt: new Date(),
                ...(openCircuit && circuitOpenUntil
                  ? { circuitOpenUntil }
                  : {}),
              },
            }),
          ]);
        } else {
          await this.prisma.$transaction([
            this.prisma.eventBuffer.update({
              where: { id: evt.id },
              data: {
                deliveryAttempts: attempt,
                lastAttemptAt: new Date(),
                nextAttemptAt: next,
                lastError: msg,
                deliveryStatus: 'PENDING',
              },
            }),
            this.prisma.webhookEndpoint.update({
              where: { id: endpoint.id },
              data: {
                consecutiveFailures: nextConsecutiveFailures,
                lastFailureAt: new Date(),
                ...(openCircuit && circuitOpenUntil
                  ? { circuitOpenUntil }
                  : {}),
              },
            }),
          ]);
        }
      }
    }
  }
}

import { Injectable } from '@nestjs/common';

@Injectable()
export class GatewayMetricsService {
  private startedAt = new Date();
  private totalRequests = 0;
  private totalErrors5xx = 0;
  private totalDurationMs = 0;
  private readonly statusCounts = new Map<number, number>();

  recordRequest(statusCode: number, durationMs: number): void {
    this.totalRequests += 1;
    this.totalDurationMs += Math.max(0, durationMs);
    this.statusCounts.set(
      statusCode,
      (this.statusCounts.get(statusCode) ?? 0) + 1,
    );
    if (statusCode >= 500) {
      this.totalErrors5xx += 1;
    }
  }

  record5xxError(): void {
    this.totalErrors5xx += 1;
  }

  snapshot() {
    const uptimeMs = Date.now() - this.startedAt.getTime();
    const avgLatencyMs =
      this.totalRequests === 0
        ? 0
        : Number((this.totalDurationMs / this.totalRequests).toFixed(2));
    return {
      startedAt: this.startedAt.toISOString(),
      uptimeMs,
      totalRequests: this.totalRequests,
      totalErrors5xx: this.totalErrors5xx,
      errorRate5xx:
        this.totalRequests === 0
          ? 0
          : Number((this.totalErrors5xx / this.totalRequests).toFixed(4)),
      avgLatencyMs,
      statusCounts: Array.from(this.statusCounts.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([statusCode, count]) => ({ statusCode, count })),
    };
  }
}

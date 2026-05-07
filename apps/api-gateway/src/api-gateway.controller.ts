import {
  Controller,
  Get,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GetTenant } from '@saas/common';
import { Public } from './auth';
import { ApiGatewayService } from './api-gateway.service';
import { GatewayMetricsService } from './core/gateway-metrics.service';

@Controller()
export class ApiGatewayController {
  constructor(
    private readonly apiGatewayService: ApiGatewayService,
    private readonly metrics: GatewayMetricsService,
  ) {}

  @Public()
  @Get()
  getHello(): string {
    return this.apiGatewayService.getHello();
  }

  @Public()
  @Get('internal/downstream-health')
  downstreamHealth() {
    return this.apiGatewayService.downstreamHealth();
  }

  @Public()
  @Get('internal/ops/metrics')
  metricsSummary() {
    return this.metrics.snapshot();
  }

  @Public()
  @Get('internal/ops/health')
  health() {
    return {
      ok: true,
      service: 'api-gateway',
      checkedAt: new Date().toISOString(),
    };
  }

  @Public()
  @Get('internal/ops/readiness')
  async readiness() {
    const result = await this.apiGatewayService.readiness();
    if (!result.ok) {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }

  @Public()
  @Get('internal/ops/alerts')
  async alerts(@Query('hours') hoursRaw?: string) {
    return this.apiGatewayService.alerts(hoursRaw);
  }

  @Get('tenant/echo')
  tenantEcho(@GetTenant() tenantId: string) {
    return { tenantId };
  }
}

import {
  Controller,
  Get,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { GetTenant } from '@saas/common';
import { Public } from './auth';
import { ApiGatewayService } from './api-gateway.service';
import { GatewayMetricsService } from './core/gateway-metrics.service';

@ApiTags('ops')
@Controller()
export class ApiGatewayController {
  constructor(
    private readonly apiGatewayService: ApiGatewayService,
    private readonly metrics: GatewayMetricsService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Gateway hello' })
  getHello(): string {
    return this.apiGatewayService.getHello();
  }

  @Public()
  @Get('internal/downstream-health')
  @ApiOperation({ summary: 'Downstream TCP service health' })
  downstreamHealth() {
    return this.apiGatewayService.downstreamHealth();
  }

  @Public()
  @Get('internal/ops/metrics')
  @ApiOperation({ summary: 'Gateway request metrics snapshot' })
  metricsSummary() {
    return this.metrics.snapshot();
  }

  @Public()
  @Get('internal/ops/health')
  @ApiOperation({ summary: 'Liveness' })
  health() {
    return {
      ok: true,
      service: 'api-gateway',
      checkedAt: new Date().toISOString(),
    };
  }

  @Public()
  @Get('internal/ops/readiness')
  @ApiOperation({ summary: 'Readiness (downstream probes)' })
  async readiness() {
    const result = await this.apiGatewayService.readiness();
    if (!result.ok) {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }

  @Public()
  @Get('internal/ops/alerts')
  @ApiOperation({ summary: 'Aggregated alert evaluation' })
  async alerts(@Query('hours') hoursRaw?: string) {
    return this.apiGatewayService.alerts(hoursRaw);
  }

  @Get('tenant/echo')
  @ApiBearerAuth('access-token')
  @ApiSecurity('tenant-id')
  @ApiOperation({ summary: 'Echo resolved tenant id' })
  tenantEcho(@GetTenant() tenantId: string) {
    return { tenantId };
  }
}

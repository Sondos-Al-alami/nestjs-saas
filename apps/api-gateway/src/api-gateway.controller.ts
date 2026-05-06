import { Controller, Get } from '@nestjs/common';
import { GetTenant } from '@saas/common';
import { Public } from './auth';
import { ApiGatewayService } from './api-gateway.service';

@Controller()
export class ApiGatewayController {
  constructor(private readonly apiGatewayService: ApiGatewayService) {}

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

  @Get('tenant/echo')
  tenantEcho(@GetTenant() tenantId: string) {
    return { tenantId };
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  ParseIntPipe,
  Post,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { GetTenant, Role } from '@saas/common';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  Length,
} from 'class-validator';
import { Roles } from '../auth';
import { ApiGatewayService } from '../api-gateway.service';

class UpsertWebhookEndpointDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsUrl({ require_tld: false })
  url!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(16, 200)
  secret!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@Controller('analytics')
export class AnalyticsGatewayController {
  constructor(private readonly apiGatewayService: ApiGatewayService) {}

  @Get('events')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
  listEvents(
    @GetTenant() tenantId: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('cursor') cursor?: string,
    @Query('eventType') eventType?: string,
  ) {
    return this.apiGatewayService.listAnalyticsEvents({
      tenantId,
      limit,
      cursor,
      eventType,
    });
  }

  @Get('reports/completions')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
  completionReport(@GetTenant() tenantId: string) {
    return this.apiGatewayService.completionReport({ tenantId });
  }

  @Get('reports/engagement')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
  engagementReport(
    @GetTenant() tenantId: string,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ) {
    return this.apiGatewayService.engagementReport({ tenantId, days });
  }

  @Get('reports/event-volume')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
  eventVolumeReport(
    @GetTenant() tenantId: string,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ) {
    return this.apiGatewayService.eventVolumeReport({ tenantId, days });
  }

  @Get('dlq')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
  listDeadLetters(
    @GetTenant() tenantId: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('cursor') cursor?: string,
    @Query('eventType') eventType?: string,
  ) {
    return this.apiGatewayService.listAnalyticsDlq({
      tenantId,
      limit,
      cursor,
      eventType,
    });
  }

  @Post('dlq/:deadLetterId/requeue')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
  requeueDeadLetter(
    @GetTenant() tenantId: string,
    @Param('deadLetterId', new ParseUUIDPipe()) deadLetterId: string,
  ) {
    return this.apiGatewayService.requeueAnalyticsDlq({
      tenantId,
      deadLetterId,
    });
  }

  @Post('webhook-endpoint')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
  upsertWebhookEndpoint(
    @GetTenant() tenantId: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    body: UpsertWebhookEndpointDto,
  ) {
    return this.apiGatewayService.upsertAnalyticsWebhookEndpoint({
      tenantId,
      url: body.url,
      secret: body.secret,
      isActive: body.isActive,
    });
  }
}

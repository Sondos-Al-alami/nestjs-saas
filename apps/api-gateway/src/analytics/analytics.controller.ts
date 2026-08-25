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
import {
  ApiBearerAuth,
  ApiProperty,
  ApiPropertyOptional,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { GetTenant, Role } from '@saas/common';
import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  Length,
} from 'class-validator';
import { Roles } from '../auth';
import { AnalyticsGatewayService } from './analytics-gateway.service';

class UpsertWebhookEndpointDto {
  @ApiProperty({ example: 'https://example.com/hooks/lms' })
  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  )
  @IsUrl({ require_tld: false })
  url!: string;

  @ApiProperty({ minLength: 16, maxLength: 200 })
  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  )
  @IsString()
  @Length(16, 200)
  secret!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@ApiTags('analytics')
@ApiBearerAuth('access-token')
@ApiSecurity('tenant-id')
@Controller('analytics')
export class AnalyticsGatewayController {
  constructor(private readonly analyticsGateway: AnalyticsGatewayService) {}

  @Get('events')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
  listEvents(
    @GetTenant() tenantId: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('cursor') cursor?: string,
    @Query('eventType') eventType?: string,
  ) {
    return this.analyticsGateway.listEvents({
      tenantId,
      limit,
      cursor,
      eventType,
    });
  }

  @Get('reports/completions')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
  completionReport(@GetTenant() tenantId: string) {
    return this.analyticsGateway.completionReport({ tenantId });
  }

  @Get('reports/engagement')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
  engagementReport(
    @GetTenant() tenantId: string,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ) {
    return this.analyticsGateway.engagementReport({ tenantId, days });
  }

  @Get('reports/event-volume')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
  eventVolumeReport(
    @GetTenant() tenantId: string,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ) {
    return this.analyticsGateway.eventVolumeReport({ tenantId, days });
  }

  @Get('dlq')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
  listDeadLetters(
    @GetTenant() tenantId: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('cursor') cursor?: string,
    @Query('eventType') eventType?: string,
  ) {
    return this.analyticsGateway.listDlq({
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
    return this.analyticsGateway.requeueDlq({
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
    return this.analyticsGateway.upsertWebhookEndpoint({
      tenantId,
      url: body.url,
      secret: body.secret,
      isActive: body.isActive,
    });
  }
}

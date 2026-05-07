import {
  Body,
  Controller,
  Get,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { GetTenant, Role } from '@saas/common';
import type { Request } from 'express';
import { ApiGatewayService } from '../api-gateway.service';
import { AuthenticatedUser, Public, Roles } from './index';
import {
  AcceptInviteDto,
  CreateInviteDto,
  LoginDto,
  RefreshTokenDto,
  RegisterTenantDto,
} from './dto';

@Controller()
export class AuthGatewayController {
  constructor(private readonly apiGatewayService: ApiGatewayService) {}

  private userFrom(req: Request): AuthenticatedUser | undefined {
    return req.user as AuthenticatedUser | undefined;
  }

  @Public()
  @Post('auth/register')
  registerTenant(@Body() payload: RegisterTenantDto) {
    return this.apiGatewayService.registerTenant(payload);
  }

  @Public()
  @Post('auth/login')
  login(@Body() payload: LoginDto) {
    return this.apiGatewayService.login(payload);
  }

  @Public()
  @Post('auth/refresh')
  refresh(@Body() payload: RefreshTokenDto) {
    return this.apiGatewayService.refreshSession(payload);
  }

  @Public()
  @Post('auth/logout')
  logout(@Body() payload: RefreshTokenDto) {
    return this.apiGatewayService.logoutSession(payload);
  }

  @Post('auth/logout-all')
  logoutAll(@GetTenant() tenantId: string, @Req() req: Request) {
    const user = this.userFrom(req);
    return this.apiGatewayService.logoutAllSessions({
      tenantId,
      userId: user?.userId ?? '',
    });
  }

  @Public()
  @Post('auth/invites/accept')
  acceptInvite(@Body() payload: AcceptInviteDto) {
    return this.apiGatewayService.acceptInvite(payload);
  }

  @Post('org/invites')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
  createInvite(
    @GetTenant() tenantId: string,
    @Req() req: Request,
    @Body() payload: CreateInviteDto,
  ) {
    const user = this.userFrom(req);
    return this.apiGatewayService.createInvite({
      tenantId,
      invitedByUserId: user?.userId ?? '',
      email: payload.email,
      role: payload.role ?? Role.LEARNER,
      expiresInDays: payload.expiresInDays,
    });
  }

  @Get('tenant/auth-echo')
  tenantAuthEcho(@GetTenant() tenantId: string, @Req() req: Request) {
    const user = this.userFrom(req);
    return this.apiGatewayService.tenantAuthEcho({
      tenantId,
      userId: user?.userId ?? '',
      role: user?.role ?? '',
    });
  }

  @Get('billing/ops/summary')
  @Roles(Role.SUPER_ADMIN)
  billingOpsSummary(
    @Query('hours', new ParseIntPipe({ optional: true })) hours?: number,
  ) {
    return this.apiGatewayService.billingOpsSummary({ hours });
  }
}

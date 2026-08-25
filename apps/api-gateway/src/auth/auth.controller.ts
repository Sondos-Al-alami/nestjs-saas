import {
  Body,
  Controller,
  Get,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { GetTenant, Role } from '@saas/common';
import type { Request } from 'express';
import { AuthenticatedUser, Public, Roles } from './index';
import { AuthGatewayService } from './auth-gateway.service';
import {
  AcceptInviteDto,
  CreateInviteDto,
  LoginDto,
  RefreshTokenDto,
  RegisterTenantDto,
} from './dto';

@ApiTags('auth')
@Controller()
export class AuthGatewayController {
  constructor(private readonly authGateway: AuthGatewayService) {}

  private userFrom(req: Request): AuthenticatedUser | undefined {
    return req.user as AuthenticatedUser | undefined;
  }

  @Public()
  @Post('auth/register')
  @ApiOperation({ summary: 'Register tenant + org admin' })
  registerTenant(@Body() payload: RegisterTenantDto) {
    return this.authGateway.registerTenant(payload);
  }

  @Public()
  @Post('auth/login')
  @ApiOperation({ summary: 'Login' })
  login(@Body() payload: LoginDto) {
    return this.authGateway.login(payload);
  }

  @Public()
  @Post('auth/refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  refresh(@Body() payload: RefreshTokenDto) {
    return this.authGateway.refreshSession(payload);
  }

  @Public()
  @Post('auth/logout')
  @ApiOperation({ summary: 'Logout (invalidate refresh token)' })
  logout(@Body() payload: RefreshTokenDto) {
    return this.authGateway.logoutSession(payload);
  }

  @Post('auth/logout-all')
  @ApiBearerAuth('access-token')
  @ApiSecurity('tenant-id')
  @ApiOperation({ summary: 'Logout all sessions for current user' })
  logoutAll(@GetTenant() tenantId: string, @Req() req: Request) {
    const user = this.userFrom(req);
    return this.authGateway.logoutAllSessions({
      tenantId,
      userId: user?.userId ?? '',
    });
  }

  @Public()
  @Post('auth/invites/accept')
  @ApiOperation({ summary: 'Accept org invite' })
  acceptInvite(@Body() payload: AcceptInviteDto) {
    return this.authGateway.acceptInvite(payload);
  }

  @Post('org/invites')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
  @ApiBearerAuth('access-token')
  @ApiSecurity('tenant-id')
  @ApiOperation({ summary: 'Create org invite' })
  createInvite(
    @GetTenant() tenantId: string,
    @Req() req: Request,
    @Body() payload: CreateInviteDto,
  ) {
    const user = this.userFrom(req);
    return this.authGateway.createInvite({
      tenantId,
      invitedByUserId: user?.userId ?? '',
      email: payload.email,
      role: payload.role ?? Role.LEARNER,
      expiresInDays: payload.expiresInDays,
    });
  }

  @Get('tenant/auth-echo')
  @ApiBearerAuth('access-token')
  @ApiSecurity('tenant-id')
  @ApiOperation({ summary: 'Echo auth + tenant context via auth-org' })
  tenantAuthEcho(@GetTenant() tenantId: string, @Req() req: Request) {
    const user = this.userFrom(req);
    return this.authGateway.tenantAuthEcho({
      tenantId,
      userId: user?.userId ?? '',
      role: user?.role ?? '',
    });
  }

  @Get('billing/ops/summary')
  @Roles(Role.SUPER_ADMIN)
  @ApiBearerAuth('access-token')
  @ApiSecurity('tenant-id')
  @ApiOperation({ summary: 'Billing webhook ops summary (SUPER_ADMIN)' })
  billingOpsSummary(
    @Query('hours', new ParseIntPipe({ optional: true })) hours?: number,
  ) {
    return this.authGateway.billingOpsSummary({ hours });
  }
}

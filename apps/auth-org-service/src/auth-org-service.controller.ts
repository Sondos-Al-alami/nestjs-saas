import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import {
  MSG_AUTH_ORG_ACCEPT_INVITE,
  MSG_AUTH_ORG_CREATE_INVITE,
  MSG_AUTH_ORG_HEALTH,
  MSG_AUTH_ORG_LOGIN,
  MSG_AUTH_ORG_LOGOUT,
  MSG_AUTH_ORG_LOGOUT_ALL,
  MSG_AUTH_ORG_REFRESH,
  MSG_AUTH_ORG_REGISTER_TENANT,
  MSG_AUTH_ORG_SEAT_ASSERT_AVAILABLE,
  MSG_AUTH_ORG_TENANT_ECHO,
} from '@saas/common';
import { AuthOrgServiceService } from './auth-org-service.service';
import { Role } from './generated/prisma';

@Controller()
export class AuthOrgServiceController {
  constructor(private readonly authOrgServiceService: AuthOrgServiceService) {}

  @MessagePattern(MSG_AUTH_ORG_HEALTH)
  health() {
    return this.authOrgServiceService.health();
  }

  @MessagePattern(MSG_AUTH_ORG_TENANT_ECHO)
  tenantEcho(payload: { tenantId: string; userId: string; role: string }) {
    // Echo endpoint used by gateway integration checks during foundation phase.
    return this.authOrgServiceService.tenantEcho(payload);
  }

  @MessagePattern(MSG_AUTH_ORG_REGISTER_TENANT)
  registerTenant(payload: {
    tenantName: string;
    adminEmail: string;
    adminDisplayName?: string;
    adminPassword: string;
    allowedDomains?: string[];
  }) {
    return this.authOrgServiceService.registerTenant(payload);
  }

  @MessagePattern(MSG_AUTH_ORG_CREATE_INVITE)
  createInvite(payload: {
    tenantId: string;
    invitedByUserId: string;
    email: string;
    role: Role;
    expiresInDays?: number;
  }) {
    return this.authOrgServiceService.createInvite(payload);
  }

  @MessagePattern(MSG_AUTH_ORG_ACCEPT_INVITE)
  acceptInvite(payload: { token: string; displayName?: string; password: string }) {
    return this.authOrgServiceService.acceptInvite(payload);
  }

  @MessagePattern(MSG_AUTH_ORG_LOGIN)
  login(payload: {
    tenantId: string;
    email: string;
    password: string;
  }) {
    return this.authOrgServiceService.login(payload);
  }

  @MessagePattern(MSG_AUTH_ORG_REFRESH)
  refresh(payload: { refreshToken: string }) {
    return this.authOrgServiceService.refreshSession(payload);
  }

  @MessagePattern(MSG_AUTH_ORG_LOGOUT)
  logout(payload: { refreshToken: string }) {
    return this.authOrgServiceService.logoutSession(payload);
  }

  @MessagePattern(MSG_AUTH_ORG_LOGOUT_ALL)
  logoutAll(payload: { userId: string; tenantId: string }) {
    return this.authOrgServiceService.logoutAllSessions(payload);
  }

  @MessagePattern(MSG_AUTH_ORG_SEAT_ASSERT_AVAILABLE)
  assertSeatAvailable(payload: { tenantId: string; reason?: string }) {
    return this.authOrgServiceService.assertSeatAvailable(payload);
  }
}

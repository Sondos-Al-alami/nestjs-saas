import { Controller, HttpException, HttpStatus } from '@nestjs/common';
import { MessagePattern, RpcException } from '@nestjs/microservices';
import {
  MSG_AUTH_ORG_ACCEPT_INVITE,
  MSG_AUTH_ORG_BILLING_OPS_SUMMARY,
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

function mapToRpcException(error: unknown): never {
  if (error instanceof HttpException) {
    const statusCode = error.getStatus();
    const response = error.getResponse();
    let message: string;
    if (typeof response === 'string') {
      message = response;
    } else if (
      typeof response === 'object' &&
      response !== null &&
      'message' in response
    ) {
      const value = (response as { message?: string | string[] }).message;
      message = Array.isArray(value)
        ? value.join(', ')
        : String(value ?? error.message);
    } else {
      message = error.message;
    }
    throw new RpcException({ statusCode, message });
  }
  const fallback =
    error instanceof Error
      ? error.message
      : 'Unhandled downstream service error';
  throw new RpcException({
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    message: fallback,
  });
}

@Controller()
export class AuthOrgServiceController {
  constructor(private readonly authOrgServiceService: AuthOrgServiceService) {}

  private async runSafely<T>(op: () => Promise<T> | T): Promise<T> {
    try {
      return await op();
    } catch (error) {
      mapToRpcException(error);
    }
  }

  @MessagePattern(MSG_AUTH_ORG_HEALTH)
  health() {
    return this.runSafely(() => this.authOrgServiceService.health());
  }

  @MessagePattern(MSG_AUTH_ORG_TENANT_ECHO)
  tenantEcho(payload: { tenantId: string; userId: string; role: string }) {
    // Echo endpoint used by gateway integration checks during foundation phase.
    return this.runSafely(() => this.authOrgServiceService.tenantEcho(payload));
  }

  @MessagePattern(MSG_AUTH_ORG_REGISTER_TENANT)
  registerTenant(payload: {
    tenantName: string;
    adminEmail: string;
    adminDisplayName?: string;
    adminPassword: string;
    allowedDomains?: string[];
  }) {
    return this.runSafely(() =>
      this.authOrgServiceService.registerTenant(payload),
    );
  }

  @MessagePattern(MSG_AUTH_ORG_CREATE_INVITE)
  async createInvite(payload: {
    tenantId: string;
    invitedByUserId: string;
    email: string;
    role: Role;
    expiresInDays?: number;
  }) {
    return this.runSafely(() =>
      this.authOrgServiceService.createInvite(payload),
    );
  }

  @MessagePattern(MSG_AUTH_ORG_ACCEPT_INVITE)
  async acceptInvite(payload: {
    token: string;
    displayName?: string;
    password: string;
  }) {
    return this.runSafely(() =>
      this.authOrgServiceService.acceptInvite(payload),
    );
  }

  @MessagePattern(MSG_AUTH_ORG_LOGIN)
  login(payload: { tenantId: string; email: string; password: string }) {
    return this.runSafely(() => this.authOrgServiceService.login(payload));
  }

  @MessagePattern(MSG_AUTH_ORG_REFRESH)
  refresh(payload: { refreshToken: string }) {
    return this.runSafely(() =>
      this.authOrgServiceService.refreshSession(payload),
    );
  }

  @MessagePattern(MSG_AUTH_ORG_LOGOUT)
  logout(payload: { refreshToken: string }) {
    return this.runSafely(() =>
      this.authOrgServiceService.logoutSession(payload),
    );
  }

  @MessagePattern(MSG_AUTH_ORG_LOGOUT_ALL)
  logoutAll(payload: { userId: string; tenantId: string }) {
    return this.runSafely(() =>
      this.authOrgServiceService.logoutAllSessions(payload),
    );
  }

  @MessagePattern(MSG_AUTH_ORG_SEAT_ASSERT_AVAILABLE)
  async assertSeatAvailable(payload: { tenantId: string; reason?: string }) {
    return this.runSafely(() =>
      this.authOrgServiceService.assertSeatAvailable(payload),
    );
  }

  @MessagePattern(MSG_AUTH_ORG_BILLING_OPS_SUMMARY)
  billingOpsSummary(payload: { hours?: number }) {
    return this.runSafely(() =>
      this.authOrgServiceService.billingOpsSummary(payload),
    );
  }
}

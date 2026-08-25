import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
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
  Role,
  SEAT_ENFORCEMENT_REASONS,
} from '@saas/common';
import { firstValueFrom } from 'rxjs';
import { type HealthResponse, tcpCall } from '../core/tcp-rpc';

@Injectable()
export class AuthGatewayService {
  constructor(
    @Inject('AUTH_ORG_SERVICE') private readonly authOrg: ClientProxy,
  ) {}

  private call<T>(pattern: string, payload: unknown): Promise<T> {
    return tcpCall<T>(this.authOrg, pattern, payload);
  }

  health(): Promise<HealthResponse> {
    return firstValueFrom(
      this.authOrg.send<HealthResponse>(MSG_AUTH_ORG_HEALTH, {}),
    );
  }

  tenantAuthEcho(payload: {
    tenantId: string;
    userId: string;
    role: string;
  }) {
    return this.call(MSG_AUTH_ORG_TENANT_ECHO, payload);
  }

  registerTenant(payload: {
    tenantName: string;
    adminEmail: string;
    adminDisplayName?: string;
    adminPassword: string;
    allowedDomains?: string[];
  }) {
    return this.call(MSG_AUTH_ORG_REGISTER_TENANT, payload);
  }

  createInvite(payload: {
    tenantId: string;
    invitedByUserId: string;
    email: string;
    role: Role;
    expiresInDays?: number;
  }) {
    return this.call(MSG_AUTH_ORG_CREATE_INVITE, payload);
  }

  acceptInvite(payload: {
    token: string;
    displayName?: string;
    password: string;
  }) {
    return this.call(MSG_AUTH_ORG_ACCEPT_INVITE, payload);
  }

  login(payload: { tenantId: string; email: string; password: string }) {
    return this.call(MSG_AUTH_ORG_LOGIN, payload);
  }

  refreshSession(payload: { refreshToken: string }) {
    return this.call(MSG_AUTH_ORG_REFRESH, payload);
  }

  logoutSession(payload: { refreshToken: string }) {
    return this.call(MSG_AUTH_ORG_LOGOUT, payload);
  }

  logoutAllSessions(payload: { userId: string; tenantId: string }) {
    return this.call(MSG_AUTH_ORG_LOGOUT_ALL, payload);
  }

  billingOpsSummary(payload: { hours?: number }): Promise<{
    windowHours: number;
    totals: number;
    processed: number;
    failed: number;
    pending: number;
    failureRate: number;
    byEventType: Array<{ eventType: string; count: number }>;
    recentFailures: Array<{
      stripeEventId: string;
      eventType: string;
      updatedAt: string;
      handlingError: string | null;
    }>;
  }> {
    return this.call(MSG_AUTH_ORG_BILLING_OPS_SUMMARY, payload);
  }

  assertSeatAvailable(tenantId: string) {
    return this.call(MSG_AUTH_ORG_SEAT_ASSERT_AVAILABLE, {
      tenantId,
      reason: SEAT_ENFORCEMENT_REASONS[1],
    });
  }
}

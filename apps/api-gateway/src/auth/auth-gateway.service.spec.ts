import { HttpException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import {
  MSG_AUTH_ORG_LOGIN,
  MSG_AUTH_ORG_REGISTER_TENANT,
  MSG_AUTH_ORG_SEAT_ASSERT_AVAILABLE,
  SEAT_ENFORCEMENT_REASONS,
} from '@saas/common';
import { AuthGatewayService } from './auth-gateway.service';

describe('AuthGatewayService', () => {
  const authOrg = {
    send: jest.fn(),
  };
  let service: AuthGatewayService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthGatewayService(authOrg as never);
  });

  it('registerTenant sends MSG_AUTH_ORG_REGISTER_TENANT', async () => {
    const payload = {
      tenantName: 'Acme',
      adminEmail: 'a@b.com',
      adminPassword: 'secret',
    };
    authOrg.send.mockReturnValue(of({ tenantId: 't1' }));

    await expect(service.registerTenant(payload)).resolves.toEqual({
      tenantId: 't1',
    });
    expect(authOrg.send).toHaveBeenCalledWith(
      MSG_AUTH_ORG_REGISTER_TENANT,
      payload,
    );
  });

  it('login sends MSG_AUTH_ORG_LOGIN', async () => {
    const payload = {
      tenantId: 't1',
      email: 'a@b.com',
      password: 'secret',
    };
    authOrg.send.mockReturnValue(of({ accessToken: 'tok' }));

    await expect(service.login(payload)).resolves.toEqual({
      accessToken: 'tok',
    });
    expect(authOrg.send).toHaveBeenCalledWith(MSG_AUTH_ORG_LOGIN, payload);
  });

  it('assertSeatAvailable sends seat assert with enroll reason', async () => {
    authOrg.send.mockReturnValue(of({ ok: true }));

    await service.assertSeatAvailable('t1');
    expect(authOrg.send).toHaveBeenCalledWith(
      MSG_AUTH_ORG_SEAT_ASSERT_AVAILABLE,
      {
        tenantId: 't1',
        reason: SEAT_ENFORCEMENT_REASONS[1],
      },
    );
  });

  it('maps downstream already-exists errors to HttpException 409', async () => {
    authOrg.send.mockReturnValue(
      throwError(() => ({ message: 'Tenant already exists' })),
    );

    try {
      await service.registerTenant({
        tenantName: 'Acme',
        adminEmail: 'a@b.com',
        adminPassword: 'secret',
      });
      fail('expected HttpException');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(409);
    }
  });
});

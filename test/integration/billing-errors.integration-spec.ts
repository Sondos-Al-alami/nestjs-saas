import { randomUUID } from 'node:crypto';
import { Role, SubscriptionTier } from '@saas/common';
import { createGatewayClient } from './gateway-client';
import { uniqueTestIdentity } from './test-identity';

const { sign } = require('jsonwebtoken') as {
  sign: (payload: Record<string, unknown>, secret: string) => string;
};

function jwtSecret(): string {
  return (
    process.env.JWT_SECRET?.trim() ||
    'integration-jwt-secret-min-32-chars-do-not-use-in-prod'
  );
}

function accessTokenFor(args: {
  tenantId: string;
  role: Role;
  userId?: string;
}): string {
  return sign(
    {
      userId: args.userId ?? randomUUID(),
      tenantId: args.tenantId,
      role: args.role,
      subscriptionTier: SubscriptionTier.FREE,
      tokenUse: 'access',
      exp: Math.floor(Date.now() / 1000) + 900,
    },
    jwtSecret(),
  );
}

/**
 * Black-box billing ops errors on GET /billing/ops/summary (SUPER_ADMIN only).
 */
describe('billing errors (integration)', () => {
  const api = createGatewayClient();
  const path = '/billing/ops/summary';

  let tenantId: string;
  let orgAdminToken: string;

  beforeAll(async () => {
    const identity = uniqueTestIdentity('billing');
    const registerRes = await api.post('/auth/register').send({
      tenantName: identity.tenantName,
      adminEmail: identity.adminEmail,
      adminPassword: identity.adminPassword,
    });
    expect(registerRes.status).toBeGreaterThanOrEqual(200);
    expect(registerRes.status).toBeLessThan(300);
    tenantId = registerRes.body.tenantId as string;

    const loginRes = await api.post('/auth/login').send({
      tenantId,
      email: identity.adminEmail,
      password: identity.adminPassword,
    });
    expect(loginRes.status).toBeGreaterThanOrEqual(200);
    expect(loginRes.status).toBeLessThan(300);
    orgAdminToken = loginRes.body.accessToken as string;
  });

  afterEach(() => {
    api.clearAuth().clearTenant();
  });

  it('rejects without auth with 401', async () => {
    api.setTenant(tenantId);
    const res = await api.get(path);
    expect(res.status).toBe(401);
  });

  it('rejects ORG_ADMIN with 403', async () => {
    api.setBearer(orgAdminToken).setTenant(tenantId);
    const res = await api.get(path);
    expect(res.status).toBe(403);
  });

  it('rejects LEARNER with 403', async () => {
    const learnerToken = accessTokenFor({
      tenantId,
      role: Role.LEARNER,
    });
    api.setBearer(learnerToken).setTenant(tenantId);
    const res = await api.get(path);
    expect(res.status).toBe(403);
  });

  it('allows SUPER_ADMIN with 200', async () => {
    const superToken = accessTokenFor({
      tenantId,
      role: Role.SUPER_ADMIN,
    });
    api.setBearer(superToken).setTenant(tenantId);
    const res = await api.get(path);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        windowHours: expect.any(Number),
        totals: expect.any(Number),
        processed: expect.any(Number),
        failed: expect.any(Number),
        pending: expect.any(Number),
        failureRate: expect.any(Number),
      }),
    );
  });

  it('rejects non-numeric hours query with 400', async () => {
    const superToken = accessTokenFor({
      tenantId,
      role: Role.SUPER_ADMIN,
    });
    api.setBearer(superToken).setTenant(tenantId);
    const res = await api.get(path).query({ hours: 'not-a-number' });
    expect(res.status).toBe(400);
  });
});

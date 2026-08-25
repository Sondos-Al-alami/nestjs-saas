import { randomUUID } from 'node:crypto';
import { Role, SubscriptionTier } from '@saas/common';
import { createGatewayClient } from './gateway-client';
import { uniqueTestIdentity } from './test-identity';

// jsonwebtoken has no @types in this workspace; keep a narrow local typing.
const { sign } = require('jsonwebtoken') as {
  sign: (payload: Record<string, unknown>, secret: string) => string;
};

function jwtSecret(): string {
  return (
    process.env.JWT_SECRET?.trim() ||
    'integration-jwt-secret-min-32-chars-do-not-use-in-prod'
  );
}

/**
 * Black-box auth error cases against the running gateway.
 */
describe('auth errors (integration)', () => {
  const api = createGatewayClient();

  describe('POST /auth/login', () => {
    let tenantId: string;
    let adminEmail: string;
    let adminPassword: string;

    beforeAll(async () => {
      const identity = uniqueTestIdentity('auth-login');
      const registerRes = await api.post('/auth/register').send({
        tenantName: identity.tenantName,
        adminEmail: identity.adminEmail,
        adminPassword: identity.adminPassword,
      });
      expect(registerRes.status).toBeGreaterThanOrEqual(200);
      expect(registerRes.status).toBeLessThan(300);
      tenantId = registerRes.body.tenantId as string;
      adminEmail = identity.adminEmail;
      adminPassword = identity.adminPassword;
    });

    it('rejects wrong password with 401', async () => {
      const res = await api.post('/auth/login').send({
        tenantId,
        email: adminEmail,
        password: 'WrongPassword1!',
      });
      expect(res.status).toBe(401);
    });

    it('rejects unknown email with 401', async () => {
      const res = await api.post('/auth/login').send({
        tenantId,
        email: `nobody-${Date.now()}@integration.test`,
        password: adminPassword,
      });
      expect(res.status).toBe(401);
    });

    it('rejects wrong tenantId with 401', async () => {
      const res = await api.post('/auth/login').send({
        tenantId: randomUUID(),
        email: adminEmail,
        password: adminPassword,
      });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/register', () => {
    it('rejects duplicate tenant name with 409', async () => {
      const identity = uniqueTestIdentity('auth-dup');
      const first = await api.post('/auth/register').send({
        tenantName: identity.tenantName,
        adminEmail: identity.adminEmail,
        adminPassword: identity.adminPassword,
      });
      expect(first.status).toBeGreaterThanOrEqual(200);
      expect(first.status).toBeLessThan(300);

      const second = await api.post('/auth/register').send({
        tenantName: identity.tenantName,
        adminEmail: `other-${Date.now()}@integration.test`,
        adminPassword: identity.adminPassword,
      });
      expect(second.status).toBe(409);
    });
  });

  describe('protected routes', () => {
    let tenantId: string;
    let accessToken: string;

    beforeAll(async () => {
      const identity = uniqueTestIdentity('auth-prot');
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
      accessToken = loginRes.body.accessToken as string;
    });

    afterEach(() => {
      api.clearAuth().clearTenant();
    });

    it('rejects missing x-tenant-id on protected route with 400', async () => {
      api.setBearer(accessToken);
      const res = await api.post('/courses').send({ title: 'No Tenant' });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/x-tenant-id/i);
    });

    it('rejects protected route without Bearer with 401', async () => {
      api.setTenant(tenantId);
      const res = await api.post('/courses').send({ title: 'No Auth' });
      expect(res.status).toBe(401);
    });

    it('rejects Bearer when x-tenant-id does not match token tenant with 401', async () => {
      api.setBearer(accessToken).setTenant(randomUUID());
      const res = await api.post('/courses').send({ title: 'Wrong Tenant' });
      expect(res.status).toBe(401);
    });

    it('rejects expired access token with 401', async () => {
      const expired = sign(
        {
          userId: randomUUID(),
          tenantId,
          role: Role.ORG_ADMIN,
          subscriptionTier: SubscriptionTier.FREE,
          tokenUse: 'access',
          exp: Math.floor(Date.now() / 1000) - 60,
        },
        jwtSecret(),
      );
      api.setBearer(expired).setTenant(tenantId);
      const res = await api.post('/courses').send({ title: 'Expired' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/refresh and /auth/logout', () => {
    it('rejects refresh with invalid body (missing token) with 400', async () => {
      const res = await api.post('/auth/refresh').send({});
      expect(res.status).toBe(400);
    });

    it('rejects refresh with an unknown refresh token with 401', async () => {
      const res = await api
        .post('/auth/refresh')
        .send({ refreshToken: 'x'.repeat(40) });
      expect(res.status).toBe(401);
    });

    it('rejects logout with invalid body (missing token) with 400', async () => {
      const res = await api.post('/auth/logout').send({});
      expect(res.status).toBe(400);
    });

    it('logout with unknown refresh token is idempotent (200)', async () => {
      const res = await api
        .post('/auth/logout')
        .send({ refreshToken: 'y'.repeat(40) });
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
      expect(res.body).toEqual(expect.objectContaining({ ok: true }));
    });
  });
});

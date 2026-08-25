import { createGatewayClient } from './gateway-client';
import { postStripeWebhook } from './auth-org-http-client';
import { disconnectAuthDb, getAuthDb } from './auth-db-client';
import {
  signStripePayload,
  stripeEventEnvelope,
} from './stripe-webhook-fixture';
import { uniqueTestIdentity } from './test-identity';

/**
 * Webhook plumbing only: signature verification + replay idempotency.
 * Entitlement / subscription lifecycle lives in billing-lifecycle.integration-spec.ts.
 *
 * Stripe webhooks hit auth-org-service HTTP (POST /webhooks/stripe), not the gateway.
 */
describe('stripe webhook (integration)', () => {
  const api = createGatewayClient();
  const authDb = getAuthDb();

  afterAll(async () => {
    await disconnectAuthDb();
  });

  async function registerTenant(prefix: string): Promise<string> {
    const identity = uniqueTestIdentity(prefix);
    const res = await api.post('/auth/register').send({
      tenantName: identity.tenantName,
      adminEmail: identity.adminEmail,
      adminPassword: identity.adminPassword,
    });
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    return res.body.tenantId as string;
  }

  it('rejects webhook without Stripe-Signature with 400', async () => {
    const payload = stripeEventEnvelope('ping', { id: 'obj_test' });
    const res = await postStripeWebhook({
      rawBody: JSON.stringify(payload),
    });
    expect(res.status).toBe(400);
  });

  it('rejects webhook with invalid signature with 400', async () => {
    const payload = stripeEventEnvelope('ping', { id: 'obj_test' });
    const res = await postStripeWebhook({
      rawBody: JSON.stringify(payload),
      signature: 't=0,v1=invalid',
    });
    expect(res.status).toBe(400);
  });

  it('checkout.session.completed (payment) sets stripeCustomerId once; replay is idempotent', async () => {
    const tenantId = await registerTenant('stripe-checkout');
    const customerId = `cus_${tenantId.replace(/-/g, '').slice(0, 20)}`;
    const eventId = `evt_cs_${tenantId.replace(/-/g, '').slice(0, 16)}`;

    const signed = signStripePayload(
      stripeEventEnvelope(
        'checkout.session.completed',
        {
          id: `cs_${tenantId.replace(/-/g, '').slice(0, 20)}`,
          object: 'checkout.session',
          mode: 'payment',
          customer: customerId,
          metadata: { tenantId },
        },
        eventId,
      ),
    );

    const first = await postStripeWebhook(signed);
    expect(first).toEqual({
      status: 201,
      body: { received: true },
    });

    const tenantAfterFirst = await authDb.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { stripeCustomerId: true },
    });
    expect(tenantAfterFirst.stripeCustomerId).toBe(customerId);

    const webhookRow = await authDb.stripeWebhookEvent.findUniqueOrThrow({
      where: { stripeEventId: eventId },
    });
    expect(webhookRow.eventType).toBe('checkout.session.completed');
    expect(webhookRow.processedAt).not.toBeNull();
    expect(webhookRow.handlingError).toBeNull();

    const second = await postStripeWebhook(signed);
    expect(second).toEqual({
      status: 201,
      body: { received: true },
    });

    const tenantAfterReplay = await authDb.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { stripeCustomerId: true },
    });
    expect(tenantAfterReplay.stripeCustomerId).toBe(customerId);

    expect(
      await authDb.stripeWebhookEvent.count({
        where: { stripeEventId: eventId },
      }),
    ).toBe(1);
  });
});

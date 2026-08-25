import { createGatewayClient } from './gateway-client';
import { postStripeWebhook } from './auth-org-http-client';
import { disconnectAuthDb, getAuthDb } from './auth-db-client';
import {
  signStripePayload,
  stripeEventEnvelope,
  stripeSubscriptionObject,
} from './stripe-webhook-fixture';
import { uniqueTestIdentity } from './test-identity';

/**
 * Billing entitlement lifecycle via Stripe webhooks (auth-org HTTP + auth_db).
 * Signature / replay plumbing is covered in stripe-webhook.integration-spec.ts.
 * Uses signed fixtures with embedded subscription objects — no live Stripe API.
 */
describe('billing lifecycle (integration)', () => {
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

  function idsFor(tenantId: string, tag: string) {
    const compact = tenantId.replace(/-/g, '');
    return {
      subscriptionId: `sub_${tag}_${compact.slice(0, 12)}`,
      customerId: `cus_${tag}_${compact.slice(0, 12)}`,
      eventId: `evt_${tag}_${compact.slice(0, 12)}`,
    };
  }

  it('customer.subscription.updated (active PRO) upgrades FREE tenant', async () => {
    const tenantId = await registerTenant('life-up');
    const { subscriptionId, customerId, eventId } = idsFor(tenantId, 'up');

    const before = await authDb.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        subscriptionTier: true,
        includedLearnerSeats: true,
        stripeSubscriptionId: true,
        stripeCustomerId: true,
      },
    });
    expect(before.subscriptionTier).toBe('FREE');

    const signed = signStripePayload(
      stripeEventEnvelope(
        'customer.subscription.updated',
        stripeSubscriptionObject({
          id: subscriptionId,
          tenantId,
          customerId,
          status: 'active',
        }),
        eventId,
      ),
    );

    const res = await postStripeWebhook(signed);
    expect(res).toEqual({ status: 201, body: { received: true } });

    const after = await authDb.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        subscriptionTier: true,
        includedLearnerSeats: true,
        stripeSubscriptionId: true,
        stripeCustomerId: true,
      },
    });
    expect(after).toEqual({
      subscriptionTier: 'PRO',
      includedLearnerSeats: 10,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customerId,
    });
  });

  it('customer.subscription.updated (past_due) clears paid entitlements', async () => {
    const tenantId = await registerTenant('life-due');
    const { subscriptionId, customerId, eventId } = idsFor(tenantId, 'due');

    await authDb.tenant.update({
      where: { id: tenantId },
      data: {
        subscriptionTier: 'PRO',
        includedLearnerSeats: 10,
        stripeSubscriptionId: subscriptionId,
        stripeCustomerId: customerId,
      },
    });

    const signed = signStripePayload(
      stripeEventEnvelope(
        'customer.subscription.updated',
        stripeSubscriptionObject({
          id: subscriptionId,
          tenantId,
          customerId,
          status: 'past_due',
        }),
        eventId,
      ),
    );

    const res = await postStripeWebhook(signed);
    expect(res).toEqual({ status: 201, body: { received: true } });

    const after = await authDb.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        subscriptionTier: true,
        includedLearnerSeats: true,
        stripeSubscriptionId: true,
        stripeCustomerId: true,
      },
    });
    expect(after).toEqual({
      subscriptionTier: 'FREE',
      includedLearnerSeats: 3,
      stripeSubscriptionId: null,
      stripeCustomerId: customerId,
    });
  });

  it('customer.subscription.paused clears paid entitlements', async () => {
    const tenantId = await registerTenant('life-pause');
    const { subscriptionId, customerId, eventId } = idsFor(tenantId, 'pause');

    await authDb.tenant.update({
      where: { id: tenantId },
      data: {
        subscriptionTier: 'PRO',
        includedLearnerSeats: 10,
        stripeSubscriptionId: subscriptionId,
        stripeCustomerId: customerId,
      },
    });

    const signed = signStripePayload(
      stripeEventEnvelope(
        'customer.subscription.paused',
        stripeSubscriptionObject({
          id: subscriptionId,
          tenantId,
          customerId,
          status: 'paused',
        }),
        eventId,
      ),
    );

    const res = await postStripeWebhook(signed);
    expect(res).toEqual({ status: 201, body: { received: true } });

    const after = await authDb.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        subscriptionTier: true,
        includedLearnerSeats: true,
        stripeSubscriptionId: true,
      },
    });
    expect(after).toEqual({
      subscriptionTier: 'FREE',
      includedLearnerSeats: 3,
      stripeSubscriptionId: null,
    });
  });

  it('checkout.session.completed (subscription) sets customer + syncs PRO from expanded subscription', async () => {
    const tenantId = await registerTenant('life-cs');
    const { subscriptionId, customerId, eventId } = idsFor(tenantId, 'cs');

    const subscription = stripeSubscriptionObject({
      id: subscriptionId,
      tenantId,
      customerId,
      status: 'active',
    });

    const signed = signStripePayload(
      stripeEventEnvelope(
        'checkout.session.completed',
        {
          id: `cs_${tenantId.replace(/-/g, '').slice(0, 16)}`,
          object: 'checkout.session',
          mode: 'subscription',
          customer: customerId,
          subscription,
          metadata: { tenantId },
        },
        eventId,
      ),
    );

    const res = await postStripeWebhook(signed);
    expect(res).toEqual({ status: 201, body: { received: true } });

    const after = await authDb.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        subscriptionTier: true,
        includedLearnerSeats: true,
        stripeSubscriptionId: true,
        stripeCustomerId: true,
      },
    });
    expect(after).toEqual({
      subscriptionTier: 'PRO',
      includedLearnerSeats: 10,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customerId,
    });
  });

  it('lifecycle: created PRO → deleted FREE (idempotent delete replay)', async () => {
    const tenantId = await registerTenant('life-full');
    const { subscriptionId, customerId } = idsFor(tenantId, 'full');
    const createdEventId = `evt_created_${tenantId.replace(/-/g, '').slice(0, 12)}`;
    const deletedEventId = `evt_deleted_${tenantId.replace(/-/g, '').slice(0, 12)}`;

    const created = signStripePayload(
      stripeEventEnvelope(
        'customer.subscription.created',
        stripeSubscriptionObject({
          id: subscriptionId,
          tenantId,
          customerId,
          status: 'active',
        }),
        createdEventId,
      ),
    );
    expect(await postStripeWebhook(created)).toEqual({
      status: 201,
      body: { received: true },
    });

    const afterCreate = await authDb.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        subscriptionTier: true,
        includedLearnerSeats: true,
        stripeSubscriptionId: true,
      },
    });
    expect(afterCreate).toEqual({
      subscriptionTier: 'PRO',
      includedLearnerSeats: 10,
      stripeSubscriptionId: subscriptionId,
    });

    const deleted = signStripePayload(
      stripeEventEnvelope(
        'customer.subscription.deleted',
        {
          id: subscriptionId,
          object: 'subscription',
          status: 'canceled',
        },
        deletedEventId,
      ),
    );
    expect(await postStripeWebhook(deleted)).toEqual({
      status: 201,
      body: { received: true },
    });

    const webhookRow = await authDb.stripeWebhookEvent.findUniqueOrThrow({
      where: { stripeEventId: deletedEventId },
    });
    expect(webhookRow.eventType).toBe('customer.subscription.deleted');
    expect(webhookRow.processedAt).not.toBeNull();
    expect(webhookRow.handlingError).toBeNull();

    expect(await postStripeWebhook(deleted)).toEqual({
      status: 201,
      body: { received: true },
    });

    const afterDelete = await authDb.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        subscriptionTier: true,
        includedLearnerSeats: true,
        stripeSubscriptionId: true,
      },
    });
    expect(afterDelete).toEqual({
      subscriptionTier: 'FREE',
      includedLearnerSeats: 3,
      stripeSubscriptionId: null,
    });

    expect(
      await authDb.stripeWebhookEvent.count({
        where: { stripeEventId: deletedEventId },
      }),
    ).toBe(1);
  });
});

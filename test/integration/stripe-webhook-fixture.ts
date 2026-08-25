import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import { readIntegrationEnv } from './integration-env';

export function integrationStripeSecrets(): {
  secretKey: string;
  webhookSecret: string;
} {
  const env = readIntegrationEnv();
  return {
    secretKey:
      env.STRIPE_SECRET_KEY?.trim() || 'sk_test_integration_not_real',
    webhookSecret:
      env.STRIPE_WEBHOOK_SECRET?.trim() ||
      'whsec_integration_test_secret',
  };
}

export function signStripePayload(payload: Record<string, unknown>): {
  rawBody: string;
  signature: string;
} {
  const { secretKey, webhookSecret } = integrationStripeSecrets();
  const stripe = new Stripe(secretKey);
  const rawBody = JSON.stringify(payload);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload: rawBody,
    secret: webhookSecret,
  });
  return { rawBody, signature };
}

export function stripeEventEnvelope(
  type: string,
  dataObject: Record<string, unknown>,
  eventId?: string,
): Record<string, unknown> {
  return {
    id: eventId ?? `evt_${randomUUID().replace(/-/g, '')}`,
    object: 'event',
    api_version: '2024-06-20',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type,
    data: { object: dataObject },
  };
}

export function integrationProPriceId(): string {
  return (
    readIntegrationEnv().STRIPE_PRICE_PRO?.trim() || 'price_integration_pro'
  );
}

/** Minimal Stripe Subscription object for webhook fixtures (no live API). */
export function stripeSubscriptionObject(args: {
  id: string;
  tenantId: string;
  customerId: string;
  status?: string;
  priceId?: string;
}): Record<string, unknown> {
  const priceId = args.priceId ?? integrationProPriceId();
  return {
    id: args.id,
    object: 'subscription',
    status: args.status ?? 'active',
    customer: args.customerId,
    metadata: { tenantId: args.tenantId },
    items: {
      object: 'list',
      data: [
        {
          id: `si_${args.id.replace(/^sub_/, '').slice(0, 14)}`,
          object: 'subscription_item',
          quantity: 1,
          price: {
            id: priceId,
            object: 'price',
          },
        },
      ],
    },
  };
}


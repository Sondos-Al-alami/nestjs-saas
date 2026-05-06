import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  parseStripeBillingCatalogFromEnv,
  resolveSubscriptionEntitlements,
  SubscriptionTier as SharedSubscriptionTier,
  type StripeBillingCatalog,
} from '@saas/common';
import Stripe from 'stripe';
import { SubscriptionTier } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StripeBillingService {
  private readonly logger = new Logger(StripeBillingService.name);
  private readonly stripe: Stripe | null;
  private readonly catalog: StripeBillingCatalog;

  constructor(private readonly prisma: PrismaService) {
    this.catalog = parseStripeBillingCatalogFromEnv();
    const key = process.env.STRIPE_SECRET_KEY?.trim();
    this.stripe = key ? new Stripe(key) : null;
  }

  private assertStripeConfigured(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException('STRIPE_SECRET_KEY is not configured');
    }
    return this.stripe;
  }

  private isPayingSubscriptionStatus(status: Stripe.Subscription.Status): boolean {
    return status === 'active' || status === 'trialing';
  }

  private subscriptionLines(
    sub: Stripe.Subscription,
  ): { priceId: string; quantity: number }[] {
    return sub.items.data.map((item) => ({
      priceId: typeof item.price === 'string' ? item.price : item.price.id,
      quantity: item.quantity ?? 1,
    }));
  }

  private async resolveTenantId(sub: Stripe.Subscription): Promise<string | null> {
    const fromSub = sub.metadata?.tenantId?.trim();
    if (fromSub) {
      return fromSub;
    }
    // Fallback: resolve via Stripe customer metadata.
    const customerId =
      typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
    if (!customerId) {
      return null;
    }
    const stripe = this.stripe;
    if (!stripe) {
      return null;
    }
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted || !('metadata' in customer)) {
      return null;
    }
    // Tenant id must be stored in Stripe metadata as `tenantId`.
    return customer.metadata?.tenantId?.trim() || null;
  }

  private async syncSubscriptionRecord(sub: Stripe.Subscription): Promise<void> {
    const tenantId = await this.resolveTenantId(sub);
    if (!tenantId) {
      this.logger.warn(
        `Stripe subscription ${sub.id} has no tenantId on subscription or customer metadata`,
      );
      return;
    }

    const customerId =
      typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;

    // Non-paying statuses should remove paid entitlements.
    if (!this.isPayingSubscriptionStatus(sub.status)) {
      await this.prisma.tenant.updateMany({
        where: { id: tenantId },
        data: {
          subscriptionTier: SubscriptionTier.FREE,
          includedLearnerSeats: null,
          stripeSubscriptionId: null,
          ...(customerId ? { stripeCustomerId: customerId } : {}),
        },
      });
      return;
    }

    // Derive tier and included seats from subscription line items.
    const { tier, includedLearnerSeats } = resolveSubscriptionEntitlements(
      this.subscriptionLines(sub),
      this.catalog,
    );

    await this.prisma.tenant.updateMany({
      where: { id: tenantId },
      data: {
        subscriptionTier: tier,
        includedLearnerSeats,
        stripeSubscriptionId: sub.id,
        ...(customerId ? { stripeCustomerId: customerId } : {}),
      },
    });
  }

  private async clearSubscriptionByStripeId(
    subscriptionId: string,
  ): Promise<void> {
    await this.prisma.tenant.updateMany({
      where: { stripeSubscriptionId: subscriptionId },
      data: {
        subscriptionTier: SubscriptionTier.FREE,
        includedLearnerSeats: null,
        stripeSubscriptionId: null,
      },
    });
  }

  private async onCheckoutSessionCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const tenantId =
      session.metadata?.tenantId?.trim() || null;
    const customerRaw = session.customer;
    const customerId =
      typeof customerRaw === 'string' ? customerRaw : customerRaw?.id;

    if (tenantId && customerId) {
      await this.prisma.tenant.updateMany({
        where: { id: tenantId },
        data: { stripeCustomerId: customerId },
      });
    }

    if (session.mode !== 'subscription') {
      return;
    }

    const stripe = this.stripe;
    const subRef = session.subscription;
    const subId = typeof subRef === 'string' ? subRef : subRef?.id;
    if (!stripe || !subId) {
      return;
    }

    const sub = await stripe.subscriptions.retrieve(subId);
    await this.syncSubscriptionRecord(sub);
  }

  async createCheckoutSession(payload: {
    tenantId: string;
    tier: SharedSubscriptionTier;
    actorUserId?: string;
  }): Promise<{ url: string; sessionId: string }> {
    const stripe = this.assertStripeConfigured();
    const tenantId = payload.tenantId?.trim();
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }

    const tierDef = this.catalog.tierPrices.find((t) => t.tier === payload.tier);
    if (!tierDef) {
      throw new BadRequestException(`No Stripe price configured for tier ${payload.tier}`);
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, stripeCustomerId: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    let customerId = tenant.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { tenantId },
      });
      customerId = customer.id;
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { stripeCustomerId: customerId },
      });
    }

    const returnBase =
      process.env.BILLING_CHECKOUT_RETURN_BASE_URL?.trim() || 'http://localhost:3000';
    const successUrl = `${returnBase}/billing/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${returnBase}/billing/cancel`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: tierDef.priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        tenantId,
        ...(payload.actorUserId ? { initiatedByUserId: payload.actorUserId } : {}),
      },
      subscription_data: {
        metadata: {
          tenantId,
          ...(payload.actorUserId ? { initiatedByUserId: payload.actorUserId } : {}),
        },
      },
    });

    if (!session.url) {
      throw new ServiceUnavailableException('Stripe did not return a checkout URL');
    }
    return { url: session.url, sessionId: session.id };
  }

  async handleWebhookPayload(
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<void> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!webhookSecret) {
      throw new ServiceUnavailableException('STRIPE_WEBHOOK_SECRET is not configured');
    }

    const stripe = this.assertStripeConfigured();
    const sig = signature?.trim();
    if (!sig) {
      throw new BadRequestException('Missing Stripe-Signature header');
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid payload';
      this.logger.warn(`Stripe webhook signature failed: ${msg}`);
      throw new BadRequestException('Invalid Stripe webhook signature');
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.syncSubscriptionRecord(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.clearSubscriptionByStripeId(
          (event.data.object as Stripe.Subscription).id,
        );
        break;
      default:
        break;
    }
  }
}

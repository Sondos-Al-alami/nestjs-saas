import { SubscriptionTier } from '../subscription/subscription-tier';

/** Maps a Stripe Price id (base subscription line) to an LMS tier and bundled learner seats. */
export type StripeTierPriceDefinition = {
  priceId: string;
  tier: SubscriptionTier;
  /** Seats included in this base price (before add-on seat line items). */
  includedLearnerSeats: number;
};

export type StripeBillingCatalog = {
  tierPrices: StripeTierPriceDefinition[];
};

export type SubscriptionLineInput = {
  priceId: string;
  quantity: number;
};

const TIER_RANK: Record<SubscriptionTier, number> = {
  [SubscriptionTier.FREE]: 0,
  [SubscriptionTier.PRO]: 1,
  [SubscriptionTier.ENTERPRISE]: 2,
};

const DEFAULT_INCLUDED_SEATS: Record<SubscriptionTier, number> = {
  [SubscriptionTier.FREE]: 3,
  [SubscriptionTier.PRO]: 10,
  [SubscriptionTier.ENTERPRISE]: 100,
};

export function parseStripeBillingCatalogFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): StripeBillingCatalog {
  const tierPrices: StripeTierPriceDefinition[] = [];

  const proPrice = env.STRIPE_PRICE_PRO?.trim();
  if (proPrice) {
    tierPrices.push({
      priceId: proPrice,
      tier: SubscriptionTier.PRO,
      includedLearnerSeats: DEFAULT_INCLUDED_SEATS[SubscriptionTier.PRO],
    });
  }

  const enterprisePrice = env.STRIPE_PRICE_ENTERPRISE?.trim();
  if (enterprisePrice) {
    tierPrices.push({
      priceId: enterprisePrice,
      tier: SubscriptionTier.ENTERPRISE,
      includedLearnerSeats: DEFAULT_INCLUDED_SEATS[SubscriptionTier.ENTERPRISE],
    });
  }

  return { tierPrices };
}

/**
 * Derives `Tenant.subscriptionTier` and `Tenant.includedLearnerSeats` from Stripe
 * subscription line items and the configured catalog.
 *
 * - Chooses the highest tier among matched tier prices.
 * - Bundled seats: sum of `includedLearnerSeats` for lines matching that tier.
 */
export function resolveSubscriptionEntitlements(
  lines: SubscriptionLineInput[],
  catalog: StripeBillingCatalog,
): { tier: SubscriptionTier; includedLearnerSeats: number | null } {
  const tierByPrice = new Map(
    catalog.tierPrices.map((t) => [t.priceId, t] as const),
  );

  let tier = SubscriptionTier.FREE;
  let sawTierLine = false;
  let bundledSeats = 0;

  for (const line of lines) {
    const tierDef = tierByPrice.get(line.priceId);
    if (tierDef) {
      sawTierLine = true;
      const quantity = Number.isFinite(line.quantity)
        ? Math.max(1, line.quantity)
        : 1;
      const seatsForLine = tierDef.includedLearnerSeats * quantity;
      if (TIER_RANK[tierDef.tier] > TIER_RANK[tier]) {
        tier = tierDef.tier;
        bundledSeats = seatsForLine;
      } else if (tierDef.tier === tier) {
        bundledSeats += seatsForLine;
      }
      continue;
    }
  }

  if (!sawTierLine) {
    return { tier: SubscriptionTier.FREE, includedLearnerSeats: null };
  }

  return {
    tier,
    includedLearnerSeats: Math.max(1, bundledSeats),
  };
}

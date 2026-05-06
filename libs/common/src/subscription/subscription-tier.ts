export enum SubscriptionTier {
  FREE = 'FREE',
  PRO = 'PRO',
  ENTERPRISE = 'ENTERPRISE',
}

export function maxCoursesForSubscriptionTier(
  tier: SubscriptionTier,
): number | null {
  switch (tier) {
    case SubscriptionTier.FREE:
      return 3;
    case SubscriptionTier.PRO:
      return 100;
    case SubscriptionTier.ENTERPRISE:
      return null;
  }
}

export function subscriptionTierCourseLimitMessage(
  tier: SubscriptionTier,
  limit: number,
): string {
  const tierLabel =
    tier === SubscriptionTier.FREE
      ? 'Free'
      : tier === SubscriptionTier.PRO
        ? 'Pro'
        : 'Enterprise';
  return `Your ${tierLabel} plan allows at most ${limit} course${limit === 1 ? '' : 's'}. Upgrade your subscription to create more.`;
}

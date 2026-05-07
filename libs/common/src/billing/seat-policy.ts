import { Role } from '../auth/role.enum';

export type SeatPolicyInput = {
  role: Role;
  membershipActive: boolean;
  countsTowardLearnerSeats: boolean;
  lastSeatQualifyingActivityAt: Date | null;
  seatBillingPeriodDays: number;
  now?: Date;
};

/**
 * Definition of an **active learner seat** for Stripe-style billing:
 * learner role, membership active, flagged as seat-eligible, and recent qualifying activity
 * within the tenant’s rolling window (`seatBillingPeriodDays`).
 *
 * Sync `includedLearnerSeats` / period bounds from Stripe webhooks on `Tenant`; update
 * `lastSeatQualifyingActivityAt` from login (auth) and lesson completion (analytics/course).
 */
export function isActiveLearnerSeat(input: SeatPolicyInput): boolean {
  if (
    input.role !== Role.LEARNER ||
    !input.membershipActive ||
    !input.countsTowardLearnerSeats
  ) {
    return false;
  }
  if (!input.lastSeatQualifyingActivityAt) {
    return false;
  }
  const now = input.now ?? new Date();
  const windowMs = input.seatBillingPeriodDays * 24 * 60 * 60 * 1000;
  return (
    now.getTime() - input.lastSeatQualifyingActivityAt.getTime() <= windowMs
  );
}

export const SEAT_ENFORCEMENT_REASONS = [
  'activate learner invite',
  'create enrollment',
  'reactivate learner membership',
] as const;

export type SeatEnforcementReason = (typeof SEAT_ENFORCEMENT_REASONS)[number];

export function normalizeSeatEnforcementReason(
  value: string | null | undefined,
): SeatEnforcementReason {
  const normalized = value?.trim().toLowerCase();
  const match = SEAT_ENFORCEMENT_REASONS.find((r) => r === normalized);
  return match ?? 'reactivate learner membership';
}

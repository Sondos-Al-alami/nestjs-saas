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
  return now.getTime() - input.lastSeatQualifyingActivityAt.getTime() <= windowMs;
}

/**
 * When a member may buy a credit refill.
 *
 * ── The rule ─────────────────────────────────────────────────────────────────
 * There are two plans: Rishta 6 and Rishta 12. The refill is not a third one —
 * it is what an ACTIVE subscriber reaches for when their balance hits zero,
 * priced like usage rather than sold from a cold start. So:
 *
 *     active term  AND  nothing left to spend
 *
 * ── Why not sell it to everyone ──────────────────────────────────────────────
 * ₹349 for 25 credits is far worse value per credit than either term (₹12.22
 * and ₹9.37 against ₹13.96). Offering it beside the plans invites a first-time
 * buyer to pick the worst deal we sell, decide the product is expensive, and
 * not come back. Gated to a subscriber who has genuinely run dry, the same
 * price is a convenience rather than a trap.
 *
 * ── Where it is enforced ─────────────────────────────────────────────────────
 * POST /api/orders refuses a `topup25` order that fails this check — that is
 * the gate. GET /api/account/profile returns the same verdict so /pricing and
 * PaymentModal can hide or explain the option instead of letting a member walk
 * into the refusal. One function, both answers, no drift.
 *
 * `ir_create_order` deliberately stays a generic "reserve an amount for this
 * plan id" primitive: it is REVOKEd from anon/authenticated and only reachable
 * through that one route.
 */
import type { ProfileState } from '@/lib/credits';

/** Why a refill is not on offer. `null` reason = it is. */
export type TopupBlockReason =
  | 'no_plan'            // never subscribed, or the term lapsed
  | 'credits_remaining'; // still has credits to spend

export interface TopupEligibility {
  eligible: boolean;
  reason:   TopupBlockReason | null;
  /** Ready-to-render explanation. Empty when eligible. */
  message:  string;
}

/** The profile fields the rule reads. */
type Refillable = Pick<
  ProfileState,
  'plan' | 'plan_expires_at' | 'credits' | 'bonus_credits'
>;

const ACTIVE_PLANS = ['ir6', 'ir12'] as const;

export function topupEligibility(profile: Refillable): TopupEligibility {
  const onPlan = (ACTIVE_PLANS as readonly string[]).includes(profile.plan ?? 'none');

  // ir_sync_profile already demotes a finished term to 'none' before we ever
  // see the row, so `onPlan` is normally enough. The expiry re-check costs
  // nothing and closes the window where a row is read between expiry and its
  // next sync.
  const expired =
    profile.plan_expires_at !== null &&
    new Date(profile.plan_expires_at).getTime() <= Date.now();

  if (!onPlan || expired) {
    return {
      eligible: false,
      reason:   'no_plan',
      message:  'Refills are for members on Rishta 6 or Rishta 12. Choose a plan to get started.',
    };
  }

  // Cycle credits and purchased bonus credits both count — a refill is for a
  // member with nothing left, not one who simply spent this month's allowance
  // while still holding top-ups.
  const left = (profile.credits ?? 0) + (profile.bonus_credits ?? 0);
  if (left > 0) {
    return {
      eligible: false,
      reason:   'credits_remaining',
      message:  `You still have ${left} credit${left === 1 ? '' : 's'}. Refills unlock when you reach zero.`,
    };
  }

  return { eligible: true, reason: null, message: '' };
}

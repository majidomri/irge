/**
 * The phone-verification gate on purchased credits.
 *
 * ── The rule ─────────────────────────────────────────────────────────────────
 * A member who has PAID must have a verified mobile number before they can
 * spend a contact credit. Free welcome credits are unaffected — the gate exists
 * because money changed hands, not to tax the free tier.
 *
 * ── Why the gate is on spending, not on granting ─────────────────────────────
 * Credits go live the instant a member claims payment (see 008 §4) — before any
 * human has looked at the ledger. Withholding the GRANT until a phone is
 * verified would mean money leaves the member's account and nothing visibly
 * arrives, which is the single worst thing a checkout can do. So the grant is
 * untouched: the credits are theirs, they can see them on /account, and the
 * only thing that waits is the first spend. "Locked", not "missing".
 *
 * ── Where it is enforced ─────────────────────────────────────────────────────
 * Both places a contact credit is actually spent, and nowhere else:
 *   • POST /api/account/consume   (feature: 'contact') — the profile deck
 *   • POST /api/interests/reveal  — revealing an accepted interest
 * Both answer 403 with `code: PHONE_GATE_CODE` so the UI can offer the linking
 * form instead of the out-of-credits upsell.
 *
 * Audio and views are never gated: they are not what was bought.
 */
import { getPlan, LEGACY_PLAN_IDS } from '@/lib/plans';
import { firebasePhoneVerifyConfigured } from '@/lib/firebase-verify';
import type { ProfileState } from '@/lib/credits';

/**
 * Members whose purchase predates this instant are exempt — they paid under
 * rules that did not mention a phone number, and changing the deal after the
 * fact on someone who already handed over money is not something to do quietly.
 *
 * They are not exempt forever: `plan_started_at` moves to `now()` on every
 * activation, so a RENEWAL after this date is a fresh purchase under the new
 * rule and the gate applies from then on. The exemption ages out on its own.
 *
 * Override per-environment with PHONE_GATE_FROM (any Date-parseable string) —
 * useful for testing the gate against a staging account without editing code.
 * An unparseable value falls back to the constant rather than to "gate nobody",
 * so a typo cannot silently disarm this.
 */
const PHONE_GATE_FROM_DEFAULT = '2026-08-28T00:00:00Z';

const PHONE_GATE_FROM: number = (() => {
  const raw = process.env.PHONE_GATE_FROM?.trim();
  if (raw) {
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return parsed;
    console.warn('[phone-gate] PHONE_GATE_FROM is not a valid date:', raw, '— using the built-in cutoff');
  }
  return Date.parse(PHONE_GATE_FROM_DEFAULT);
})();

/** Machine-readable reason on the 403, so the client can branch on it. */
export const PHONE_GATE_CODE = 'phone_verification_required';

export const PHONE_GATE_STATUS = 403;

export const PHONE_GATE_BODY = {
  error: 'Verify your mobile number to unlock your credits.',
  code:  PHONE_GATE_CODE,
} as const;

/** The profile fields the gate reads. Keeps callers from passing whole rows around. */
type Purchasable = Pick<
  ProfileState,
  'plan' | 'bonus_credits' | 'plan_started_at' | 'created_at'
>;

/**
 * Has this account ever paid us?
 *
 * Three ways in, all of which mean "bought something":
 *   • an active term plan (ir6 / ir12),
 *   • a grandfathered legacy tier, still holding a balance it paid for,
 *   • bonus_credits — the persistent balance a top-up funds.
 *
 * Deliberately NOT "has credits": a free account's welcome credits are a gift,
 * and gating them would put a mobile number in front of the first thing a new
 * visitor tries to do.
 */
export function hasPurchased(profile: Purchasable): boolean {
  const plan = profile.plan ?? 'none';
  if (getPlan(plan)) return true;
  if ((LEGACY_PLAN_IDS as readonly string[]).includes(plan)) return true;
  return (profile.bonus_credits ?? 0) > 0;
}

/**
 * Did this account's purchase predate the rule? Grandfathered members are never
 * gated.
 *
 * `plan_started_at` is the signal, exactly as it should be: it is set to
 * `now()` by ir_activate_plan on every term activation, so it dates the
 * CURRENT purchase rather than the account.
 *
 * The fallback matters for one shape: a legacy refill-only buyer, who holds
 * bonus_credits but never activated a term, so `plan_started_at` is NULL.
 * Their profile's `created_at` stands in. It is slightly over-generous — an
 * old free account that buys after the cutoff would read as grandfathered — and
 * that is the deliberate direction to err in a grandfather clause. Refills now
 * require an active term (src/lib/topup.ts), so this shape cannot be created
 * any more; it only covers the accounts that already exist.
 */
export function isGrandfathered(profile: Purchasable): boolean {
  const anchor = profile.plan_started_at ?? profile.created_at;
  if (!anchor) return false;          // no date at all → treat as new
  const started = Date.parse(anchor);
  if (Number.isNaN(started)) return false;
  return started < PHONE_GATE_FROM;
}

/**
 * Whether a *verified* phone is on the session user.
 *
 * `phoneNumberVerified` is set only by better-auth's /phone-number/verify, which
 * our `verifyOTP` backs with a Firebase ID-token signature check — so this can
 * only be true if Google actually delivered an SMS to that number. It is never
 * writable from the client: the plugin rejects `/update-user` with a
 * phoneNumber, and the column is `input: false`.
 */
export function hasVerifiedPhone(user: { phoneNumberVerified?: boolean | null }): boolean {
  return user.phoneNumberVerified === true;
}

/**
 * The gate itself. `true` = block this spend and answer 403.
 *
 * Ordering matters: a free account never reaches the phone check at all.
 */
export function phoneGateBlocks(
  user: { phoneNumberVerified?: boolean | null },
  profile: Purchasable,
): boolean {
  // FAIL OPEN when verification is impossible. With the Firebase env unset the
  // linking form renders nothing (see PhoneLink), so blocking here would take a
  // member's money and leave them holding credits they cannot spend and no way
  // to fix it. This is a business rule, not a security control — the right
  // failure is to let the paying customer through.
  if (!firebasePhoneVerifyConfigured) return false;

  if (!hasPurchased(profile)) return false;   // free account — never gated
  if (isGrandfathered(profile)) return false; // paid before the rule existed
  return !hasVerifiedPhone(user);
}

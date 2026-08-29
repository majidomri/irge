/**
 * GET /api/account/profile
 * Returns the signed-in user's profile + live usage summary (credits, audio).
 * Also acts as ensure-profile AND as the lazy subscription tick: it guarantees
 * an ir_user_profiles row exists, expires a finished term, and applies any due
 * monthly credit refill. Gated by a better-auth session. Node runtime.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { serviceClient, getUsageSummary } from '@/lib/credits';
import { entitlementsFor, TOPUP, TOPUP_TOTAL_CREDITS } from '@/lib/plans';
import { hasPurchased, hasVerifiedPhone, isGrandfathered } from '@/lib/phone-gate';
import { topupEligibility } from '@/lib/topup';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = serviceClient();
  const summary = await getUsageSummary(
    db,
    session.user.id,
    session.user.email,
    session.user.name || null, // || not ?? — better-auth defaults name to '', not null
  );

  // Infinity isn't valid JSON — send null to mean "unlimited" on every axis.
  const unl = (n: number) => (Number.isFinite(n) ? n : null);

  // Phone-verification state for the /account card and the deck's credit gate.
  // `locked` is the one the UI should branch on: it is exactly the condition
  // under which a spend will be refused (see src/lib/phone-gate.ts).
  // Grandfathered members bought before the rule existed and are never gated,
  // so `required` must account for it or /account would nag them forever about
  // credits that are not actually locked.
  const required = hasPurchased(summary) && !isGrandfathered(summary);
  const verified = hasVerifiedPhone(session.user);

  const topup = topupEligibility(summary);

  return NextResponse.json({
    ...summary,
    entitlements: entitlementsFor(summary.plan),
    phone: {
      // The member's own number, shown back to them. Never exposed to anyone else.
      number:   session.user.phoneNumber ?? null,
      verified,
      required,
      locked:   required && !verified,
    },
    // Whether the credit refill is on offer right now, and why not if it isn't.
    // Lets /pricing and PaymentModal explain the rule instead of letting a
    // member tap through to a 409 from POST /api/orders.
    topup: {
      eligible: topup.eligible,
      reason:   topup.reason,
      message:  topup.message,
      price:    TOPUP.price,
      credits:  TOPUP_TOTAL_CREDITS,
    },
    audio: { remaining: unl(summary.audio.remaining), limit: summary.audio.limit },
    view:  { remaining: unl(summary.view.remaining),  limit: summary.view.limit },
  });
}

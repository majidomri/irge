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
import { entitlementsFor } from '@/lib/plans';

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

  return NextResponse.json({
    ...summary,
    entitlements: entitlementsFor(summary.plan),
    audio: { remaining: unl(summary.audio.remaining), limit: summary.audio.limit },
    view:  { remaining: unl(summary.view.remaining),  limit: summary.view.limit },
  });
}

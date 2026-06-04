/**
 * GET /api/account/profile
 * Returns the signed-in user's profile + live usage summary (credits, audio).
 * Also acts as ensure-profile: guarantees an ir_user_profiles row exists.
 * Gated by a better-auth session. Node runtime (better-auth uses pg).
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { serviceClient, getUsageSummary } from '@/lib/credits';

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
    session.user.name ?? null,
  );

  return NextResponse.json({
    ...summary,
    // Infinity isn't valid JSON — send null to mean "unlimited".
    view: { remaining: summary.view.remaining === Infinity ? null : summary.view.remaining, limit: summary.view.limit },
  });
}

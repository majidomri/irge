/**
 * POST /api/account/consume   body: { feature: 'contact' | 'audio' | 'view' }
 * Consumes one unit of a gated feature for the signed-in user.
 *   200 → allowed, returns { allowed:true, remaining }
 *   402 → out of credits / over the hourly limit, returns { allowed:false, remaining:0 }
 * Gated by a better-auth session. Node runtime.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { serviceClient, consume, USAGE_LIMITS, type UsageFeature } from '@/lib/credits';

export const runtime = 'nodejs';

const FEATURES = Object.keys(USAGE_LIMITS) as UsageFeature[];

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const feature = body?.feature as UsageFeature | undefined;
  if (!feature || !FEATURES.includes(feature)) {
    return NextResponse.json({ error: 'Invalid feature' }, { status: 400 });
  }

  const db = serviceClient();
  const result = await consume(db, session.user.id, session.user.email, feature);

  return NextResponse.json(
    { ...result, remaining: result.remaining === Infinity ? null : result.remaining },
    { status: result.allowed ? 200 : 402 },
  );
}

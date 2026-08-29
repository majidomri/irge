/**
 * POST /api/account/consume   body: { feature: 'contact' | 'audio' | 'view' }
 * Consumes one unit of a gated feature for the signed-in user.
 *   200 → allowed, returns { allowed:true, remaining }
 *   402 → out of credits / over the hourly limit, returns { allowed:false, remaining:0 }
 *   403 → a paid member whose mobile is not verified yet, returns
 *         { code:'phone_verification_required' } — see src/lib/phone-gate.ts
 * Gated by a better-auth session. Node runtime.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { serviceClient, consume, ensureProfile, USAGE_LIMITS, type UsageFeature } from '@/lib/credits';
import { phoneGateBlocks, PHONE_GATE_BODY, PHONE_GATE_STATUS } from '@/lib/phone-gate';

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

  // Purchased credits stay locked until the member's mobile is verified. Only
  // 'contact' is gated — audio and views are not what was bought. ensureProfile
  // is the same call consume() makes first, so this costs one extra idempotent
  // RPC on a path that is nowhere near hot.
  if (feature === 'contact') {
    const profile = await ensureProfile(db, session.user.email, session.user.name || null); // || not ?? — better-auth defaults name to '', not null
    if (phoneGateBlocks(session.user, profile)) {
      return NextResponse.json(PHONE_GATE_BODY, { status: PHONE_GATE_STATUS });
    }
  }

  const result = await consume(db, session.user.id, session.user.email, feature);

  return NextResponse.json(
    { ...result, remaining: result.remaining === Infinity ? null : result.remaining },
    { status: result.allowed ? 200 : 402 },
  );
}

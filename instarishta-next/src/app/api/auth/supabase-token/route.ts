/**
 * GET /api/auth/supabase-token
 * Mints a short-lived Supabase JWT for the signed-in better-auth user so the
 * browser can use Supabase Realtime + RLS as that user (the "session fabric").
 * Returns { token, profileId, email } — profileId is the RLS subject
 * (ir_user_profiles.id). 204 when the bridge is disabled (no SUPABASE_JWT_SECRET)
 * so the client cleanly falls back to polling. Node runtime.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { serviceClient, ensureProfile } from '@/lib/credits';
import { signSupabaseToken, SUPABASE_BRIDGE_ENABLED } from '@/lib/supabase-token';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!SUPABASE_BRIDGE_ENABLED) {
    return new NextResponse(null, { status: 204 }); // bridge off → client polls
  }

  const db = serviceClient();
  const profile = await ensureProfile(db, session.user.email, session.user.name || null); // || not ?? — better-auth defaults name to '', not null
  if (!profile.id) {
    return NextResponse.json({ error: 'No profile' }, { status: 500 });
  }

  const token = signSupabaseToken({ sub: profile.id, email: profile.email, ttlSeconds: 3600 });
  if (!token) return new NextResponse(null, { status: 204 });

  return NextResponse.json(
    { token, profileId: profile.id, email: profile.email },
    { headers: { 'Cache-Control': 'private, max-age=600' } }, // refresh well before 1h exp
  );
}

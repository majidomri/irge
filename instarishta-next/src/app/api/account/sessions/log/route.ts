/**
 * POST /api/account/sessions/log
 *
 * Server-side session logging — reads IP + geo from request headers
 * (Cloudflare populates these; Vercel/Netlify set their own variants)
 * and inserts/upserts a row in ir_user_sessions via the SECURITY DEFINER
 * RPC ir_log_session.
 *
 * The client could call the RPC directly, but it has no reliable way to
 * know its own IP. Doing this server-side also prevents users from
 * spoofing their location.
 *
 * Body: { session_uid: string, fp_hash: string }
 * Auth: caller's Bearer token (withUser).
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withUser } from '@/lib/typed-route';
import type { NextRequest } from 'next/server';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function getClientIP(req: NextRequest): string | null {
  return (
    req.headers.get('cf-connecting-ip')                    ??
    req.headers.get('x-real-ip')                           ??
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    null
  );
}

export const POST = withUser(async (req, { userId, body }) => {
  const sessionUid = body.session_uid as string | undefined;
  const fpHash     = body.fp_hash     as string | undefined;

  if (!sessionUid || sessionUid.length < 8) {
    return NextResponse.json({ error: 'session_uid required' }, { status: 400 });
  }

  const ip       = getClientIP(req);
  const country  = req.headers.get('cf-ipcountry');
  const city     = req.headers.get('cf-ipcity');
  const ua       = req.headers.get('user-agent')?.slice(0, 300) ?? null;

  const admin = serviceClient();

  // Upsert directly via the table — the SECURITY DEFINER RPC would work too,
  // but doing it here keeps the IP/UA write atomic with the auth check.
  const { error } = await admin.from('ir_user_sessions').upsert({
    user_id:      userId,
    session_uid:  sessionUid,
    fp_hash:      fpHash ?? null,
    ip,
    user_agent:   ua,
    country,
    city,
    last_seen_at: new Date().toISOString(),
    revoked_at:   null,
  }, { onConflict: 'user_id,session_uid' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ip, country, city });
});

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * POST /api/auth/ensure-profile
 * Called on every login. Guarantees ir_user_profiles row exists with 20 welcome
 * credits. Returns current {credits, plan, plan_expires_at, is_banned}.
 * Safe to call multiple times — upsert only sets credits on INSERT.
 */
export async function POST(req: NextRequest) {
  const bearer = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!bearer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = serviceClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser(bearer);
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // INSERT if missing (trigger already fires on signup, this is the safety net for
  // existing users and race conditions). ON CONFLICT DO NOTHING preserves existing credits.
  await sb.from('ir_user_profiles').upsert(
    { id: user.id, email: user.email, contact_credits: 20 },
    { onConflict: 'id', ignoreDuplicates: true },
  );

  // Always read current state after upsert
  const { data } = await sb
    .from('ir_user_profiles')
    .select('contact_credits, plan, plan_expires_at, is_banned')
    .eq('id', user.id)
    .single();

  return NextResponse.json({
    credits:         data?.contact_credits   ?? 20,
    plan:            data?.plan              ?? 'none',
    plan_expires_at: data?.plan_expires_at   ?? null,
    is_banned:       data?.is_banned         ?? false,
  });
}

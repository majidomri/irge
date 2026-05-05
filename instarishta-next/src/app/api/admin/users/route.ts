import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function verifyAdmin(req: NextRequest) {
  const bearer = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!bearer) return null;
  const { data: { user } } = await serviceClient().auth.getUser(bearer);
  if (!user) return null;
  const allowed = process.env.ADMIN_EMAILS;
  if (allowed && !allowed.split(',').map(e => e.trim()).includes(user.email ?? '')) return null;
  return user;
}

export async function GET(req: NextRequest) {
  const caller = await verifyAdmin(req);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = serviceClient();

  const { data: authData, error: authErr } = await sb.auth.admin.listUsers({ page: 1, perPage: 500 });
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });

  const { data: profiles } = await sb.from('ir_user_profiles').select('*');
  const profileMap = new Map((profiles ?? []).map((p: Record<string, unknown>) => [p.id as string, p]));

  const users = authData.users.map(u => ({
    id: u.id,
    email: u.email ?? '',
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at ?? null,
    banned: u.banned_until ? new Date(u.banned_until) > new Date() : false,
    ...((profileMap.get(u.id) ?? {}) as Record<string, unknown>),
    plan:             (profileMap.get(u.id) as Record<string, unknown>)?.plan ?? 'none',
    contact_credits:  (profileMap.get(u.id) as Record<string, unknown>)?.contact_credits ?? 0,
    plan_expires_at:  (profileMap.get(u.id) as Record<string, unknown>)?.plan_expires_at ?? null,
    is_banned:        (profileMap.get(u.id) as Record<string, unknown>)?.is_banned ?? false,
    full_name:        (profileMap.get(u.id) as Record<string, unknown>)?.full_name ?? null,
    notes:            (profileMap.get(u.id) as Record<string, unknown>)?.notes ?? null,
  }));

  return NextResponse.json({ users });
}

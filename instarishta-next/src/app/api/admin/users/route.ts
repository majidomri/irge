import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { withAdmin } from '@/lib/typed-route';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export const GET = withAdmin(async () => {
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
    plan:            (profileMap.get(u.id) as Record<string, unknown>)?.plan ?? 'none',
    contact_credits: (profileMap.get(u.id) as Record<string, unknown>)?.contact_credits ?? 0,
    plan_expires_at: (profileMap.get(u.id) as Record<string, unknown>)?.plan_expires_at ?? null,
    is_banned:       (profileMap.get(u.id) as Record<string, unknown>)?.is_banned ?? false,
    full_name:       (profileMap.get(u.id) as Record<string, unknown>)?.full_name ?? null,
    notes:           (profileMap.get(u.id) as Record<string, unknown>)?.notes ?? null,
  }));

  return NextResponse.json({ users });
});

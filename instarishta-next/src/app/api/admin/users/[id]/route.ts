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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await verifyAdmin(req);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body: Record<string, unknown> = await req.json();
  const sb = serviceClient();

  const profileFields: Record<string, unknown> = {};
  if ('plan'            in body) profileFields.plan            = body.plan;
  if ('contact_credits' in body) profileFields.contact_credits = body.contact_credits;
  if ('plan_expires_at' in body) profileFields.plan_expires_at = body.plan_expires_at;
  if ('full_name'       in body) profileFields.full_name       = body.full_name;
  if ('notes'           in body) profileFields.notes           = body.notes;
  if ('is_banned'       in body) profileFields.is_banned       = body.is_banned;

  if (Object.keys(profileFields).length) {
    profileFields.id = id;
    profileFields.updated_at = new Date().toISOString();
    const { error } = await sb.from('ir_user_profiles').upsert(profileFields, { onConflict: 'id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sync Supabase Auth ban state
  if ('is_banned' in body) {
    await sb.auth.admin.updateUserById(id, {
      ban_duration: body.is_banned ? '876600h' : 'none',
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await verifyAdmin(req);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sb = serviceClient();

  await sb.from('ir_user_profiles').delete().eq('id', id);
  const { error } = await sb.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

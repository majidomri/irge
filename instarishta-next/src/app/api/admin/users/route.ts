/**
 * GET   /api/admin/users           → list user profiles (credits / plan / ban)
 * PATCH /api/admin/users  { id, contact_credits?, plan?, is_banned? }
 *                                   → update one profile
 *
 * Admin-gated via withAdmin (better-auth session + ADMIN_EMAILS allowlist,
 * service-role DB). Updating contact_credits/plan here writes to
 * ir_user_profiles, which the user's open session picks up in real-time
 * through the session-fabric Realtime subscription. Node runtime.
 */
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/admin-route';

const COLS = 'id, email, full_name, contact_credits, plan, plan_expires_at, is_banned, created_at';

export const GET = withAdmin(async (req, { db }) => {
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim();
  let query = db.from('ir_user_profiles').select(COLS).order('created_at', { ascending: false }).limit(200);
  if (q) query = query.ilike('email', `%${q}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data ?? [] });
});

export const PATCH = withAdmin(async (_req, { db, body }) => {
  const id = typeof body.id === 'string' ? body.id : null;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.contact_credits === 'number' && body.contact_credits >= 0) {
    patch.contact_credits = Math.floor(body.contact_credits);
  }
  if (typeof body.plan === 'string') patch.plan = body.plan;
  if (typeof body.is_banned === 'boolean') patch.is_banned = body.is_banned;

  const { data, error } = await db
    .from('ir_user_profiles')
    .update(patch)
    .eq('id', id)
    .select(COLS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ user: data });
});

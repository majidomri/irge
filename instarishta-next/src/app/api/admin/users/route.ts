/**
 * GET   /api/admin/users           → list user profiles (credits / plan / ban)
 * PATCH /api/admin/users
 *   { id, activate: 'ir6'|'ir12' } → sell a subscription term (preferred)
 *   { id, bonus_add: number }      → grant persistent top-up credits
 *   { id, contact_credits?, plan?, is_banned? } → raw field edit (support override)
 *
 * Admin-gated via withAdmin (better-auth session + ADMIN_EMAILS allowlist,
 * service-role DB). Writes land on ir_user_profiles, which the user's open
 * session picks up in real-time through the session-fabric Realtime
 * subscription. Node runtime.
 *
 * Prefer `activate` over hand-editing plan/credits: it sets the term, the reset
 * anchor, the allowance and cycle 0 in one atomic call (ir_activate_plan). A
 * hand-set `plan` without plan_started_at will never reset — the monthly refill
 * is anchored on that column.
 */
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/admin-route';
import { entitlementsFor, FREE_ENTITLEMENTS, PLANS } from '@/lib/plans';

const COLS = 'id, email, full_name, contact_credits, bonus_credits, plan, plan_started_at, plan_expires_at, monthly_credits, credits_reset_at, is_banned, created_at';

/**
 * Each user is returned with the ENTITLEMENTS their plan grants plus their live
 * interest usage, so /nizam can show the full picture — contact credits,
 * interests, audio, term, expiry — instead of just a credit number.
 */
export const GET = withAdmin(async (req, { db }) => {
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim();
  let query = db.from('ir_user_profiles').select(COLS).order('created_at', { ascending: false }).limit(200);
  if (q) query = query.ilike('email', `%${q}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const users = (data ?? []) as { email: string }[];
  const emails = users.map(u => u.email).filter(Boolean);

  // Interest usage per user. Aggregated in one query and counted here rather
  // than N round-trips; interest volume is low enough that this stays cheap.
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: rows } = emails.length
    ? await db.from('ir_interests')
        .select('from_email, status, created_at')
        .in('from_email', emails)
        .limit(5000)
    : { data: [] as { from_email: string; status: string; created_at: string }[] };

  const usage = new Map<string, { month: number; total: number; accepted: number; connected: number }>();
  for (const r of (rows ?? []) as { from_email: string; status: string; created_at: string }[]) {
    const u = usage.get(r.from_email) ?? { month: 0, total: 0, accepted: 0, connected: 0 };
    u.total += 1;
    if (r.created_at >= since) u.month += 1;
    if (r.status === 'accepted')  u.accepted  += 1;
    if (r.status === 'connected') u.connected += 1;
    usage.set(r.from_email, u);
  }

  return NextResponse.json({
    users: users.map(u => ({
      ...u,
      entitlements: entitlementsFor((u as { plan?: string }).plan),
      interests: usage.get(u.email) ?? { month: 0, total: 0, accepted: 0, connected: 0 },
    })),
    // The catalog itself, so the admin UI never hardcodes plan numbers.
    catalog: [FREE_ENTITLEMENTS, ...PLANS.map(p => entitlementsFor(p.id))],
  });
});

export const PATCH = withAdmin(async (_req, { db, body }) => {
  const id = typeof body.id === 'string' ? body.id : null;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  // The RPCs below are keyed by email (the better-auth ↔ profile bridge), so
  // resolve it from the id the UI holds.
  const { data: target } = await db
    .from('ir_user_profiles').select('email').eq('id', id).maybeSingle();
  if (!target?.email) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // ── Sell a term ───────────────────────────────────────────────────────────
  if (body.activate === 'ir6' || body.activate === 'ir12') {
    const { error } = await db.rpc('ir_activate_plan', {
      p_email: target.email,
      p_plan:  body.activate,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data } = await db.from('ir_user_profiles').select(COLS).eq('id', id).single();
    return NextResponse.json({ user: data });
  }

  // ── Grant persistent top-up credits ───────────────────────────────────────
  // Added to bonus_credits, not contact_credits: the latter is the cycle
  // balance and gets overwritten at the next monthly reset.
  if (typeof body.bonus_add === 'number' && Number.isFinite(body.bonus_add)) {
    const { data: cur } = await db
      .from('ir_user_profiles').select('bonus_credits').eq('id', id).single();
    const next = Math.max(0, (cur?.bonus_credits ?? 0) + Math.floor(body.bonus_add));

    const { data, error } = await db
      .from('ir_user_profiles')
      .update({ bonus_credits: next, updated_at: new Date().toISOString() })
      .eq('id', id).select(COLS).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ user: data });
  }

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

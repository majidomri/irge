/**
 * GET   /api/admin/orders?status=pending_verification&q=<email|order id>
 * PATCH /api/admin/orders   { id, action: 'confirm' | 'reject', note? }
 *
 * The fallback path for settling payments when Telegram is not an option — bot
 * down, admin not in the group, or a message scrolled past. Same two RPCs the
 * Telegram webhook calls, so the two routes cannot disagree about what
 * confirming means.
 *
 * Admin-gated via withAdmin (better-auth session + ADMIN_EMAILS). Node runtime.
 */
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/admin-route';
import { describeOrder, formatAmount, ORDER_COLS, type Order, type OrderStatus } from '@/lib/orders';

const STATUSES: OrderStatus[] = ['created', 'pending_verification', 'confirmed', 'rejected', 'expired'];

export const GET = withAdmin(async (req, { db }) => {
  const url    = new URL(req.url);
  const status = url.searchParams.get('status')?.trim();
  const q      = url.searchParams.get('q')?.trim();

  let query = db.from('ir_orders').select(ORDER_COLS)
    .order('created_at', { ascending: false }).limit(200);

  // Default view is the only one that needs action.
  if (status && STATUSES.includes(status as OrderStatus)) query = query.eq('status', status);
  else if (!status)                                       query = query.eq('status', 'pending_verification');

  if (q) {
    // Strip the characters PostgREST's `or=` list treats as syntax — see the
    // same guard in /api/admin/users.
    const term = q.replace(/[,()*"']/g, ' ').trim();
    if (term) query = query.or(`id.eq.${term},email.ilike.%${term}%,utr.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const orders = (data ?? []) as Order[];
  return NextResponse.json({
    orders: orders.map(o => ({
      ...o,
      amount:      formatAmount(o.amount_paise),
      description: describeOrder(o.plan_id),
    })),
  });
});

export const PATCH = withAdmin(async (_req, { db, body, email }) => {
  const id     = typeof body.id === 'string' ? body.id : null;
  const action = body.action;
  const note   = typeof body.note === 'string' ? body.note.slice(0, 300) : null;

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  if (action !== 'confirm' && action !== 'reject') {
    return NextResponse.json({ error: "action must be 'confirm' or 'reject'" }, { status: 400 });
  }

  const { data, error } = action === 'confirm'
    ? await db.rpc('ir_confirm_order', { p_id: id, p_by: email }).single()
    : await db.rpc('ir_reject_order',  { p_id: id, p_by: email, p_note: note }).single();

  if (error) {
    // The RPCs raise on an order that is already settled — that is a conflict,
    // not a server fault, and the admin should see the current state.
    const { data: current } = await db
      .from('ir_orders').select(ORDER_COLS).eq('id', id).maybeSingle();
    return NextResponse.json({ error: error.message, order: current ?? null }, { status: 409 });
  }

  return NextResponse.json({ order: data });
});

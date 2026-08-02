/**
 * POST /api/orders   body: { plan: 'ir6' | 'ir12' | 'topup25' }
 *
 * Reserves a payable amount for the signed-in member and returns the order.
 * The client then navigates to /pay/<id>.
 *
 * The amount is NOT in the request and is never accepted from one — the plan id
 * is all the client gets to choose, and ir_create_order() looks the price up
 * server-side while it reserves the paise suffix in the same transaction.
 *
 * Repeat calls for the same plan return the SAME live order rather than minting
 * a new one, so reopening the modal never changes an amount the member has
 * already keyed into their UPI app. Node runtime.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { serviceClient } from '@/lib/credits';
import { isOrderPlanId, ORDER_COLS, type Order } from '@/lib/orders';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as { plan?: unknown };
  if (!isOrderPlanId(body.plan)) {
    return NextResponse.json({ error: 'Unknown plan' }, { status: 400 });
  }

  const db = serviceClient();
  const { data, error } = await db
    .rpc('ir_create_order', { p_email: session.user.email, p_plan: body.plan })
    .single<Order>();

  if (error || !data) {
    console.error('[orders] create failed', error);
    return NextResponse.json({ error: 'Could not start checkout' }, { status: 500 });
  }

  // Re-select through the public column list so prev_state can never leak, even
  // if the RPC's return type gains columns later.
  const { data: safe } = await db
    .from('ir_orders').select(ORDER_COLS).eq('id', data.id).single();

  return NextResponse.json({ order: safe ?? null }, { status: 201 });
}

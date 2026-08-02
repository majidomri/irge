/**
 * GET /api/orders/[id] → the order, for the member who owns it.
 *
 * This is what the checkout page polls. In a hosted gateway the equivalent
 * endpoint is fed by the acquirer's webhook, so it flips to `paid` on its own;
 * here nothing external ever moves an order, so what the poll actually watches
 * for is the admin's ✅ landing (pending_verification → confirmed) or the
 * sweep's claw-back (→ rejected). The member's credits are already live either
 * way — see 008 §4. Node runtime.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { serviceClient } from '@/lib/credits';
import { ORDER_COLS, type Order } from '@/lib/orders';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const db = serviceClient();
  const { data } = await db
    .from('ir_orders').select(ORDER_COLS).eq('id', id).maybeSingle<Order>();

  // Someone else's order is reported as missing rather than forbidden: a 403
  // would confirm the id exists, which is exactly what an id-guesser wants.
  if (!data || data.email !== session.user.email) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ order: data });
}

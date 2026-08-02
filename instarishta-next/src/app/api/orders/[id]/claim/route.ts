/**
 * POST /api/orders/[id]/claim   body: { utr?: string }
 *
 * The member says they have paid. This is the moment credits go live.
 *
 * There is no payment processor to ask, so this endpoint trusts the claim and
 * grants immediately, recording a snapshot that makes the grant reversible. The
 * member gets what they bought in seconds; the admin gets a Telegram message
 * with ✅ / ❌ and 24 hours to look at the PhonePe ledger before the sweep
 * revokes it automatically. See 008 §4 and §7.
 *
 * `utr` is optional and purely a human aid — reconciliation is by the amount's
 * unique paise suffix, so a member who cannot find their UTR is not blocked.
 *
 * Idempotent: the RPC returns an already-claimed order untouched, and Telegram
 * is only notified on the transition, so a double-tap does not double-grant or
 * double-message. Node runtime.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { serviceClient } from '@/lib/credits';
import {
  ORDER_COLS, describeOrder, formatAmount, paiseSuffix, UPI_VPA, type Order,
} from '@/lib/orders';
import { sendMessage, esc } from '@/lib/telegram';

export const runtime = 'nodejs';

/** Long enough for a real reference, short enough to keep junk out of Telegram. */
const UTR_MAX = 40;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { utr?: unknown };
  const utr  = typeof body.utr === 'string' ? body.utr.trim().slice(0, UTR_MAX) : null;

  const db = serviceClient();

  // Ownership is checked here so a stranger's id 404s the same way it does on
  // GET, rather than surfacing the RPC's exception text.
  const { data: existing } = await db
    .from('ir_orders').select(ORDER_COLS).eq('id', id).maybeSingle<Order>();
  if (!existing || existing.email !== session.user.email) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const alreadyClaimed = existing.status !== 'created';

  const { data: order, error } = await db
    .rpc('ir_claim_order', { p_id: id, p_email: session.user.email, p_utr: utr })
    .single<Order>();

  if (error || !order) {
    console.error('[orders] claim failed', id, error);
    // The RPC raises for expired / settled orders. Re-read so the client can
    // render the real state instead of a generic failure.
    const { data: current } = await db
      .from('ir_orders').select(ORDER_COLS).eq('id', id).maybeSingle<Order>();
    return NextResponse.json(
      { error: 'Could not confirm this payment', order: current ?? null },
      { status: 409 },
    );
  }

  // What the member now holds, so the UI can say "30 credits added" truthfully
  // rather than assuming the grant matched the catalog.
  const { data: profile } = await db
    .from('ir_user_profiles')
    .select('plan, contact_credits, bonus_credits, plan_expires_at, credits_reset_at')
    .eq('email', session.user.email)
    .maybeSingle();

  if (!alreadyClaimed) {
    await notifyAdmin(order, profile as ProfileSnapshot | null);
  }

  return NextResponse.json({ order, profile: profile ?? null });
}

interface ProfileSnapshot {
  plan: string;
  contact_credits: number;
  bonus_credits: number | null;
  plan_expires_at: string | null;
}

/**
 * The one message the whole manual step hangs off. It has to carry everything
 * needed to make the decision — above all the exact amount, because matching
 * that against the PhonePe ledger IS the verification.
 */
async function notifyAdmin(order: Order, profile: ProfileSnapshot | null) {
  const info   = describeOrder(order.plan_id);
  const amount = formatAmount(order.amount_paise);

  const lines = [
    `<b>💰 Payment claimed — verify in PhonePe</b>`,
    ``,
    `<b>Amount:</b> <code>₹${amount}</code>  ← match the <b>.${paiseSuffix(order.amount_paise)}</b> exactly`,
    `<b>Into:</b> ${esc(UPI_VPA)}`,
    ``,
    `<b>Member:</b> <code>${esc(order.email)}</code>`,
    `<b>Bought:</b> ${esc(info.label)} — ${esc(info.detail)}`,
    `<b>UTR:</b> ${order.utr ? `<code>${esc(order.utr)}</code>` : '<i>not provided</i>'}`,
    `<b>Order:</b> <code>${esc(order.id)}</code>`,
    ...(profile ? [
      ``,
      `<b>Now holds:</b> ${esc(profile.plan)} · ${profile.contact_credits} cycle`
        + ` + ${profile.bonus_credits ?? 0} top-up credits`,
    ] : []),
    ``,
    `⚠️ <b>Credits are already live.</b> Confirm once you see ₹${amount} credited,`,
    `or reject to take them straight back.`,
    `Auto-revokes in 24h if nobody taps.`,
  ];

  await sendMessage(lines.join('\n'), [[
    { text: `✅ Confirm ₹${amount}`, callback_data: `ok:${order.id}` },
    { text: '❌ Reject',             callback_data: `no:${order.id}` },
  ]]);
}

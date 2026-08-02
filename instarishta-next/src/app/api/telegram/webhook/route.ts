/**
 * POST /api/telegram/webhook — the admin's one-tap confirm/reject.
 *
 * Receives Telegram updates and acts on the ✅ / ❌ buttons attached to the
 * "payment claimed" messages sent by /api/orders/[id]/claim. Tapping ✅ settles
 * the order; tapping ❌ settles it and restores the member's pre-purchase
 * balance from the snapshot taken at claim time.
 *
 * This endpoint moves money-equivalent state from an unauthenticated public URL,
 * so it is gated twice:
 *   1. the secret token Telegram echoes in X-Telegram-Bot-Api-Secret-Token,
 *      which proves the request came from Telegram, and
 *   2. an allowlist of admin Telegram user ids, which proves the tap came from
 *      someone entitled to approve payments rather than any group member who
 *      can see the buttons.
 * Both fail closed: unset config means the route refuses everything.
 *
 * ── Registering it ───────────────────────────────────────────────────────────
 *   curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
 *     -H 'Content-Type: application/json' \
 *     -d '{"url":"https://instarishta.me/api/telegram/webhook",
 *          "secret_token":"<TELEGRAM_WEBHOOK_SECRET>",
 *          "allowed_updates":["callback_query"]}'
 *
 * Find an admin's numeric id by having them tap a button once and reading the
 * "not on the allowlist" line this route logs. Node runtime.
 */
import { NextRequest, NextResponse } from 'next/server';
import { serviceClient } from '@/lib/credits';
import { describeOrder, formatAmount, ORDER_COLS, type Order } from '@/lib/orders';
import { answerCallbackQuery, editMessageText, esc } from '@/lib/telegram';

export const runtime = 'nodejs';

interface CallbackQuery {
  id:   string;
  data?: string;
  from: { id: number; username?: string; first_name?: string };
  message?: { message_id: number; chat: { id: number } };
}

/** Numeric Telegram user ids permitted to settle orders. */
function admins(): Set<string> {
  return new Set(
    (process.env.TELEGRAM_ADMIN_IDS ?? '')
      .split(',').map(s => s.trim()).filter(Boolean),
  );
}

export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error('[telegram-webhook] TELEGRAM_WEBHOOK_SECRET unset — refusing');
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  if (req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = await req.json().catch(() => null) as { callback_query?: CallbackQuery } | null;
  const cq = update?.callback_query;

  // Anything that is not a button tap is acknowledged and ignored — Telegram
  // retries on a non-200, and we do not want it retrying chatter forever.
  if (!cq?.data || !cq.message) return NextResponse.json({ ok: true });

  const allowed = admins();
  if (allowed.size === 0) {
    console.error('[telegram-webhook] TELEGRAM_ADMIN_IDS unset — refusing all taps');
    await answerCallbackQuery(cq.id, 'Not configured: no admin ids set.', true);
    return NextResponse.json({ ok: true });
  }
  if (!allowed.has(String(cq.from.id))) {
    console.warn(`[telegram-webhook] rejected tap from ${cq.from.id} (@${cq.from.username ?? '?'}) — add this id to TELEGRAM_ADMIN_IDS to allow it`);
    await answerCallbackQuery(cq.id, 'You are not authorised to settle payments.', true);
    return NextResponse.json({ ok: true });
  }

  const [action, orderId] = cq.data.split(':');
  if ((action !== 'ok' && action !== 'no') || !orderId) {
    await answerCallbackQuery(cq.id);
    return NextResponse.json({ ok: true });
  }

  const by = `tg:${cq.from.id}${cq.from.username ? ` @${cq.from.username}` : ''}`;
  const db = serviceClient();

  const { data: order, error } = action === 'ok'
    ? await db.rpc('ir_confirm_order', { p_id: orderId, p_by: by }).single<Order>()
    : await db.rpc('ir_reject_order',  { p_id: orderId, p_by: by, p_note: 'Rejected from Telegram' }).single<Order>();

  if (error || !order) {
    console.error('[telegram-webhook] settle failed', orderId, error);
    // Most likely cause by far: the sweep already revoked it, or the other admin
    // tapped first. Say which, instead of a bare failure.
    const { data: current } = await db
      .from('ir_orders').select(ORDER_COLS).eq('id', orderId).maybeSingle<Order>();
    await answerCallbackQuery(
      cq.id,
      current ? `Already settled — this order is ${current.status}.` : 'Order not found.',
      true,
    );
    if (current) {
      await editMessageText(cq.message.chat.id, cq.message.message_id, summary(current));
    }
    return NextResponse.json({ ok: true });
  }

  await answerCallbackQuery(
    cq.id,
    action === 'ok' ? 'Confirmed. Credits stay.' : 'Rejected. Credits revoked.',
  );
  await editMessageText(cq.message.chat.id, cq.message.message_id, summary(order));

  return NextResponse.json({ ok: true });
}

/** What the message becomes once settled — the buttons are gone, so this is the record. */
function summary(order: Order): string {
  const info   = describeOrder(order.plan_id);
  const amount = formatAmount(order.amount_paise);

  const head =
    order.status === 'confirmed' ? '✅ <b>Payment confirmed</b>'
  : order.status === 'rejected'  ? '❌ <b>Payment rejected — credits revoked</b>'
  : order.status === 'expired'   ? '⌛ <b>Order expired</b>'
  :                                'ℹ️ <b>Order updated</b>';

  return [
    head,
    ``,
    `<b>Amount:</b> <code>₹${amount}</code>`,
    `<b>Member:</b> <code>${esc(order.email)}</code>`,
    `<b>Bought:</b> ${esc(info.label)} — ${esc(info.detail)}`,
    `<b>Order:</b> <code>${esc(order.id)}</code>`,
    ...(order.resolved_by ? [`<b>By:</b> ${esc(order.resolved_by)}`] : []),
    ...(order.note        ? [`<b>Note:</b> ${esc(order.note)}`]      : []),
  ].join('\n');
}

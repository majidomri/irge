/**
 * GET|POST /api/cron/orders?grace=24
 *
 * The other half of optimistic granting. Releases the paise suffixes of orders
 * nobody paid, and claws back credits from claims no admin confirmed within the
 * grace window. Without this running, an ignored ✅ is a permanent free plan.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` (or `?secret=`), matching
 * /api/cron/renewals. Fails closed when CRON_SECRET is unset.
 *
 * 008 §7 also schedules ir_sweep_orders() hourly via pg_cron. This route exists
 * because pg_cron is not enabled on the project yet, and because a revocation
 * should tell somebody — pg_cron has no way to reach Telegram. Running both is
 * harmless: the sweep is idempotent. Node runtime.
 */
import { NextRequest, NextResponse } from 'next/server';
import { serviceClient } from '@/lib/credits';
import { describeOrder, formatAmount, ORDER_COLS, type Order } from '@/lib/orders';
import { sendMessage, esc } from '@/lib/telegram';

export const runtime = 'nodejs';

interface SweepResult {
  expired:     number;
  revoked:     number;
  revoked_ids: string[];
}

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;                       // fail closed
  const header = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  const query  = new URL(req.url).searchParams.get('secret')?.trim();
  return header === secret || query === secret;
}

async function run(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const grace = Math.min(168, Math.max(1, Number(new URL(req.url).searchParams.get('grace')) || 24));

  const db = serviceClient();
  const { data, error } = await db.rpc('ir_sweep_orders', { p_grace_hours: grace }).single<SweepResult>();

  if (error || !data) {
    console.error('[cron/orders] sweep failed', error);
    return NextResponse.json({ error: error?.message ?? 'Sweep failed' }, { status: 500 });
  }

  if (data.revoked > 0) await notify(db, data, grace);

  return NextResponse.json({ ok: true, ...data });
}

export const GET  = run;
export const POST = run;

/**
 * A revocation is the one outcome a human must see: either somebody paid and we
 * failed to confirm in time (a member just lost credits they are owed), or
 * somebody claimed a payment they never made. Both need eyes.
 */
async function notify(
  db: ReturnType<typeof serviceClient>,
  result: SweepResult,
  grace: number,
) {
  const { data } = await db
    .from('ir_orders').select(ORDER_COLS).in('id', result.revoked_ids);
  const orders = (data ?? []) as Order[];

  const lines = [
    `<b>⏱️ ${result.revoked} unconfirmed payment${result.revoked === 1 ? '' : 's'} revoked</b>`,
    ``,
    `Nobody confirmed ${result.revoked === 1 ? 'it' : 'them'} within ${grace}h, so the credits were taken back.`,
    ``,
    ...orders.map(o =>
      `• <code>₹${formatAmount(o.amount_paise)}</code> — ${esc(describeOrder(o.plan_id).label)}\n`
      + `  <code>${esc(o.email)}</code> · order <code>${esc(o.id)}</code>`,
    ),
    ``,
    `<b>Check the ledger for these amounts.</b> If any of them did arrive, the member`,
    `paid and lost their credits — re-grant in /nizam and apologise.`,
  ];

  await sendMessage(lines.join('\n'));
}

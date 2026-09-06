/**
 * Release unpaid orders and claw back credits from unconfirmed claims.
 *
 * This is the durable version of /api/cron/orders, and it exists for one
 * specific reason. That route calls ir_sweep_orders — which revokes credits,
 * irreversibly — and then sends a Telegram message. If the message fails, the
 * revocation has still happened and nobody is told. The route's own comment
 * says a revocation "is the one outcome a human must see": either a member
 * just lost credits they are owed, or somebody claimed a payment they never
 * made. Both need eyes, and a dropped notification means neither gets them.
 *
 * Splitting it into steps fixes exactly that. Each step.run is checkpointed:
 * once the sweep has committed, a later failure retries only the failing step,
 * never the sweep. And the revocation is written to the audit table before any
 * notification is attempted, so the record survives even if every retry of the
 * message fails.
 *
 * The HTTP route stays as it is. It is what the hand-testing used, it is
 * callable with ?grace=720 to see what a run would do, and having two entry
 * points to an idempotent sweep costs nothing.
 */
import { cron } from 'inngest';

import { inngest } from '@/inngest/client';
import { serviceClient } from '@/lib/credits';
import { describeOrder, formatAmount, ORDER_COLS, type Order } from '@/lib/orders';
import { esc, sendMessage } from '@/lib/telegram';

interface SweepResult {
  expired: number;
  revoked: number;
  revoked_ids: string[];
}

/** Matches the route's default; the sweep clamps anything unreasonable. */
const GRACE_HOURS = 24;

export const ordersSweep = inngest.createFunction(
  {
    id: 'orders-sweep',
    name: 'Release unpaid orders and revoke unconfirmed claims',

    triggers: [
      // 05:00 IST. The HTTP route remains available for ad-hoc runs.
      cron('TZ=Asia/Kolkata 0 5 * * *'),
    ],

    /**
     * Strictly serial. Two sweeps overlapping would both read the same
     * unconfirmed claims; the RPC is idempotent, but there is no reason to
     * make it prove that.
     */
    concurrency: { limit: 1, scope: 'fn' },

    /**
     * Two retries, not more. The sweep is idempotent so a retry is safe, but a
     * missed tick is better than a stuck queue — tomorrow's run catches
     * anything today's missed, because the grace window is measured from the
     * order, not from the run.
     */
    retries: 2,
  },
  async ({ step, logger }) => {
    const db = serviceClient();

    // ── 1. The irreversible part, checkpointed on its own ────────────────────
    const result = await step.run('sweep-orders', async () => {
      const { data, error } = await db
        .rpc('ir_sweep_orders', { p_grace_hours: GRACE_HOURS })
        .single<SweepResult>();

      if (error || !data) {
        // Thrown, not swallowed: this is the one step worth retrying loudly.
        throw new Error(`ir_sweep_orders failed: ${error?.message ?? 'no result'}`);
      }
      return data;
    });

    logger.info({ ...result }, 'orders-sweep completed');

    if (result.revoked === 0) {
      return { ok: true, ...result, notified: false };
    }

    // ── 2. The permanent record, before anyone is told ───────────────────────
    // The whole point of the rewrite. If every notification attempt fails, the
    // revocation is still written down somewhere a person can find it.
    await step.run('record-revocations', async () => {
      const { error } = await db.from('ir_moderation_actions').insert({
        action: 'revoke-credits',
        subject_type: 'order',
        subject_id: result.revoked_ids.slice(0, 40).join(','),
        actor: 'cron:orders-sweep',
        reason: `Unconfirmed beyond ${GRACE_HOURS}h grace`,
        detail: { expired: result.expired, revoked: result.revoked, ids: result.revoked_ids },
      });

      if (error) throw new Error(`audit insert failed: ${error.message}`);
      return { recorded: result.revoked_ids.length };
    });

    // ── 3. Telling a human, retried independently ────────────────────────────
    await step.run('notify-telegram', async () => {
      const { data } = await db
        .from('ir_orders')
        .select(ORDER_COLS)
        .in('id', result.revoked_ids);

      const orders = (data ?? []) as Order[];

      // Same message the HTTP route sends — including the closing instruction,
      // which is the part that actually tells an admin what to do about it.
      const lines = [
        `<b>⏱️ ${result.revoked} unconfirmed payment${result.revoked === 1 ? '' : 's'} revoked</b>`,
        ``,
        `Nobody confirmed ${result.revoked === 1 ? 'it' : 'them'} within ${GRACE_HOURS}h, so the credits were taken back.`,
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
      return { sent: true, orders: orders.length };
    });

    return { ok: true, ...result, notified: true };
  },
);

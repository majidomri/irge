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
 *
 * ---------------------------------------------------------------------------
 * There is a third entry point, and it is the one that actually runs.
 *
 * pg_cron job #2 in this database is `SELECT public.ir_sweep_orders();` on
 * `7 * * * *` — hourly, 24 runs a day, confirmed in cron.job_run_details. This
 * function and the HTTP route are both scheduled daily. So by the time either
 * of them runs, the hourly job has almost always swept already and they find
 * nothing to report.
 *
 * That matters because the RPC is only half the job. Checked against the
 * function source: ir_sweep_orders writes no audit row and sends no message —
 * the ir_moderation_actions insert and the Telegram alert are in *this* file
 * and in the route, not in the database. A revocation picked up by the hourly
 * job therefore produces neither.
 *
 * Not yet a live incident, and worth being exact about why: the sweep has only
 * ever expired unclaimed orders (6 expired, 0 revoked at the time of writing),
 * and expiry is the harmless half. Zero rows in ir_moderation_actions for
 * 'revoke-credits' is consistent with nothing having been revoked, not with a
 * revocation having been swallowed. But the first real revocation would land
 * on the hourly job, silently, which is precisely the outcome the top of this
 * comment says must not happen.
 *
 * Fixing it is a scheduling decision rather than a code change — disabling
 * cron job #2 so revocation only ever runs through an audited path, or moving
 * the audit and notification into the RPC — and it touches live payment
 * infrastructure, so it is written down here rather than done quietly.
 * ---------------------------------------------------------------------------
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

/**
 * Orders listed individually before the message says "and N more".
 *
 * Telegram refuses a message over 4096 characters — a 400 for the whole thing,
 * not a truncated one — and each order line here is about 110. So a sweep that
 * revoked more than roughly thirty-five produced no notification at all, with
 * the failure most likely exactly when the sweep was largest. lib/telegram now
 * clamps as a safety net; this cap is what keeps the message readable, because
 * a clamped list ends mid-sentence and a counted one does not.
 */
const LIST_CAP = 25;

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
        ...orders.slice(0, LIST_CAP).map(o =>
          `• <code>₹${formatAmount(o.amount_paise)}</code> — ${esc(describeOrder(o.plan_id).label)}\n`
          + `  <code>${esc(o.email)}</code> · order <code>${esc(o.id)}</code>`,
        ),
        orders.length > LIST_CAP
          ? `<i>… and ${orders.length - LIST_CAP} more. Full list in /nizam.</i>`
          : '',
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

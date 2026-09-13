/**
 * The campaign runner, and the scheduler that starts it.
 *
 * ── Why a durable function and not a request ─────────────────────────────────
 * A campaign of a few thousand messages outlives any HTTP request, and a
 * promotional one may have to wait overnight for 09:00 IST. Each batch is a
 * checkpointed step, so a deploy or crash resumes at the next batch rather than
 * the first; and the waiting is a step.sleepUntil, which costs nothing while it
 * sleeps.
 *
 * The rows are the real state (see lib/messaging/dispatch.ts). This function
 * only decides when to take the next batch, so running it twice for the same
 * campaign is harmless — the per-row claim stops a double send — but the
 * concurrency key makes that the exception rather than the design.
 */
import { cron, eventType } from 'inngest';

import { inngest } from '@/inngest/client';
import { serviceClient } from '@/lib/credits';
import { runCampaignBatch } from '@/lib/messaging/dispatch';

export const campaignRunEvent = eventType('messaging/campaign.run');

/** Batches per run. 400 × 50 = 20,000 — twice the per-campaign ceiling. */
const MAX_BATCHES = 400;
const BATCH_SIZE  = 50;

export const messagingCampaignRun = inngest.createFunction(
  {
    id: 'messaging-campaign-run',
    name: 'Send a messaging campaign',
    triggers: [campaignRunEvent],
    concurrency: { limit: 1, key: 'event.data.campaignId' },
    retries: 3,
  },
  async ({ event, step }) => {
    const campaignId = String((event.data as { campaignId?: string })?.campaignId ?? '');
    if (!campaignId) return { ok: false, error: 'no campaignId' };

    let sent = 0;
    for (let i = 0; i < MAX_BATCHES; i++) {
      const r = await step.run(`batch-${i}`, () => runCampaignBatch(serviceClient(), campaignId, BATCH_SIZE));
      sent += r.processed;

      if (r.waitUntil) {
        await step.sleepUntil(`window-${i}`, r.waitUntil);
        continue;
      }
      if (r.done) return { ok: !r.stopped, sent, stopped: r.stopped ?? null };
    }
    return { ok: true, sent, note: 'batch ceiling reached; remaining rows stay queued' };
  },
);

/** Every five minutes: start scheduled campaigns whose time has come. */
export const messagingScheduler = inngest.createFunction(
  {
    id: 'messaging-scheduler',
    name: 'Start scheduled messaging campaigns',
    triggers: [cron('TZ=Asia/Kolkata */5 * * * *')],
    concurrency: { limit: 1, scope: 'fn' },
    retries: 1,
  },
  async ({ step }) => {
    const due = await step.run('claim-due', async () => {
      const db = serviceClient();
      const { data } = await db.from('ir_msg_campaigns')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('status', 'scheduled').lte('scheduled_at', new Date().toISOString())
        .select('id');
      return (data ?? []).map((r: { id: string }) => r.id);
    });

    if (due.length) {
      await step.sendEvent('start-runs', due.map(id => campaignRunEvent.create({ campaignId: id })));
    }
    return { started: due.length };
  },
);

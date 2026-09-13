/**
 * /api/admin/messaging/campaigns/[id]
 *
 * GET     detail: campaign, template, status counts, skip reasons, messages page
 * PATCH   { action, … } — rebuild | launch | schedule | pause | resume | cancel | run_batch
 * DELETE  drafts only
 *
 * ── Launch has to name the number it is launching ────────────────────────────
 * `launch` and `schedule` require `expectQueued`, the queued count the admin
 * was looking at when they pressed the button. If the audience changed in the
 * meantime — a rebuild in another tab, members opting out — the numbers differ
 * and the launch is refused. The admin confirms a specific send, not whatever
 * the campaign has become since.
 */
import { NextResponse } from 'next/server';

import { campaignRunEvent } from '@/inngest/functions/messaging-campaign';
import { inngest } from '@/inngest/client';
import { withAdmin, type AdminDb } from '@/lib/admin-route';
import { buildCampaign, runCampaignBatch } from '@/lib/messaging/dispatch';
import { templateProblems } from '@/lib/messaging/compliance';
import { activeProvider } from '@/lib/messaging/providers';
import { loadCtas, loadSettings, loadTemplate } from '@/lib/messaging/store';

export const runtime = 'nodejs';

async function counts(db: AdminDb, id: string) {
  const { data } = await db.rpc('ir_msg_campaign_stats', { p_campaign: id });
  return Object.fromEntries(((data ?? []) as { status: string; n: number }[]).map(s => [s.status, s.n])) as Record<string, number>;
}

export const GET = withAdmin(async (req, { db, params }) => {
  const id = params.id;
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const page = Math.max(0, Number(url.searchParams.get('page') ?? 0));

  const { data: campaign } = await db.from('ir_msg_campaigns')
    .select('*, template:ir_msg_templates(id, name, channel, category, body, variables)')
    .eq('id', id).maybeSingle();
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let q = db.from('ir_msg_messages')
    .select('id, phone, email, status, skip_reason, error, body, segments, mode, provider_message_id, submitted_at, delivered_at, read_at, created_at')
    .eq('campaign_id', id).order('created_at').range(page * 100, page * 100 + 99);
  if (status) q = q.eq('status', status);
  const { data: messages } = await q;

  const { data: skipped } = await db.from('ir_msg_messages').select('skip_reason')
    .eq('campaign_id', id).eq('status', 'skipped').limit(20_000);
  const reasons: Record<string, number> = {};
  for (const r of (skipped ?? []) as { skip_reason: string | null }[]) {
    const k = r.skip_reason ?? 'unknown';
    reasons[k] = (reasons[k] ?? 0) + 1;
  }

  return NextResponse.json({ campaign, counts: await counts(db, id), reasons, messages: messages ?? [], page });
});

export const PATCH = withAdmin(async (_req, { db, params, body }) => {
  const id = params.id;
  const action = String(body.action ?? '');

  const { data: c } = await db.from('ir_msg_campaigns').select('*').eq('id', id).maybeSingle();
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

  switch (action) {
    case 'rebuild': {
      if ('variables' in body && body.variables && typeof body.variables === 'object') {
        await db.from('ir_msg_campaigns').update({ variables: body.variables }).eq('id', id);
      }
      const build = await buildCampaign(db, id);
      if (!build.ok) return NextResponse.json({ error: build.problems[0], problems: build.problems }, { status: 400 });
      return NextResponse.json({ ok: true, build });
    }

    case 'launch':
    case 'schedule': {
      if (c.status !== 'draft' && !(action === 'launch' && c.status === 'scheduled')) {
        return bad(`Campaign is ${c.status}`);
      }
      const now = await counts(db, id);
      const queued = now.queued ?? 0;
      if (queued === 0) return bad('Nothing queued — every recipient was skipped');
      if (Number(body.expectQueued) !== queued) {
        return NextResponse.json({ error: `The audience changed: ${queued} are queued now, not ${body.expectQueued}. Review and confirm again.`, queued }, { status: 409 });
      }

      const settings = await loadSettings(db);
      const loaded = await loadTemplate(db, c.template_id);
      const problems = loaded ? templateProblems(loaded.template, loaded.sender, settings, await loadCtas(db)) : ['Template not found'];
      const ready = activeProvider().readiness();
      if (!ready.ready) problems.push(`Provider not ready: ${[...ready.missing, ...ready.notes].join('; ')}`);
      if (problems.length) return NextResponse.json({ error: problems[0], problems }, { status: 400 });

      if (action === 'schedule') {
        const at = new Date(String(body.at ?? ''));
        if (Number.isNaN(at.getTime()) || at.getTime() < Date.now() + 60_000) return bad('Pick a time at least a minute from now');
        await db.from('ir_msg_campaigns').update({ status: 'scheduled', scheduled_at: at.toISOString(), last_error: null }).eq('id', id);
        return NextResponse.json({ ok: true, status: 'scheduled' });
      }

      await db.from('ir_msg_campaigns').update({ status: 'running', started_at: new Date().toISOString(), last_error: null }).eq('id', id);
      return startRunner(id);
    }

    case 'pause':
      if (!['running', 'scheduled'].includes(c.status)) return bad(`Campaign is ${c.status}`);
      await db.from('ir_msg_campaigns').update({ status: 'paused' }).eq('id', id);
      return NextResponse.json({ ok: true, status: 'paused' });

    case 'resume':
      if (!['paused', 'failed'].includes(c.status)) return bad(`Campaign is ${c.status}`);
      await db.from('ir_msg_campaigns').update({ status: 'running', last_error: null }).eq('id', id);
      return startRunner(id);

    case 'cancel': {
      if (['completed', 'cancelled'].includes(c.status)) return bad(`Campaign is already ${c.status}`);
      await db.from('ir_msg_campaigns').update({ status: 'cancelled', completed_at: new Date().toISOString() }).eq('id', id);
      await db.from('ir_msg_messages').update({ status: 'skipped', skip_reason: 'campaign cancelled' })
        .eq('campaign_id', id).eq('status', 'queued');
      return NextResponse.json({ ok: true, status: 'cancelled' });
    }

    // The manual fallback when the background runner is not available (local
    // dev without the Inngest dev server, or an Inngest outage). Same function
    // the runner calls, so it enforces the same window, cap and opt-outs.
    case 'run_batch': {
      if (c.status !== 'running') return bad(`Campaign is ${c.status} — launch or resume it first`);
      const r = await runCampaignBatch(db, id, 50);
      return NextResponse.json({ ok: true, batch: r });
    }

    default:
      return bad('Unknown action');
  }
});

async function startRunner(id: string) {
  try {
    await inngest.send(campaignRunEvent.create({ campaignId: id }));
    return NextResponse.json({ ok: true, status: 'running', runner: 'background' });
  } catch (e) {
    // Still marked running: the rows are queued and "Send next batch" works.
    return NextResponse.json({
      ok: true, status: 'running', runner: 'manual',
      warning: `Background runner unavailable (${(e as Error).message}). Use “Send next batch”.`,
    });
  }
}

export const DELETE = withAdmin(async (_req, { db, params }) => {
  const { data: c } = await db.from('ir_msg_campaigns').select('status').eq('id', params.id).maybeSingle();
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (c.status !== 'draft') return NextResponse.json({ error: 'Only drafts can be deleted; cancel it instead' }, { status: 409 });
  await db.from('ir_msg_campaigns').delete().eq('id', params.id);
  return NextResponse.json({ ok: true });
});

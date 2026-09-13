/**
 * GET  /api/admin/messaging/campaigns — list, newest first, with live counts.
 * POST /api/admin/messaging/campaigns — create a draft and build its rows.
 *
 * Body: { name, templateId, variables, audience: { kind, numbers? } }
 *
 * Creating builds immediately, so the admin sees "412 will receive it, 38
 * skipped (no consent 31, opted out 7)" before anything can be launched.
 */
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/admin-route';
import { buildCampaign, type Audience } from '@/lib/messaging/dispatch';

export const runtime = 'nodejs';

function parseAudience(raw: unknown): Audience | null {
  const a = (raw ?? {}) as Record<string, unknown>;
  if (a.kind === 'consented_members') return { kind: 'consented_members' };
  if (a.kind === 'test_numbers')      return { kind: 'test_numbers' };
  if (a.kind === 'numbers' && Array.isArray(a.numbers)) return { kind: 'numbers', numbers: a.numbers.map(String).slice(0, 20_000) };
  return null;
}

export const GET = withAdmin(async (_req, { db }) => {
  const { data, error } = await db.from('ir_msg_campaigns')
    .select('*, template:ir_msg_templates(id, name, channel, category)')
    .order('created_at', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Per-status counts for the visible campaigns, in one query per campaign.
  // At a hundred rows and a grouped count each this is cheap, and it keeps the
  // numbers true instead of maintained by hand.
  const campaigns = await Promise.all((data ?? []).map(async (c: { id: string }) => {
    const { data: stats } = await db.rpc('ir_msg_campaign_stats', { p_campaign: c.id });
    const counts = Object.fromEntries(((stats ?? []) as { status: string; n: number }[]).map(s => [s.status, s.n]));
    return { ...c, counts };
  }));

  return NextResponse.json({ campaigns });
});

export const POST = withAdmin(async (_req, { db, body, email }) => {
  const name = String(body.name ?? '').trim();
  const templateId = String(body.templateId ?? '');
  const audience = parseAudience(body.audience);
  const variables = (body.variables && typeof body.variables === 'object' ? body.variables : {}) as Record<string, string>;

  const problems: string[] = [];
  if (!name) problems.push('Name is required');
  if (!templateId) problems.push('Pick a template');
  if (!audience) problems.push('Pick an audience');
  if (problems.length) return NextResponse.json({ error: problems[0], problems }, { status: 400 });

  const { data: c, error } = await db.from('ir_msg_campaigns').insert({
    name, template_id: templateId, variables, audience, created_by: email,
  }).select('id').single();
  if (error || !c) return NextResponse.json({ error: error?.message ?? 'Could not create' }, { status: 500 });

  const build = await buildCampaign(db, c.id);
  if (!build.ok) {
    // A draft that cannot be built is not worth keeping — its whole purpose
    // was to show the admin the audience, and there is none to show.
    await db.from('ir_msg_campaigns').delete().eq('id', c.id);
    return NextResponse.json({ error: build.problems[0], problems: build.problems }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id: c.id, build });
});

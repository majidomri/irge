/**
 * GET /api/admin/messaging/overview — everything the Messaging tab's first
 * screen needs in one round trip: provider readiness, settings, a setup
 * checklist, and the last 7 days of volume.
 *
 * The checklist is computed here, not in the browser, so "ready to send" means
 * the same thing on this screen as it does in the send path.
 */
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/admin-route';
import { activeProvider } from '@/lib/messaging/providers';
import { loadSettings } from '@/lib/messaging/store';

export const runtime = 'nodejs';

export const GET = withAdmin(async (req, { db }) => {
  const settings = await loadSettings(db);
  const provider = activeProvider();
  const readiness = provider.readiness();

  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [senders, templates, campaigns, recent, optouts, ctas] = await Promise.all([
    db.from('ir_msg_senders').select('channel, status'),
    db.from('ir_msg_templates').select('channel, status'),
    db.from('ir_msg_campaigns').select('id, name, status, total, skipped, scheduled_at, created_at, last_error')
      .order('created_at', { ascending: false }).limit(5),
    db.from('ir_msg_messages').select('channel, status, mode').gte('created_at', since).limit(20_000),
    db.from('ir_msg_optouts').select('phone', { count: 'exact', head: true }),
    db.from('ir_msg_ctas').select('id', { count: 'exact', head: true }).eq('status', 'active'),
  ]);

  const approved = (rows: { channel: string; status: string }[] | null, channel: string) =>
    (rows ?? []).filter(r => r.channel === channel && r.status === 'approved').length;

  const s = senders.data as { channel: string; status: string }[] | null;
  const t = templates.data as { channel: string; status: string }[] | null;

  const origin = new URL(req.url).origin;
  const checklist = [
    { key: 'entity',     label: 'DLT entity ID saved',                   done: !!settings.dlt_entity_id },
    { key: 'ctas',       label: 'Links / call-back numbers whitelisted (CTA)', done: (ctas.count ?? 0) > 0 },
    { key: 'sms_sender', label: 'An approved SMS header',                done: approved(s, 'sms') > 0 },
    { key: 'sms_tpl',    label: 'An approved SMS template',              done: approved(t, 'sms') > 0 },
    { key: 'rcs_sender', label: 'An RCS bot ID',                         done: approved(s, 'rcs') > 0 },
    { key: 'rcs_tpl',    label: 'An approved RCS template',              done: approved(t, 'rcs') > 0 },
    { key: 'tests',      label: 'Test numbers listed',                   done: settings.test_numbers.length > 0 },
    { key: 'provider',   label: `Provider connected (${provider.label})`, done: readiness.ready && readiness.reachesPhones },
    { key: 'webhook',    label: 'Delivery webhook secret set',           done: !!process.env.OJIVA_WEBHOOK_SECRET?.trim() },
  ];

  const volume: Record<string, number> = {};
  for (const m of (recent.data ?? []) as { status: string }[]) volume[m.status] = (volume[m.status] ?? 0) + 1;

  return NextResponse.json({
    provider: { id: provider.id, label: provider.label, ...readiness },
    settings,
    checklist,
    webhookUrl: `${origin}/api/messaging/webhook/ojiva?token=<OJIVA_WEBHOOK_SECRET>`,
    volume,
    optouts: optouts.count ?? 0,
    campaigns: campaigns.data ?? [],
  });
});

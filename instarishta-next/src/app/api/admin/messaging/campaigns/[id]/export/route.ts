/**
 * GET /api/admin/messaging/campaigns/[id]/export?format=variables|message|schedule
 *
 * The campaign's QUEUED recipients as a CSV in Nexus's own upload formats, so
 * a campaign built and compliance-checked here can be sent from the Nexus
 * panel while the API integration is pending. The column layouts are copied
 * from Nexus's sample files:
 *
 *   variables  mobile,name,var1,var2…               (sms_template.csv)
 *   message    mobile,name,message                  (recurring_sample.csv)
 *   schedule   mobile,name,message,schedule_date,schedule_time  (auto_schedule_sample.csv)
 *
 * Only queued rows: skipped recipients (no consent, opted out, test mode) are
 * the whole point of building here, and exporting them would undo it.
 *
 * Name the Nexus campaign exactly like this one. Importing its delivery report
 * afterwards then matches rows back by campaign name and number.
 */
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/admin-route';
import { toCsv } from '@/lib/messaging/csv';

export const runtime = 'nodejs';

export const GET = withAdmin(async (req, { db, params }) => {
  const format = new URL(req.url).searchParams.get('format') ?? 'variables';

  const { data: c } = await db.from('ir_msg_campaigns')
    .select('id, name, scheduled_at, template:ir_msg_templates(variables)').eq('id', params.id).maybeSingle();
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: rows } = await db.from('ir_msg_messages')
    .select('phone, email, body, variables').eq('campaign_id', params.id).eq('status', 'queued')
    .order('created_at').limit(20_000);
  const list = (rows ?? []) as { phone: string; email: string | null; body: string; variables: Record<string, string> }[];
  if (!list.length) return NextResponse.json({ error: 'No queued recipients to export' }, { status: 400 });

  // Names come from the member list when the recipient is a member.
  const { data: members } = await db.rpc('ir_rcs_audience');
  const nameByPhone = new Map(((members ?? []) as { phone: string | null; name: string | null }[])
    .filter(m => m.phone).map(m => [m.phone!, m.name ?? '']));

  const mobile = (p: string) => p.replace(/^\+91/, '');     // Nexus samples use 10 digits
  const template = (Array.isArray(c.template) ? c.template[0] : c.template) as { variables: { key: string }[] } | null;
  const keys = (template?.variables ?? []).map(v => v.key);

  let csv: string;
  if (format === 'message') {
    csv = toCsv(['mobile', 'name', 'message'], list.map(r => [mobile(r.phone), nameByPhone.get(r.phone) ?? '', r.body]));
  } else if (format === 'schedule') {
    const at = c.scheduled_at ? new Date(c.scheduled_at) : null;
    const ist = at ? new Date(at.getTime() + 330 * 60_000).toISOString() : '';
    csv = toCsv(['mobile', 'name', 'message', 'schedule_date', 'schedule_time'],
      list.map(r => [mobile(r.phone), nameByPhone.get(r.phone) ?? '', r.body, ist.slice(0, 10), ist.slice(11, 16)]));
  } else {
    csv = toCsv(['mobile', 'name', ...keys.map((_, i) => `var${i + 1}`)],
      list.map(r => [mobile(r.phone), nameByPhone.get(r.phone) ?? '', ...keys.map(k => r.variables?.[k] ?? '')]));
  }

  const safe = c.name.replace(/[^\w.-]+/g, '_').slice(0, 60);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safe}_${format}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});

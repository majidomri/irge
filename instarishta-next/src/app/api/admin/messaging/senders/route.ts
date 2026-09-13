/**
 * /api/admin/messaging/senders — DLT headers (SMS) and RCS bot ids.
 *
 * GET                       list
 * POST   { channel, sender_code, category, dlt_header_id?, status?, label?, notes? }
 * PATCH  { id, ...fields }
 * DELETE { id }             refused while a template uses it
 */
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/admin-route';
import { CATEGORIES, SMS_HEADER } from '@/lib/messaging/dlt';

export const runtime = 'nodejs';

const STATUSES = ['pending', 'approved', 'rejected', 'inactive'];

function clean(body: Record<string, unknown>, partial: boolean) {
  const out: Record<string, unknown> = {};
  const problems: string[] = [];

  if (!partial || 'channel' in body) {
    if (body.channel !== 'sms' && body.channel !== 'rcs') problems.push('Channel must be SMS or RCS');
    out.channel = body.channel;
  }
  if (!partial || 'sender_code' in body) {
    const code = String(body.sender_code ?? '').trim();
    const channel = body.channel ?? 'sms';
    if (!code) problems.push('Sender code is required');
    else if (channel === 'sms' && !SMS_HEADER.test(code.toUpperCase())) problems.push('SMS header should be 3–11 letters or digits, e.g. INSRTA');
    out.sender_code = channel === 'sms' ? code.toUpperCase() : code;
  }
  if (!partial || 'category' in body) {
    if (!CATEGORIES.some(c => c.value === body.category)) problems.push('Pick a DLT category');
    out.category = body.category;
  }
  if ('status' in body) {
    if (!STATUSES.includes(String(body.status))) problems.push('Invalid status');
    out.status = body.status;
  }
  for (const k of ['dlt_header_id', 'label', 'notes'] as const) {
    if (k in body) out[k] = String(body[k] ?? '').trim() || null;
  }
  return { out, problems };
}

export const GET = withAdmin(async (_req, { db }) => {
  const { data, error } = await db.from('ir_msg_senders').select('*').order('channel').order('created_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ senders: data ?? [] });
});

export const POST = withAdmin(async (_req, { db, body, email }) => {
  const { out, problems } = clean(body, false);
  if (problems.length) return NextResponse.json({ error: problems[0], problems }, { status: 400 });

  const { data, error } = await db.from('ir_msg_senders').insert({ ...out, created_by: email }).select('*').single();
  if (error?.code === '23505') return NextResponse.json({ error: 'That sender already exists' }, { status: 409 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, sender: data });
});

export const PATCH = withAdmin(async (_req, { db, body }) => {
  const id = String(body.id ?? '');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  // Channel is fixed once created: templates are bound to a sender by channel.
  const { id: _omit, channel: _ch, ...rest } = body;
  void _omit; void _ch;
  const { data: existing } = await db.from('ir_msg_senders').select('channel').eq('id', id).maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { out, problems } = clean({ ...rest, channel: existing.channel }, true);
  delete out.channel;
  if (problems.length) return NextResponse.json({ error: problems[0], problems }, { status: 400 });

  const { data, error } = await db.from('ir_msg_senders').update(out).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, sender: data });
});

export const DELETE = withAdmin(async (_req, { db, body }) => {
  const id = String(body.id ?? '');
  const { count } = await db.from('ir_msg_templates').select('id', { count: 'exact', head: true }).eq('sender_id', id);
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: `${count} template(s) use this sender — mark it inactive instead` }, { status: 409 });
  }
  const { error } = await db.from('ir_msg_senders').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
});

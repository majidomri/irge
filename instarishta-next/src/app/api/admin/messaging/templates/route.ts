/**
 * /api/admin/messaging/templates — the DLT-approved content registry.
 *
 * GET                  list, with each template's sender
 * POST   { … }         create
 * PATCH  { id, … }     update
 * DELETE { id }        refused once any campaign or message references it
 *
 * The body is stored exactly as approved. Validation checks the things that
 * would make a send silently scrubbed: slot count vs variables, a missing DLT
 * id on SMS, a sender of the wrong channel.
 */
import { NextResponse } from 'next/server';

import { withAdmin, type AdminDb } from '@/lib/admin-route';
import { CATEGORIES, countSlots, DEFAULT_VAR_MAX, DLT_ID, slotTypes, type TemplateVariable } from '@/lib/messaging/dlt';
import { validatePayload, type RcsPayload } from '@/lib/rcs/messages';

export const runtime = 'nodejs';

const STATUSES = ['draft', 'pending', 'approved', 'rejected', 'paused'];

/** Variables, with each one's type taken from its {#…#} slot in the body. */
function cleanVariables(raw: unknown, body: string): { vars: TemplateVariable[]; problems: string[] } {
  const problems: string[] = [];
  if (!Array.isArray(raw)) return { vars: [], problems };
  const types = slotTypes(body);
  const seen = new Set<string>();
  const vars = raw.map((v, i) => {
    const o = (v ?? {}) as Record<string, unknown>;
    const key = String(o.key ?? '').trim().replace(/[^a-z0-9_]/gi, '_').toLowerCase() || `var${i + 1}`;
    if (seen.has(key)) problems.push(`Variable key “${key}” is used twice`);
    seen.add(key);
    const max = Number(o.max ?? DEFAULT_VAR_MAX);
    if (!Number.isInteger(max) || max < 1 || max > 500) problems.push(`Variable ${i + 1}: max length must be 1–500`);
    return {
      key,
      label:  String(o.label ?? '').trim() || `Variable ${i + 1}`,
      sample: String(o.sample ?? '').trim() || undefined,
      max,
      type:   types[i] ?? 'var',
    };
  });
  return { vars, problems };
}

async function validate(db: AdminDb, row: Record<string, unknown>) {
  const problems: string[] = [];
  if (!String(row.name ?? '').trim()) problems.push('Name is required');
  if (row.channel !== 'sms' && row.channel !== 'rcs') problems.push('Channel must be SMS or RCS');
  if (!CATEGORIES.some(c => c.value === row.category)) problems.push('Pick a DLT category');
  if (!STATUSES.includes(String(row.status))) problems.push('Invalid status');

  const body = String(row.body ?? '');
  if (!body.trim()) problems.push('Approved text is required');

  const vars = row.variables as TemplateVariable[];
  const slots = countSlots(body);
  if (slots !== vars.length) problems.push(`Text has ${slots} {#…#} slot(s) but ${vars.length} variable(s) are defined`);

  // Required to SEND, so required to be approved. A template can be registered
  // here as pending and given its ID when the portal issues it.
  const dlt = String(row.dlt_template_id ?? '');
  if (row.channel === 'sms' && !dlt && row.status === 'approved') {
    problems.push('Approved SMS templates need the DLT template ID — save as pending until you have it');
  }
  if (dlt && !DLT_ID.test(dlt)) problems.push('DLT template ID must be 19 digits');

  if (row.sender_id) {
    const { data: s } = await db.from('ir_msg_senders').select('channel').eq('id', row.sender_id).maybeSingle();
    if (!s) problems.push('Sender not found');
    else if (s.channel !== row.channel) problems.push('Sender and template channels differ');
  }

  if (row.rcs_payload) {
    if (row.channel !== 'rcs') problems.push('Rich content is only for RCS templates');
    else problems.push(...validatePayload(row.rcs_payload as RcsPayload).map(p => `Rich content: ${p}`));
  }
  return problems;
}

function pick(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of ['name', 'channel', 'category', 'status', 'body', 'notes', 'provider_template_id'] as const) {
    if (k in body) out[k] = typeof body[k] === 'string' ? (k === 'body' ? body[k] : (body[k] as string).trim()) : body[k];
  }
  if ('dlt_template_id' in body) out.dlt_template_id = String(body.dlt_template_id ?? '').replace(/\s/g, '') || null;
  if ('sender_id' in body)       out.sender_id = body.sender_id || null;
  if ('rcs_payload' in body)     out.rcs_payload = body.rcs_payload || null;
  if (out.provider_template_id === '') out.provider_template_id = null;
  return out;
}

export const GET = withAdmin(async (_req, { db }) => {
  const { data, error } = await db.from('ir_msg_templates')
    .select('*, sender:ir_msg_senders(id, sender_code, channel, category, status)')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data ?? [] });
});

export const POST = withAdmin(async (_req, { db, body, email }) => {
  const { vars, problems: vp } = cleanVariables(body.variables, String(body.body ?? ''));
  const row = { status: 'approved', ...pick(body), variables: vars };
  const problems = [...vp, ...(await validate(db, row))];
  if (problems.length) return NextResponse.json({ error: problems[0], problems }, { status: 400 });

  const { data, error } = await db.from('ir_msg_templates').insert({ ...row, created_by: email }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, template: data });
});

export const PATCH = withAdmin(async (_req, { db, body }) => {
  const id = String(body.id ?? '');
  const { data: existing } = await db.from('ir_msg_templates').select('*').eq('id', id).maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const patch = pick(body);
  let vp: string[] = [];
  if ('variables' in body) {
    const c = cleanVariables(body.variables, String(body.body ?? existing.body));
    patch.variables = c.vars; vp = c.problems;
  }
  const merged = { ...existing, ...patch };
  const problems = [...vp, ...(await validate(db, merged))];
  if (problems.length) return NextResponse.json({ error: problems[0], problems }, { status: 400 });

  // The approved text is what live campaigns rendered from. Changing it under a
  // running campaign would make queued rows disagree with the registry.
  if ('body' in patch && patch.body !== existing.body) {
    const { count } = await db.from('ir_msg_campaigns').select('id', { count: 'exact', head: true })
      .eq('template_id', id).in('status', ['scheduled', 'running', 'paused']);
    if ((count ?? 0) > 0) {
      return NextResponse.json({ error: 'A scheduled, running or paused campaign uses this template — finish or cancel it before changing the text' }, { status: 409 });
    }
  }

  const { data, error } = await db.from('ir_msg_templates').update(patch).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, template: data });
});

export const DELETE = withAdmin(async (_req, { db, body }) => {
  const id = String(body.id ?? '');
  const [{ count: camps }, { count: msgs }] = await Promise.all([
    db.from('ir_msg_campaigns').select('id', { count: 'exact', head: true }).eq('template_id', id),
    db.from('ir_msg_messages').select('id', { count: 'exact', head: true }).eq('template_id', id),
  ]);
  if ((camps ?? 0) + (msgs ?? 0) > 0) {
    return NextResponse.json({ error: 'This template has been used — set it to paused instead of deleting, so the log keeps its source' }, { status: 409 });
  }
  const { error } = await db.from('ir_msg_templates').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
});

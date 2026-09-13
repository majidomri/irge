/**
 * /api/admin/messaging/ctas — the DLT CTA whitelist (URLs and call-back numbers).
 *
 * GET                  list, active and inactive
 * POST   { … }         add
 * PATCH  { id, … }     update
 * DELETE { id }
 *
 * Entries mirror the DLT portal's CTA list. Adding one here does not whitelist
 * anything with the operator — it only tells the send path what already is.
 */
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/admin-route';
import { DLT_ID, normalizeUrl, toE164 } from '@/lib/messaging/dlt';

export const runtime = 'nodejs';

function clean(body: Record<string, unknown>, partial: boolean) {
  const out: Record<string, unknown> = {};
  const problems: string[] = [];

  if (!partial || 'name' in body) {
    out.name = String(body.name ?? '').trim();
    if (!out.name) problems.push('Name is required');
  }
  if (!partial || 'cta_type' in body) {
    if (!['url', 'phone', 'apk', 'other'].includes(String(body.cta_type))) problems.push('Pick a CTA type');
    out.cta_type = body.cta_type;
  }
  if (!partial || 'sub_type' in body) {
    out.sub_type = body.sub_type === 'dynamic' ? 'dynamic' : 'static';
  }
  if (!partial || 'value' in body) {
    const v = String(body.value ?? '').trim();
    const type = body.cta_type;
    if (!v) problems.push('Value is required');
    else if ((type === 'url' || type === 'apk') && !/^https?:\/\/[^\s/]+\.[^\s]+/i.test(v)) problems.push('URL must start with http:// or https:// — enter it exactly as whitelisted');
    else if (type === 'phone' && !toE164(v) && !/^1800\d{7}$/.test(v.replace(/\D/g, ''))) problems.push('Not a recognisable phone number');
    out.value = v;
  }
  if ('dlt_cta_id' in body) {
    const id = String(body.dlt_cta_id ?? '').replace(/\s/g, '');
    if (id && !DLT_ID.test(id)) problems.push('DLT CTA ID must be 19 digits');
    out.dlt_cta_id = id || null;
  }
  if ('status' in body) out.status = body.status === 'inactive' ? 'inactive' : 'active';
  if ('notes' in body)  out.notes = String(body.notes ?? '').trim() || null;
  return { out, problems };
}

export const GET = withAdmin(async (_req, { db }) => {
  const { data, error } = await db.from('ir_msg_ctas').select('*').order('created_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    ctas: (data ?? []).map((c: { value: string; cta_type: string }) => ({
      ...c,
      // What a message has to contain to match, shown so the admin can see
      // that www and the bare domain are not interchangeable.
      matches: c.cta_type === 'url' || c.cta_type === 'apk' ? normalizeUrl(c.value) : c.value,
    })),
  });
});

export const POST = withAdmin(async (_req, { db, body, email }) => {
  const { out, problems } = clean(body, false);
  if (problems.length) return NextResponse.json({ error: problems[0], problems }, { status: 400 });
  const { data, error } = await db.from('ir_msg_ctas').insert({ ...out, created_by: email }).select('*').single();
  if (error?.code === '23505') return NextResponse.json({ error: 'That DLT CTA ID is already listed' }, { status: 409 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, cta: data });
});

export const PATCH = withAdmin(async (_req, { db, body }) => {
  const id = String(body.id ?? '');
  const { data: existing } = await db.from('ir_msg_ctas').select('cta_type').eq('id', id).maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { out, problems } = clean({ cta_type: existing.cta_type, ...body }, true);
  delete (out as { id?: unknown }).id;
  if (problems.length) return NextResponse.json({ error: problems[0], problems }, { status: 400 });
  const { data, error } = await db.from('ir_msg_ctas').update(out).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, cta: data });
});

export const DELETE = withAdmin(async (_req, { db, body }) => {
  const { error } = await db.from('ir_msg_ctas').delete().eq('id', String(body.id ?? ''));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
});

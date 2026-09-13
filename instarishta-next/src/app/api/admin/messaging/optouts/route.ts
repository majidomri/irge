/**
 * /api/admin/messaging/optouts
 *
 * GET                      list
 * POST   { phones, reason } block numbers (admin source)
 * DELETE { phone }          remove — ONLY an admin-added block
 *
 * An admin can always add a block; stopping messages is never the unsafe
 * direction. An admin cannot lift a block the member placed by replying STOP:
 * that is the member withdrawing consent, and it is theirs to reverse.
 */
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/admin-route';
import { parseNumbers } from '@/lib/messaging/dlt';

export const runtime = 'nodejs';

export const GET = withAdmin(async (_req, { db }) => {
  const { data, error } = await db.from('ir_msg_optouts').select('*').order('created_at', { ascending: false }).limit(2000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ optouts: data ?? [] });
});

export const POST = withAdmin(async (_req, { db, body, email }) => {
  const raw = Array.isArray(body.phones) ? body.phones.join('\n') : String(body.phones ?? '');
  const { valid, invalid } = parseNumbers(raw);
  if (!valid.length) return NextResponse.json({ error: 'No valid numbers', invalid }, { status: 400 });

  const reason = String(body.reason ?? '').trim().slice(0, 200) || null;
  const { error } = await db.from('ir_msg_optouts').upsert(
    valid.map(phone => ({ phone, source: 'admin', reason, created_by: email })),
    { onConflict: 'phone', ignoreDuplicates: true },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Queued messages to these numbers must not go out.
  await db.from('ir_msg_messages').update({ status: 'skipped', skip_reason: 'opted out' })
    .in('phone', valid).eq('status', 'queued');

  return NextResponse.json({ ok: true, added: valid.length, invalid });
});

export const DELETE = withAdmin(async (_req, { db, body }) => {
  const phone = String(body.phone ?? '');
  const { data } = await db.from('ir_msg_optouts').select('source').eq('phone', phone).maybeSingle();
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (data.source !== 'admin') {
    return NextResponse.json({ error: 'This opt-out came from the member — only they can reverse it, by opting in again' }, { status: 403 });
  }
  const { error } = await db.from('ir_msg_optouts').delete().eq('phone', phone);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
});

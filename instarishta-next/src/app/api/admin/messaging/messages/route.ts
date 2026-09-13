/**
 * GET /api/admin/messaging/messages — the send log.
 *
 * Query: status, channel, mode, phone (substring), campaign ('none' = test sends), page
 */
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/admin-route';

export const runtime = 'nodejs';

const PAGE = 100;

export const GET = withAdmin(async (req, { db }) => {
  const u = new URL(req.url).searchParams;
  const page = Math.max(0, Number(u.get('page') ?? 0));

  let q = db.from('ir_msg_messages')
    .select('id, campaign_id, channel, category, sender_code, phone, email, body, status, skip_reason, error, error_code, mode, provider, provider_message_id, segments, sent_by, created_at, submitted_at, delivered_at, read_at, campaign:ir_msg_campaigns(name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * PAGE, page * PAGE + PAGE - 1);

  const status = u.get('status');   if (status)  q = q.eq('status', status);
  const channel = u.get('channel'); if (channel) q = q.eq('channel', channel);
  const mode = u.get('mode');       if (mode)    q = q.eq('mode', mode);
  const phone = u.get('phone')?.replace(/[^\d+]/g, '');
  if (phone) q = q.ilike('phone', `%${phone}%`);
  const campaign = u.get('campaign');
  if (campaign === 'none') q = q.is('campaign_id', null);
  else if (campaign) q = q.eq('campaign_id', campaign);

  const { data, count, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Receipts for the rows on screen, so a row can show its own history.
  const ids = (data ?? []).map((m: { id: string }) => m.id);
  const { data: events } = ids.length
    ? await db.from('ir_msg_events').select('message_id, event_type, error, text, created_at').in('message_id', ids).order('created_at')
    : { data: [] };

  return NextResponse.json({ messages: data ?? [], events: events ?? [], total: count ?? 0, page, pageSize: PAGE });
});

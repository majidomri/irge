/**
 * GET   /api/admin/comments  → recent comment feed, newest first
 * PATCH /api/admin/comments { id, hidden }  → moderate one comment
 *
 * Comments are public (see migration 010_channel_comments.sql), so unlike
 * private interests they need a quick moderation path. `hidden` is a soft
 * delete — the row stays for audit, /api/comments just stops returning it.
 *
 * Admin-gated via withAdmin. Node runtime (inherited from withAdmin).
 */
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/admin-route';

const COLS = 'id, entity_type, entity_id, user_id, author_name, chip_key, hidden, created_at';

export const GET = withAdmin(async (req, { db }) => {
  const url    = new URL(req.url);
  const hidden = url.searchParams.get('hidden'); // '1' to see only hidden, otherwise all

  let query = db.from('ir_comments').select(COLS).order('created_at', { ascending: false }).limit(200);
  if (hidden === '1') query = query.eq('hidden', true);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comments: data ?? [] });
});

export const PATCH = withAdmin(async (_req, { db, body }) => {
  const id = typeof body.id === 'string' ? body.id : null;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  if (typeof body.hidden !== 'boolean') {
    return NextResponse.json({ error: 'Missing hidden' }, { status: 400 });
  }

  const { data, error } = await db
    .from('ir_comments').update({ hidden: body.hidden }).eq('id', id).select(COLS).single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comment: data });
});

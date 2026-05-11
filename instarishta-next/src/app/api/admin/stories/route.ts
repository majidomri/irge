/**
 * GET    /api/admin/stories?channel_id=  — list stories for a channel
 * POST   /api/admin/stories               — create story
 * DELETE /api/admin/stories?id=           — delete story
 */
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/admin-route';

export const GET = withAdmin(async (req, { db }) => {
  const channelId = new URL(req.url).searchParams.get('channel_id');
  if (!channelId) return NextResponse.json({ error: 'channel_id required' }, { status: 400 });

  const { data, error } = await db
    .from('ir_stories')
    .select('id, channel_id, image, caption, created_at')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ stories: data ?? [] });
});

export const POST = withAdmin(async (_req, { body, db }) => {
  const channelId = String(body.channel_id ?? '').trim();
  const image     = String(body.image      ?? '').trim();
  const caption   = String(body.caption    ?? '').trim() || null;

  if (!channelId) return NextResponse.json({ error: 'channel_id required' }, { status: 400 });
  if (!image)     return NextResponse.json({ error: 'image required' },      { status: 400 });

  const { data, error } = await db
    .from('ir_stories')
    .insert({ channel_id: channelId, image, caption })
    .select('id, channel_id, image, caption, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ story: data });
});

export const DELETE = withAdmin(async (req, { db }) => {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { error } = await db.from('ir_stories').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
});

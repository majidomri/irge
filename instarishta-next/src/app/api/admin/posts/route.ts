/**
 * GET    /api/admin/posts?channel_id=  — list posts for a channel
 * POST   /api/admin/posts               — create new post
 * DELETE /api/admin/posts?id=           — delete post
 */
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/admin-route';

export const GET = withAdmin(async (req, { db }) => {
  const channelId = new URL(req.url).searchParams.get('channel_id');
  if (!channelId) return NextResponse.json({ error: 'channel_id required' }, { status: 400 });

  const { data, error } = await db
    .from('ir_posts')
    .select('id, channel_id, title, caption, image, audio_url, created_at')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ posts: data ?? [] });
});

export const POST = withAdmin(async (_req, { body, db }) => {
  const channelId = String(body.channel_id ?? '').trim();
  const title     = String(body.title      ?? '').trim() || null;
  const caption   = String(body.caption    ?? '').trim() || null;
  const image     = String(body.image      ?? '').trim() || null;
  const audioUrl  = String(body.audio_url  ?? '').trim() || null;

  if (!channelId) return NextResponse.json({ error: 'channel_id required' }, { status: 400 });
  if (!caption && !image && !audioUrl) {
    return NextResponse.json({ error: 'post must have caption, image, or audio' }, { status: 400 });
  }

  const { data, error } = await db
    .from('ir_posts')
    .insert({ channel_id: channelId, title, caption, image, audio_url: audioUrl })
    .select('id, channel_id, title, caption, image, audio_url, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ post: data });
});

export const DELETE = withAdmin(async (req, { db }) => {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { error } = await db.from('ir_posts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
});

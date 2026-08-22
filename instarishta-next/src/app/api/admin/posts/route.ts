/**
 * GET    /api/admin/posts?channel_id=  — list posts for a channel
 * POST   /api/admin/posts               — create new post
 * DELETE /api/admin/posts?id=           — delete post
 *
 * A post's `user_id` is what lets the comment_received notification (see
 * lib/notifications.ts) actually reach someone — without an owner, comments
 * on admin-posted content just go unnotified. POST accepts an optional
 * `owner_email`, resolved to the real bridge id via ensureProfile() (same
 * as everywhere else in the app — never session.user.id, see
 * /api/auth/supabase-token). ensureProfile creates the profile row if that
 * email hasn't signed up yet, so a post can be attributed ahead of time —
 * it resolves to the same account once they do sign up, since ir_sync_profile
 * is keyed by email.
 */
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/admin-route';
import { ensureProfile } from '@/lib/credits';

const COLS = 'id, channel_id, user_id, title, caption, image, audio_url, created_at';

export const GET = withAdmin(async (req, { db }) => {
  const channelId = new URL(req.url).searchParams.get('channel_id');
  if (!channelId) return NextResponse.json({ error: 'channel_id required' }, { status: 400 });

  const { data, error } = await db
    .from('ir_posts')
    .select(COLS)
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const posts = data ?? [];
  const ownerIds = [...new Set(posts.map(p => p.user_id).filter(Boolean))];
  let emailById: Record<string, string> = {};
  if (ownerIds.length) {
    const { data: owners } = await db.from('ir_user_profiles').select('id, email').in('id', ownerIds);
    emailById = Object.fromEntries((owners ?? []).map(o => [o.id, o.email]));
  }

  return NextResponse.json({
    posts: posts.map(p => ({ ...p, owner_email: p.user_id ? (emailById[p.user_id] ?? null) : null })),
  });
});

export const POST = withAdmin(async (_req, { body, db }) => {
  const channelId  = String(body.channel_id ?? '').trim();
  const title      = String(body.title      ?? '').trim() || null;
  const caption    = String(body.caption    ?? '').trim() || null;
  const image      = String(body.image      ?? '').trim() || null;
  const audioUrl   = String(body.audio_url  ?? '').trim() || null;
  const ownerEmail = String(body.owner_email ?? '').trim().toLowerCase() || null;

  if (!channelId) return NextResponse.json({ error: 'channel_id required' }, { status: 400 });
  if (!caption && !image && !audioUrl) {
    return NextResponse.json({ error: 'post must have caption, image, or audio' }, { status: 400 });
  }
  if (ownerEmail && !ownerEmail.includes('@')) {
    return NextResponse.json({ error: 'Owner email looks invalid' }, { status: 400 });
  }

  const userId = ownerEmail ? (await ensureProfile(db, ownerEmail, null)).id : null;

  const { data, error } = await db
    .from('ir_posts')
    .insert({ channel_id: channelId, user_id: userId, title, caption, image, audio_url: audioUrl })
    .select(COLS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ post: { ...data, owner_email: ownerEmail } });
});

export const DELETE = withAdmin(async (req, { db }) => {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { error } = await db.from('ir_posts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
});

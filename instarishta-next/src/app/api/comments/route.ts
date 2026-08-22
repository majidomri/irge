/**
 * GET  /api/comments?entityType=post&entityId=<uuid>  → public comment thread
 *   200 → { comments: [{ id, author_name, chip_key, created_at }], count }
 *
 * POST /api/comments  { entityType, entityId, chipKey }
 *   201 → { ok:true, comment }
 *   401 → not signed in (commenting requires a session — see migration 010)
 *   403 → banned account
 *   409 → already posted this exact chip on this post
 *
 * ir_comments has RLS enabled with no policies, so this route is the only
 * read/write path. GET is intentionally public with no session check — the
 * comments themselves are meant to be visible to any visitor, same as the
 * post they're attached to.
 *
 * A successful POST also notifies the post/story owner (see
 * lib/notifications.ts) — best-effort, never blocks or fails the comment.
 *
 * Node runtime.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { serviceClient, ensureProfile } from '@/lib/credits';
import { isCommentChipKey } from '@/lib/comment-chips';
import { notifyCommentReceived } from '@/lib/notifications';

export const runtime = 'nodejs';

type EntityType = 'post' | 'story';

function isEntityType(v: unknown): v is EntityType {
  return v === 'post' || v === 'story';
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const entityType = url.searchParams.get('entityType');
  const entityId   = url.searchParams.get('entityId');

  if (!isEntityType(entityType) || !entityId) {
    return NextResponse.json({ error: 'Missing entityType/entityId' }, { status: 400 });
  }

  const db = serviceClient();
  const { data, count } = await db
    .from('ir_comments')
    .select('id, author_name, chip_key, created_at', { count: 'exact' })
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('hidden', false)
    .order('created_at', { ascending: false })
    .limit(200);

  return NextResponse.json({ comments: data ?? [], count: count ?? 0 });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Please sign in to comment' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const entityType = isEntityType(body.entityType) ? body.entityType : null;
  const entityId    = typeof body.entityId === 'string' ? body.entityId : null;
  const chipKey     = body.chipKey;

  if (!entityType || !entityId) {
    return NextResponse.json({ error: 'Missing entityType/entityId' }, { status: 400 });
  }
  if (!isCommentChipKey(chipKey)) {
    return NextResponse.json({ error: 'Please choose one of the listed messages' }, { status: 400 });
  }

  const db = serviceClient();
  const profile = await ensureProfile(db, session.user.email, session.user.name ?? null);
  if (profile.is_banned) {
    return NextResponse.json({ error: 'Account suspended' }, { status: 403 });
  }

  const authorName = profile.full_name ?? session.user.name ?? session.user.email.split('@')[0];

  const { data, error } = await db
    .from('ir_comments')
    .insert({
      entity_type: entityType, entity_id: entityId,
      user_id: session.user.id, author_name: authorName, chip_key: chipKey,
    })
    .select('id, author_name, chip_key, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'You already posted this on here.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  void notifyCommentReceived(db, {
    entityType: entityType, entityId, commentId: data.id,
    actorUserId: session.user.id, actorName: authorName, chipKey: chipKey,
  });

  return NextResponse.json({ ok: true, comment: data }, { status: 201 });
}

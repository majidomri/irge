/**
 * GET  /api/comments?entityType=post&entityId=<uuid>  → public comment thread
 *   200 → { comments: [{ id, author_name, chip_key, created_at }], count }
 *
 * POST /api/comments  { entityType, entityId, chipKey }
 *   201 → { ok:true, comment }
 *   401 → not signed in (commenting requires a session — see migration 010)
 *   403 → banned account
 *   409 → already posted this exact chip on this post
 *   429 → daily per-profile quota reached (see CHIPS_PER_DAY)
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

/**
 * How many comments one member may leave on one post per rolling day.
 *
 * The unique constraint (entity_type, entity_id, user_id, chip_key) only stops
 * the *same* chip twice, so a member could post all ten chips on one profile
 * and fill the thread with their own name. Three is enough to say something
 * meaningful — interest, a question, a follow-up — without the thread becoming
 * one person talking to themselves.
 *
 * Rolling 24h from each comment, not a calendar day: a midnight reset would
 * just move the burst rather than prevent it.
 */
const CHIPS_PER_DAY = 3;
const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Comments this member has left on this entity inside the window. */
async function quotaFor(
  db: ReturnType<typeof serviceClient>,
  entityType: EntityType,
  entityId: string,
  userId: string,
): Promise<{ used: number; remaining: number; limit: number; resetAt: string | null }> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { data } = await db
    .from('ir_comments')
    .select('created_at')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  const rows = data ?? [];
  const used = rows.length;
  // The quota frees up when the OLDEST comment in the window ages out.
  const resetAt = used >= CHIPS_PER_DAY && rows[0]
    ? new Date(new Date(rows[0].created_at).getTime() + WINDOW_MS).toISOString()
    : null;

  // `used` can exceed the limit for comments posted before it existed; clamp
  // so the composer never renders a negative or inflated allowance.
  return { used, remaining: Math.max(0, CHIPS_PER_DAY - used), limit: CHIPS_PER_DAY, resetAt };
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

  /**
   * The viewer's own quota, when there is a viewer. The composer needs this on
   * load — otherwise it renders every chip as available and the member only
   * discovers the limit by being rejected. Anonymous visitors get null: they
   * cannot comment at all, and the sign-in gate already tells them so.
   *
   * Never fatal — reading comments must not depend on a working session.
   */
  let quota: Awaited<ReturnType<typeof quotaFor>> | null = null;
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (session?.user?.email) {
      const profile = await ensureProfile(db, session.user.email, session.user.name || null);
      quota = await quotaFor(db, entityType, entityId, profile.id);
    }
  } catch {
    quota = null;
  }

  return NextResponse.json({ comments: data ?? [], count: count ?? 0, quota });
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
  const profile = await ensureProfile(db, session.user.email, session.user.name || null); // || not ?? — better-auth defaults name to '', not null
  if (profile.is_banned) {
    return NextResponse.json({ error: 'Account suspended' }, { status: 403 });
  }

  // ?? would let better-auth's '' (not null) default name win over a real
  // fallback — caught live when a magic-link signup with no name produced a
  // blank author_name. || correctly treats '' as "keep looking".
  const authorName = profile.full_name || session.user.name || session.user.email.split('@')[0];

  // Rate limit before the insert. Checked server-side because the client copy
  // is only a courtesy — the composer disables itself, but nothing stops a
  // direct POST.
  const quota = await quotaFor(db, entityType, entityId, profile.id);
  if (quota.remaining <= 0) {
    return NextResponse.json(
      {
        error: `You can post ${CHIPS_PER_DAY} messages a day on a profile. Please try again tomorrow.`,
        quota,
      },
      { status: 429 },
    );
  }

  const { data, error } = await db
    .from('ir_comments')
    .insert({
      entity_type: entityType, entity_id: entityId,
      user_id: profile.id, author_name: authorName, chip_key: chipKey,
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
    actorUserId: profile.id, actorName: authorName, chipKey: chipKey,
  });

  // Post-insert quota so the composer can update its counter without refetching.
  const after = await quotaFor(db, entityType, entityId, profile.id);

  return NextResponse.json({ ok: true, comment: data, quota: after }, { status: 201 });
}

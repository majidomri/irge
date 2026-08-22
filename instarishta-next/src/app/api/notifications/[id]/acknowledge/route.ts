/**
 * POST /api/notifications/[id]/acknowledge
 *   200 → { ok:true }
 *   404 → not found, not yours, wrong type, or already acknowledged
 *
 * Only the recipient of a comment_received notification may acknowledge it
 * — this is the "respond" half of the comment_received / comment_acknowledged
 * pair (see lib/notifications.ts). Acknowledging stamps responded_at on this
 * row and fires a new comment_acknowledged notification back to whoever
 * originally commented, mirroring IndiaNikah's proposal_accepted event.
 *
 * Idempotent: acknowledging twice is a no-op (the second call finds
 * responded_at already set and 404s) rather than double-notifying the
 * original commenter.
 *
 * Uses ensureProfile(session).id, not session.user.id, to match user_id/
 * actor_user_id — see the note in ../route.ts for why.
 *
 * Node runtime.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { serviceClient, ensureProfile } from '@/lib/credits';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  const db = serviceClient();
  const profile = await ensureProfile(db, session.user.email, session.user.name ?? null);
  const { data: notif } = await db
    .from('ir_notifications')
    .select('id, type, entity_type, entity_id, comment_id, actor_user_id, actor_name, chip_key, responded_at')
    .eq('id', id)
    .eq('user_id', profile.id)
    .eq('type', 'comment_received')
    .maybeSingle();

  if (!notif || notif.responded_at) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!notif.actor_user_id) {
    // The original commenter's account no longer exists — nothing to notify back.
    await db.from('ir_notifications').update({ responded_at: new Date().toISOString() }).eq('id', id);
    return NextResponse.json({ ok: true });
  }

  const now = new Date().toISOString();
  await db.from('ir_notifications').update({ responded_at: now }).eq('id', id);

  // See comments/route.ts's authorName for why this is || not ?? — better-auth
  // defaults name to '' (not null), which ?? would let win over the fallback.
  const responderName = profile.full_name || session.user.name || session.user.email.split('@')[0];
  await db.from('ir_notifications').insert({
    user_id:       notif.actor_user_id,
    type:          'comment_acknowledged',
    entity_type:   notif.entity_type,
    entity_id:     notif.entity_id,
    comment_id:    notif.comment_id,
    actor_user_id: profile.id,
    actor_name:    responderName,
    chip_key:      notif.chip_key,
  });

  return NextResponse.json({ ok: true });
}

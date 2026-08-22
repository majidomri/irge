/**
 * Notifications — in-app inbox (bell icon), not push/email.
 *
 * Two-event model, deliberately borrowed from IndiaNikah's
 * proposal_received / proposal_accepted pattern (see conversation notes /
 * competitive analysis) and applied to our public comment chips instead of
 * private proposals:
 *   comment_received     — someone tapped a chip on your post/story
 *   comment_acknowledged — the owner acknowledged your comment back
 *
 * Like IndiaNikah, there is no "declined" event — silence stays silent.
 *
 * See supabase/migrations/011_notifications.sql. RLS denies all direct
 * client access; every read/write goes through a service-role route.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export type NotificationType = 'comment_received' | 'comment_acknowledged';
export type NotificationEntityType = 'post' | 'story';

/**
 * Fire-and-forget: fetch the post/story owner and insert a comment_received
 * row for them. Never throws — the comment itself is already durably saved
 * by the time this runs, and a notification failure must not undo that or
 * fail the caller's request.
 */
export async function notifyCommentReceived(db: Db, params: {
  entityType: NotificationEntityType;
  entityId: string;
  commentId: string;
  actorUserId: string;
  actorName: string;
  chipKey: string;
}): Promise<void> {
  try {
    const table = params.entityType === 'post' ? 'ir_posts' : 'ir_stories';
    const { data: owner } = await db.from(table).select('user_id').eq('id', params.entityId).maybeSingle();
    const ownerId = owner?.user_id as string | null | undefined;

    // No owner (legacy/admin content) or commenting on your own post — nothing to notify.
    if (!ownerId || ownerId === params.actorUserId) return;

    await db.from('ir_notifications').insert({
      user_id:        ownerId,
      type:            'comment_received' satisfies NotificationType,
      entity_type:     params.entityType,
      entity_id:       params.entityId,
      comment_id:      params.commentId,
      actor_user_id:   params.actorUserId,
      actor_name:      params.actorName,
      chip_key:        params.chipKey,
    });
  } catch (e) {
    console.warn('[notifications] notifyCommentReceived failed (non-fatal):', (e as Error).message);
  }
}

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

// ── Bundling ─────────────────────────────────────────────────────────────────

/**
 * How long a comment_received notification is held back before it surfaces.
 *
 * Bursts are the normal case here, not the exception: someone opens a
 * profile, taps a chip on the post, then on two stories, and the owner would
 * otherwise get three separate pings within seconds. Waiting a couple of
 * minutes lets the burst settle so it arrives as one bundled item —
 * "Aisha commented on 3 of your posts" — instead of three.
 *
 * Only comment_received is delayed. comment_acknowledged is a direct reply to
 * something the member did, arrives one at a time, and is exactly the
 * notification they are waiting for, so holding it back would just feel slow.
 */
export const BUNDLE_DELAY_MS = 2 * 60 * 1000;

/** A notification row as stored, plus the deep-link slug resolved by the route. */
export interface NotificationRow {
  id: string;
  type: NotificationType;
  entity_type: NotificationEntityType;
  entity_id: string;
  comment_id: string | null;
  actor_user_id: string | null;
  actor_name: string;
  chip_key: string | null;
  responded_at: string | null;
  read_at: string | null;
  created_at: string;
  slug?: string | null;
}

/**
 * One inbox line. A bundle of N notifications about the same thing, or a
 * single notification with count 1 — the client renders both the same way.
 */
export interface NotificationBundle {
  /** Stable React key; also the id used when marking this line read. */
  key: string;
  type: NotificationType;
  entity_type: NotificationEntityType;
  entity_id: string;
  /** Distinct actor names, most recent first. Drives "Aisha and 4 others". */
  actors: string[];
  /** Total notifications folded into this line. */
  count: number;
  /** Most recent chip in the bundle. */
  chip_key: string | null;
  /** Every underlying row id, so marking the line read marks all of them. */
  ids: string[];
  /** The newest row's id — what Acknowledge acts on. */
  latestId: string;
  latestCommentId: string | null;
  responded_at: string | null;
  read_at: string | null;
  created_at: string;
  slug: string | null;
}

/**
 * Fold raw notification rows into inbox lines.
 *
 * comment_received rows are grouped by (type, entity) so ten chips on one post
 * become one line. comment_acknowledged rows are never grouped — each is a
 * specific person responding to a specific comment, and collapsing them would
 * lose the only detail that matters.
 *
 * A bundle counts as read only when every row in it is read, and as responded
 * only when the newest row was — both deliberately conservative, so a bundle
 * never hides an unread item or claims an acknowledgement that did not happen.
 *
 * Rows are expected newest-first; output preserves that order by each
 * bundle's newest row.
 */
export function bundleNotifications(
  rows: NotificationRow[],
  now: number = Date.now(),
): NotificationBundle[] {
  const bundles = new Map<string, NotificationBundle>();

  for (const row of rows) {
    const age = now - new Date(row.created_at).getTime();

    // Still settling — withhold it, and withhold the whole bundle's newest
    // state with it, so the line does not flicker in and out.
    if (row.type === 'comment_received' && age < BUNDLE_DELAY_MS) continue;

    const key = row.type === 'comment_received'
      ? `${row.type}:${row.entity_type}:${row.entity_id}`
      : `${row.type}:${row.id}`;

    const existing = bundles.get(key);
    if (!existing) {
      bundles.set(key, {
        key,
        type:            row.type,
        entity_type:     row.entity_type,
        entity_id:       row.entity_id,
        actors:          [row.actor_name],
        count:           1,
        chip_key:        row.chip_key,
        ids:             [row.id],
        latestId:        row.id,
        latestCommentId: row.comment_id,
        responded_at:    row.responded_at,
        read_at:         row.read_at,
        created_at:      row.created_at,
        slug:            row.slug ?? null,
      });
      continue;
    }

    existing.count += 1;
    existing.ids.push(row.id);
    // Distinct names only — five chips from one person is still one person.
    if (!existing.actors.includes(row.actor_name)) existing.actors.push(row.actor_name);
    // Any unread row keeps the whole line unread.
    if (!row.read_at) existing.read_at = null;
    if (row.slug && !existing.slug) existing.slug = row.slug;
  }

  return [...bundles.values()];
}

/**
 * "Aisha", "Aisha and Sara", "Aisha and 4 others" — the phrasing that makes
 * one line stand in for many without hiding how many there were.
 */
export function actorSummary(actors: string[]): string {
  if (actors.length === 0) return 'Someone';
  if (actors.length === 1) return actors[0];
  if (actors.length === 2) return `${actors[0]} and ${actors[1]}`;
  return `${actors[0]} and ${actors.length - 1} others`;
}

/** Unread lines, for the bell's badge. Counts bundles, not raw rows. */
export function unreadBundleCount(bundles: NotificationBundle[]): number {
  return bundles.filter(b => !b.read_at).length;
}

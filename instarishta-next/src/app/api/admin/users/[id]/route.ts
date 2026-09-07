/**
 * GET /api/admin/users/[id]  — everything about one member, in one answer.
 *
 * The admin actions for a member already existed, spread across four routes:
 * plans and credits in /api/admin/users, block and hide in
 * /api/admin/moderation, payments in /api/admin/orders, interests in
 * /api/admin/interests. What did not exist was a way to *see* a member —
 * answering "this person emailed about a missing credit" meant opening four
 * tabs and joining them by eye.
 *
 * So this reads, and does not write. Every mutation stays in the route that
 * already owns it, with the audit trail it already writes. A read-only
 * aggregate cannot introduce a second way to change something, which is the
 * failure mode a 360 endpoint invites.
 *
 * Bounded on every query. A member with ten thousand events should slow
 * nothing down, and no panel needs more than the most recent page of anything.
 */
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/admin-route';

/** Enough to see a pattern; not so much that one member can stall the panel. */
const RECENT = 50;

export const GET = withAdmin(async (req, { db }) => {
  const id = req.url.split('/users/')[1]?.split('?')[0]?.split('/')[0] ?? '';
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { data: profile, error } = await db
    .from('ir_user_profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const email = (profile as { email?: string }).email ?? '';

  // Independent reads, so they go together. Anything that fails comes back as
  // an empty section rather than failing the whole panel — an admin looking at
  // a support case should still see the other nine things.
  const [orders, interests, comments, notifications, usage, moderation, storyViews, posts, stories] =
    await Promise.all([
      db.from('ir_orders')
        .select('id, plan_id, amount_paise, status, utr, created_at, resolved_at, resolved_by, note')
        .eq('email', email).order('created_at', { ascending: false }).limit(RECENT),

      db.from('ir_interests')
        .select('id, status, created_at, profile_num, profile_title, revealed_at, responded_at, revealed_phone')
        .eq('from_email', email).order('created_at', { ascending: false }).limit(RECENT),

      db.from('ir_comments')
        .select('id, entity_type, entity_id, author_name, chip_key, hidden, created_at')
        .eq('user_id', id).order('created_at', { ascending: false }).limit(RECENT),

      db.from('ir_notifications')
        .select('id, type, entity_type, entity_id, actor_name, read_at, responded_at, created_at')
        .eq('user_id', id).order('created_at', { ascending: false }).limit(RECENT),

      db.from('ir_user_usage')
        .select('feature, used_at')
        .eq('user_id', id).order('used_at', { ascending: false }).limit(RECENT),

      db.from('ir_moderation_actions')
        .select('action, subject_type, subject_id, actor, reason, created_at')
        .eq('subject_id', email).order('created_at', { ascending: false }).limit(RECENT),

      // The same three reads /api/account/stats makes, so an admin sees the
      // numbers the member sees rather than a different set of them.
      db.from('ir_story_views').select('story_id').eq('viewer_id', id).limit(500),

      db.from('ir_posts')
        .select('id, title, views, likes, created_at')
        .eq('user_id', id).order('created_at', { ascending: false }).limit(RECENT),

      db.from('ir_stories')
        .select('id, likes, created_at')
        .eq('user_id', id).order('created_at', { ascending: false }).limit(RECENT),
    ]);

  // No audience analytics here on purpose. ir_profile_events is keyed to a
  // listing (entity_type is always 'profile') and identifies the viewer only
  // by a salted visitor_hash; nothing links a listing back to the account that
  // pays for it. An earlier draft of this route selected the most recent rows
  // with no filter at all and returned them as this member's activity, which
  // is a site-wide feed wearing one person's name. Per-listing numbers live in
  // the Analytics tab, where the entity they belong to is the thing named.

  const rows = <T,>(r: { data: T[] | null }) => r.data ?? [];

  // Usage, summarised the way the quota is actually enforced.
  const usageRows = rows(usage) as { feature: string; used_at: string }[];
  const usageByFeature: Record<string, number> = {};
  for (const u of usageRows) usageByFeature[u.feature] = (usageByFeature[u.feature] ?? 0) + 1;

  const orderRows = rows(orders) as { status: string; amount_paise: number }[];
  const interestRows = rows(interests) as { revealed_at: string | null; responded_at: string | null }[];
  const postRows = rows(posts) as { views: number | null; likes: number | null }[];
  const storyRows = rows(stories) as { likes: number | null }[];

  return NextResponse.json({
    profile,
    // The numbers a support question usually turns on.
    summary: {
      credits: {
        cycle: (profile as { contact_credits?: number }).contact_credits ?? 0,
        bonus: (profile as { bonus_credits?: number }).bonus_credits ?? 0,
      },
      plan: (profile as { plan?: string }).plan ?? 'none',
      banned: Boolean((profile as { is_banned?: boolean }).is_banned),
      ordersTotal: orderRows.length,
      paidPaise: orderRows
        .filter((o) => o.status === 'confirmed')
        .reduce((s, o) => s + (o.amount_paise ?? 0), 0),
      interestsSent: rows(interests).length,
      commentsPosted: rows(comments).length,
      contactsUnlocked: interestRows.filter((i) => i.revealed_at).length,
      repliesReceived: interestRows.filter((i) => i.responded_at).length,
      storiesWatched: rows(storyViews).length,
      unreadNotifications: (rows(notifications) as { read_at: string | null }[])
        .filter((n) => !n.read_at).length,
      usageByFeature,
    },
    orders: rows(orders),
    interests: rows(interests),
    comments: rows(comments),
    notifications: rows(notifications),
    moderation: rows(moderation),
    // Null rather than zeroes when nothing is attributed to this account, so
    // "no posts" and "a post with no views" stay distinguishable.
    content:
      postRows.length + storyRows.length === 0
        ? null
        : {
            posts: postRows.length,
            stories: storyRows.length,
            views: postRows.reduce((s, x) => s + (x.views ?? 0), 0),
            likes:
              postRows.reduce((s, x) => s + (x.likes ?? 0), 0) +
              storyRows.reduce((s, x) => s + (x.likes ?? 0), 0),
          },
    // Said plainly, because an empty section that failed and an empty section
    // that is genuinely empty look identical otherwise.
    failed: [
      orders.error && 'orders',
      interests.error && 'interests',
      comments.error && 'comments',
      notifications.error && 'notifications',
      usage.error && 'usage',
      moderation.error && 'moderation',
      storyViews.error && 'story views',
      posts.error && 'posts',
      stories.error && 'stories',
    ].filter(Boolean),
  });
});

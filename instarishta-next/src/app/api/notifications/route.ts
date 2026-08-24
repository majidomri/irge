/**
 * GET   /api/notifications              → the signed-in user's inbox
 *   200 → { notifications: [...], unreadCount }
 *
 * PATCH /api/notifications { ids?: string[], all?: true }  → mark read
 *   200 → { ok:true }
 *
 * Bell-icon inbox for the comment_received / comment_acknowledged events
 * (see lib/notifications.ts). ir_notifications has RLS enabled with no
 * write policies, so this route is the only path.
 *
 * Rows are returned BUNDLED, not raw: ten chips on one post arrive as a
 * single line ("Aisha and 4 others"), and a comment_received younger than
 * BUNDLE_DELAY_MS is withheld so a burst settles into one item instead of
 * pinging the bell at every tap. unreadCount counts bundles for the same
 * reason — a badge reading "12" for one person's visit is noise, not signal.
 * See bundleNotifications() for the grouping rules.
 *
 * Every query is scoped to ensureProfile(session).id — NOT session.user.id.
 * better-auth's session id (e.g. "FfanPw2y...") lives in a different id space
 * than auth.users.id, which is what user_id's foreign key actually points to
 * (see /api/auth/supabase-token); ir_notifications rows are written with the
 * latter, via lib/notifications.ts.
 *
 * Node runtime.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { serviceClient, ensureProfile } from '@/lib/credits';
import { bundleNotifications, unreadBundleCount, type NotificationRow } from '@/lib/notifications';

export const runtime = 'nodejs';

const COLS = 'id, type, entity_type, entity_id, comment_id, actor_user_id, actor_name, chip_key, responded_at, read_at, created_at';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.email) return NextResponse.json({ notifications: [], unreadCount: 0 });

  const db = serviceClient();
  const profile = await ensureProfile(db, session.user.email, session.user.name || null); // || not ?? — better-auth defaults name to '', not null
  const { data } = await db
    .from('ir_notifications')
    .select(COLS)
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })
    // Fetch wider than we display: bundling collapses many rows into few
    // lines, so 50 raw rows could be only a handful of inbox items.
    .limit(300);

  const notifications = (data ?? []) as unknown as NotificationRow[];

  // Deep-link posts to their public slug. Best-effort — a missing slug just
  // means the bell item renders without a link.
  const postIds = notifications.filter(n => n.entity_type === 'post').map(n => n.entity_id);
  let slugByEntity: Record<string, string> = {};
  if (postIds.length) {
    const { data: nanos } = await db
      .from('ir_nano_ids')
      .select('slug, entity_id')
      .eq('entity_type', 'post')
      .in('entity_id', postIds);
    slugByEntity = Object.fromEntries((nanos ?? []).map(n => [n.entity_id as string, n.slug as string]));
  }

  const withSlugs = notifications.map(n => ({ ...n, slug: slugByEntity[n.entity_id] ?? null }));
  const bundles   = bundleNotifications(withSlugs).slice(0, 50);

  return NextResponse.json({
    notifications: bundles,
    // Counts unread *lines*, not rows — and excludes anything still inside
    // the settle window, so the badge never counts a ping the member cannot
    // yet see in the list.
    unreadCount: unreadBundleCount(bundles),
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = serviceClient();
  const profile = await ensureProfile(db, session.user.email, session.user.name || null); // || not ?? — better-auth defaults name to '', not null
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const now = new Date().toISOString();

  if (body.all === true) {
    await db.from('ir_notifications').update({ read_at: now })
      .eq('user_id', profile.id).is('read_at', null);
    return NextResponse.json({ ok: true });
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((v): v is string => typeof v === 'string') : [];
  if (!ids.length) return NextResponse.json({ error: 'Missing ids' }, { status: 400 });

  await db.from('ir_notifications').update({ read_at: now })
    .eq('user_id', profile.id).in('id', ids);

  return NextResponse.json({ ok: true });
}

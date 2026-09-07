/**
 * GET /api/account/stats — everything the platform knows about one member,
 * shown back to that member.
 *
 * Audience numbers for "my ad" exist only where the member has proven the ad
 * is theirs. The catalogue is an external read-only feed with no owner field
 * (see PROFILE_WORKER_BASE in lib/data.ts), so ownership comes from
 * ir_profile_claims — migration 031 — and only an approved claim opens the
 * events for that listing. Without that gate this endpoint would be reporting
 * the whole site's traffic to whoever asked.
 *
 * What a member has is three things, and all three are here:
 *
 *   1. Their activity — interests sent, contacts unlocked, credits spent and
 *      left, comments, listens, stories watched, what they paid.
 *   2. Their content, when an admin has attributed a post or story to their
 *      account (ir_posts.user_id / ir_stories.user_id). Then views, likes and
 *      comments on it are theirs and are reported.
 *   3. Their audience, for every listing with an approved claim: impressions,
 *      views, clicks, contact reveals, shares and voice-note listens, split by
 *      where the visitor came from.
 *
 * Scoped by the session on every query — email for the tables keyed by email,
 * id for the tables keyed by user. There is no id parameter, so there is no
 * way to ask this route about somebody else.
 *
 * Node runtime: it needs the service client to read past RLS, having already
 * proved who is asking.
 */
import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { SOURCE_LABEL, type TrafficSource } from '@/lib/traffic-source';
import { serviceClient } from '@/lib/credits';

export const runtime = 'nodejs';

/** Rolling window for the day-by-day series. */
const DAYS = 30;
/** Hard ceiling on any one list, so a heavy member cannot stall their own page. */
const CAP = 500;

type Row = Record<string, unknown>;

const rows = <T,>(r: { data: T[] | null }): T[] => r.data ?? [];
const dayKey = (iso: string) => iso.slice(0, 10);

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = session.user.email;
  const id = session.user.id;
  const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();

  const db = serviceClient();

  const [profile, interests, orders, comments, usage, notifications, storyViews, posts, stories, claims] =
    await Promise.all([
      db.from('ir_user_profiles')
        .select('plan, contact_credits, bonus_credits, plan_expires_at, credits_reset_at, monthly_credits, created_at, profession_key, profession_verified_at')
        .eq('email', email).maybeSingle(),

      db.from('ir_interests')
        .select('id, status, chip, profile_num, profile_title, revealed_at, responded_at, created_at')
        .eq('from_email', email).order('created_at', { ascending: false }).limit(CAP),

      db.from('ir_orders')
        .select('id, plan_id, amount_paise, status, created_at')
        .eq('email', email).order('created_at', { ascending: false }).limit(CAP),

      db.from('ir_comments')
        .select('id, entity_type, entity_id, hidden, created_at')
        .eq('user_id', id).order('created_at', { ascending: false }).limit(CAP),

      // user_id is text on this table, not uuid — the others are uuid.
      db.from('ir_user_usage')
        .select('feature, used_at')
        .eq('user_id', id).order('used_at', { ascending: false }).limit(CAP),

      db.from('ir_notifications')
        .select('id, type, read_at, created_at')
        .eq('user_id', id).order('created_at', { ascending: false }).limit(CAP),

      db.from('ir_story_views')
        .select('story_id, viewed_at')
        .eq('viewer_id', id).order('viewed_at', { ascending: false }).limit(CAP),

      // Content attributed to this member by an admin. Usually none, which is
      // why the whole section is conditional rather than a row of zeroes.
      db.from('ir_posts')
        .select('id, title, image, thumb, views, likes, created_at')
        .eq('user_id', id).order('created_at', { ascending: false }).limit(CAP),

      db.from('ir_stories')
        .select('id, image, likes, created_at')
        .eq('user_id', id).order('created_at', { ascending: false }).limit(CAP),

      db.from('ir_profile_claims')
        .select('profile_num, status, created_at')
        .eq('user_id', id).order('created_at', { ascending: false }).limit(100),
    ]);

  const interestRows = rows(interests) as Row[];
  const orderRows = rows(orders) as { status: string; amount_paise: number; created_at: string }[];
  const commentRows = rows(comments) as Row[];
  const usageRows = rows(usage) as { feature: string; used_at: string }[];
  const notifRows = rows(notifications) as { read_at: string | null }[];
  const storyViewRows = rows(storyViews) as { viewed_at: string }[];
  const postRows = rows(posts) as { id: string; views: number | null; likes: number | null }[];
  const storyRows = rows(stories) as { id: string; likes: number | null }[];

  // ── Engagement on content this member owns ────────────────────────────────
  // Two extra reads, and only when there is something to count.
  let ownedComments = 0;
  let ownedStoryViews = 0;
  const postIds = postRows.map((p) => p.id);
  const storyIds = storyRows.map((s) => s.id);

  if (postIds.length > 0) {
    const { count } = await db
      .from('ir_comments')
      .select('id', { count: 'exact', head: true })
      .in('entity_id', postIds);
    ownedComments = count ?? 0;
  }
  if (storyIds.length > 0) {
    const { count } = await db
      .from('ir_story_views')
      .select('story_id', { count: 'exact', head: true })
      .in('story_id', storyIds);
    ownedStoryViews = count ?? 0;
  }

  // ── Day-by-day, last 30 days ──────────────────────────────────────────────
  // Seeded with every day in the window so the chart has no gaps where the
  // member simply did nothing — a missing bar and a zero bar mean different
  // things to the person reading it.
  const series = new Map<string, { date: string; interests: number; comments: number; activity: number; audience: number }>();
  for (let d = DAYS - 1; d >= 0; d--) {
    const key = dayKey(new Date(Date.now() - d * 86_400_000).toISOString());
    series.set(key, { date: key, interests: 0, comments: 0, activity: 0, audience: 0 });
  }

  // ── Audience for listings this member has proven are theirs ───────────────
  // Only approved claims. A pending one is an assertion, and showing somebody
  // else's audience on the strength of an assertion is the failure this whole
  // table exists to prevent.
  const claimRows = rows(claims) as { profile_num: number; status: string }[];
  const ownedNums = claimRows.filter((c) => c.status === 'approved').map((c) => String(c.profile_num));

  let audience: {
    listings: number;
    totals: Record<string, number>;
    reach: number;
    sources: { source: string; label: string; count: number }[];
    countries: Record<string, number>;
    devices: Record<string, number>;
    perListing: { profileNum: string; total: number; reach: number }[];
  } | null = null;

  if (ownedNums.length > 0) {
    const { data: evData } = await db
      .from('ir_profile_events')
      .select('entity_id, event, source, country, device, visitor_hash, created_at')
      .eq('entity_type', 'profile')
      .in('entity_id', ownedNums)
      .gte('created_at', since)
      .limit(20_000);

    const ev = (evData ?? []) as {
      entity_id: string; event: string; source: string | null;
      country: string | null; device: string | null; visitor_hash: string | null; created_at: string;
    }[];

    const totals: Record<string, number> = {};
    const sourceCount: Record<string, number> = {};
    const countries: Record<string, number> = {};
    const devices: Record<string, number> = {};
    const perListing = new Map<string, { total: number; visitors: Set<string> }>();
    const allVisitors = new Set<string>();

    for (const e of ev) {
      totals[e.event] = (totals[e.event] ?? 0) + 1;
      if (e.source) sourceCount[e.source] = (sourceCount[e.source] ?? 0) + 1;
      if (e.country) countries[e.country] = (countries[e.country] ?? 0) + 1;
      if (e.device) devices[e.device] = (devices[e.device] ?? 0) + 1;
      if (e.visitor_hash) allVisitors.add(e.visitor_hash);

      let slot = perListing.get(e.entity_id);
      if (!slot) { slot = { total: 0, visitors: new Set() }; perListing.set(e.entity_id, slot); }
      slot.total += 1;
      if (e.visitor_hash) slot.visitors.add(e.visitor_hash);

      // Audience activity belongs on the same 30-day strip as everything else.
      const hit = series.get(dayKey(e.created_at));
      if (hit) hit.audience += 1;
    }

    audience = {
      listings: ownedNums.length,
      totals,
      // Distinct salted hashes, which is as close to "people" as this data
      // gets — the hash is per-listing and one-way, so it counts without
      // identifying.
      reach: allVisitors.size,
      sources: Object.entries(sourceCount)
        .map(([source, count]) => ({
          source,
          label: SOURCE_LABEL[source as TrafficSource] ?? source,
          count,
        }))
        .sort((a, b) => b.count - a.count),
      countries,
      devices,
      perListing: [...perListing.entries()]
        .map(([profileNum, v]) => ({ profileNum, total: v.total, reach: v.visitors.size }))
        .sort((a, b) => b.total - a.total),
    };
  }

  // ── Derived counts ────────────────────────────────────────────────────────
  const byStatus: Record<string, number> = {};
  for (const i of interestRows) {
    const s = String(i.status ?? 'unknown');
    byStatus[s] = (byStatus[s] ?? 0) + 1;
  }

  const usageByFeature: Record<string, number> = {};
  for (const u of usageRows) usageByFeature[u.feature] = (usageByFeature[u.feature] ?? 0) + 1;

  const bump = (iso: string | null | undefined, field: 'interests' | 'comments' | 'activity') => {
    if (!iso || iso < since) return;
    const hit = series.get(dayKey(iso));
    if (hit) hit[field] += 1;
  };
  for (const i of interestRows) bump(i.created_at as string, 'interests');
  for (const c of commentRows) bump(c.created_at as string, 'comments');
  for (const u of usageRows) bump(u.used_at, 'activity');
  for (const v of storyViewRows) bump(v.viewed_at, 'activity');

  const p = (profile.data ?? {}) as Row;

  return NextResponse.json({
    days: DAYS,
    member: {
      email,
      name: session.user.name || null,
      joined: p.created_at ?? null,
      plan: p.plan ?? 'free',
      planExpiresAt: p.plan_expires_at ?? null,
      creditsResetAt: p.credits_reset_at ?? null,
      profession: p.profession_key ?? null,
      professionVerified: Boolean(p.profession_verified_at),
    },
    credits: {
      cycle: Number(p.contact_credits ?? 0),
      bonus: Number(p.bonus_credits ?? 0),
      monthly: Number(p.monthly_credits ?? 0),
      total: Number(p.contact_credits ?? 0) + Number(p.bonus_credits ?? 0),
    },
    activity: {
      interestsSent: interestRows.length,
      interestsByStatus: byStatus,
      contactsUnlocked: interestRows.filter((i) => i.revealed_at).length,
      repliesReceived: interestRows.filter((i) => i.responded_at).length,
      commentsPosted: commentRows.length,
      storiesWatched: storyViewRows.length,
      notifications: {
        total: notifRows.length,
        unread: notifRows.filter((n) => !n.read_at).length,
      },
      usageByFeature,
    },
    spend: {
      ordersTotal: orderRows.length,
      paidPaise: orderRows
        .filter((o) => o.status === 'confirmed')
        .reduce((s, o) => s + (o.amount_paise ?? 0), 0),
      lastPaymentAt: orderRows.find((o) => o.status === 'confirmed')?.created_at ?? null,
    },
    // Null, not an empty object, when this member has no attributed content —
    // so the page can leave the section out instead of showing zeroes that
    // look like failure.
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
            commentsReceived: ownedComments,
            storyViews: ownedStoryViews,
          },
    // Null when nothing is claimed, so the page can invite a claim instead of
    // rendering an empty dashboard.
    audience,
    claims: claimRows,
    recentInterests: interestRows.slice(0, 20),
    series: [...series.values()],
    failed: [
      interests.error && 'interests',
      orders.error && 'orders',
      comments.error && 'comments',
      usage.error && 'usage',
      notifications.error && 'notifications',
      storyViews.error && 'stories',
      posts.error && 'posts',
      claims.error && 'claims',
    ].filter(Boolean),
  });
}

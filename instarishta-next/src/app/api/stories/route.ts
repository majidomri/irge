/**
 * GET /api/stories?channel_id=<uuid>  → zuck.js-shaped story timeline
 *   200 → { stories: TimelineItem[] }
 *
 * zuck.js (see src/components/ZuckStories.tsx) expects one "timeline" entry
 * per person, each carrying their own items[]. ir_stories is a flat,
 * per-channel list with an optional user_id, so the grouping — and the
 * poster's display name — has to happen here, server-side: ir_user_profiles
 * has RLS with no public-read policy (member names aren't public data), so
 * the anon client the rest of this page uses for getStories() cannot resolve
 * them itself.
 *
 * There's no avatar/photo column on ir_user_profiles, so each group's ring
 * avatar is that poster's own most recent story image — a common fallback
 * for story UIs with no separate profile-photo field.
 *
 * Public, read-only, no session required — stories are public content, same
 * as the rest of the channel feed.
 *
 * A session, when there is one, only *enriches* the response: each group gets
 * a `seen` flag (every item already in ir_story_views for this viewer), and
 * the viewer's own groups carry a `viewCount`. `seen` is what makes the ring
 * decay — unwatched rings render as the gradient, watched ones grey out, and
 * unwatched groups sort to the front of the tray. Anonymous visitors get
 * seen:false throughout, which is the correct "nothing watched yet" state.
 *
 * Node runtime.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { serviceClient, ensureProfile } from '@/lib/credits';
import { optimized } from '@/lib/img';

export const runtime = 'nodejs';

const STORY_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const channelId = new URL(req.url).searchParams.get('channel_id');
  if (!channelId) return NextResponse.json({ error: 'channel_id required' }, { status: 400 });

  const db = serviceClient();
  const cutoff = new Date(Date.now() - STORY_WINDOW_MS).toISOString();

  const { data: rows, error } = await db
    .from('ir_stories')
    .select('id, user_id, image, created_at, likes')
    .eq('channel_id', channelId)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const stories = rows ?? [];
  const storyIds = stories.map(s => s.id);

  // Resolve the current viewer, if any. Never fatal: a broken/expired session
  // must degrade to the anonymous view, not 500 a public page.
  let viewerId: string | null = null;
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (session?.user?.email) {
      const profile = await ensureProfile(db, session.user.email, session.user.name || null); // || not ?? — better-auth defaults name to '', not null
      viewerId = profile.id;
    }
  } catch {
    viewerId = null;
  }

  // Which of these stories has this viewer already watched? One query for the
  // whole tray rather than one per story.
  const seenIds = new Set<string>();
  if (viewerId && storyIds.length) {
    const { data: seen } = await db
      .from('ir_story_views')
      .select('story_id')
      .eq('viewer_id', viewerId)
      .in('story_id', storyIds);
    for (const v of seen ?? []) seenIds.add(v.story_id);
  }

  // View counts, but only for the viewer's own stories — a member may see how
  // many watched *their* story, never anyone else's.
  const viewCounts = new Map<string, number>();
  const ownStoryIds = viewerId ? stories.filter(s => s.user_id === viewerId).map(s => s.id) : [];
  if (ownStoryIds.length) {
    const { data: counts } = await db
      .from('ir_story_views').select('story_id').in('story_id', ownStoryIds);
    for (const c of counts ?? []) viewCounts.set(c.story_id, (viewCounts.get(c.story_id) ?? 0) + 1);
  }

  const ownerIds = [...new Set(stories.map(s => s.user_id).filter(Boolean))] as string[];
  let nameById: Record<string, string> = {};
  if (ownerIds.length) {
    const { data: owners } = await db.from('ir_user_profiles').select('id, full_name, email').in('id', ownerIds);
    nameById = Object.fromEntries((owners ?? []).map(o => [o.id, o.full_name || o.email.split('@')[0]]));
  }

  const { data: channel } = await db.from('ir_channels').select('name').eq('id', channelId).maybeSingle();

  // Group by poster (falls back to a shared "house" group for stories with
  // no owner), preserving chronological order within each group.
  const groups = new Map<string, typeof stories>();
  for (const s of stories) {
    const key = s.user_id ?? 'house';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }

  // zuck.js's `time` fields want a Unix timestamp in SECONDS, not an ISO
  // string and not epoch milliseconds — tried both live: an ISO string
  // silently coerced to 0 ("1/1/1970"), and epoch-ms rendered as year 58610
  // (it multiplies by 1000 internally, so ms-as-seconds overshoots 1000x).
  const toUnixSeconds = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

  const timeline = [...groups.entries()].map(([key, items]) => {
    const latest = items[items.length - 1];
    return {
      id: key,
      name: key === 'house' ? (channel?.name ?? 'InstaRishta') : (nameById[key] ?? 'Member'),
      /**
       * zuck.js builds its own <img> from these URLs, so next/image can never
       * see them -- the ring and the full-screen story both downloaded the
       * whole 1080x1920 original, one of them to fill a 64px circle. Rewriting
       * the URL through the optimizer is the only way in, and it brings the
       * AVIF negotiation with it.
       *
       * 160 for the ring (64px at DPR 2, rounded up to a configured size).
       */
      photo: optimized(latest.image, 160),
      lastUpdated: toUnixSeconds(latest.created_at),
      // A group counts as seen only when every item in it has been watched —
      // one new story re-lights the whole ring, which is the behaviour people
      // expect from every story tray they've used.
      seen: viewerId ? items.every(s => seenIds.has(s.id)) : false,
      isSelf: !!viewerId && key === viewerId,
      items: items.map(s => ({
        id: s.id,
        type: 'photo',
        length: 5,
        // Full-screen, so the largest a phone can use: 1200 covers a 430pt
        // viewport at DPR 3 and comes back ~47 KB as AVIF against 233 KB raw.
        src: optimized(s.image, 1200),
        time: toUnixSeconds(s.created_at),
        likes: s.likes ?? 0,
        seen: seenIds.has(s.id),
        viewCount: viewCounts.get(s.id) ?? 0,
      })),
    };
  }).sort((a, b) =>
    // Unwatched first, then most recent. This is the decay: as a member works
    // through the tray, watched rings fall to the back and the tray visibly
    // empties out — which is what makes an unwatched ring worth tapping.
    (Number(a.seen) - Number(b.seen)) || (b.lastUpdated - a.lastUpdated),
  );

  return NextResponse.json({ stories: timeline });
}

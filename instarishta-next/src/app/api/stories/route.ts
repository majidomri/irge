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
 * as the rest of the channel feed. Node runtime.
 */
import { NextRequest, NextResponse } from 'next/server';
import { serviceClient } from '@/lib/credits';

export const runtime = 'nodejs';

const STORY_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const channelId = new URL(req.url).searchParams.get('channel_id');
  if (!channelId) return NextResponse.json({ error: 'channel_id required' }, { status: 400 });

  const db = serviceClient();
  const cutoff = new Date(Date.now() - STORY_WINDOW_MS).toISOString();

  const { data: rows, error } = await db
    .from('ir_stories')
    .select('id, user_id, image, created_at')
    .eq('channel_id', channelId)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const stories = rows ?? [];
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

  const timeline = [...groups.entries()].map(([key, items]) => {
    const latest = items[items.length - 1];
    return {
      id: key,
      name: key === 'house' ? (channel?.name ?? 'InstaRishta') : (nameById[key] ?? 'Member'),
      photo: latest.image,
      lastUpdated: latest.created_at,
      items: items.map(s => ({
        id: s.id,
        type: 'photo',
        length: 5,
        src: s.image,
        time: s.created_at,
      })),
    };
  }).sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));

  return NextResponse.json({ stories: timeline });
}

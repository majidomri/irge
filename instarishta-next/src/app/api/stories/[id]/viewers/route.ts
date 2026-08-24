/**
 * GET /api/stories/[id]/viewers  → who watched this story
 *   200 → { count, viewers: [{ id, name, professionKey, viewedAt }] }
 *   401 → not signed in
 *   403 → not your story
 *
 * Only the story's owner may read this. That restriction is the reason the
 * list cannot come from RLS: authorising it needs a join against
 * ir_stories.user_id, so migration 015 exposes only the read-own-views
 * policy and leaves the owner's view to this service-role route.
 *
 * "Seen by" is the strongest return-trigger in the product — people reopen an
 * app to find out who looked at them — and it is honest here: it reports a
 * real event to the one person entitled to it, rather than manufacturing
 * engagement.
 *
 * Each viewer carries their verified profession so the owner sees
 * "Dr. viewed you", not an anonymous name.
 *
 * Node runtime.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { serviceClient, ensureProfile } from '@/lib/credits';

export const runtime = 'nodejs';

const MAX_VIEWERS = 200;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = serviceClient();
  const profile = await ensureProfile(db, session.user.email, session.user.name || null); // || not ?? — better-auth defaults name to '', not null

  const { data: story } = await db
    .from('ir_stories').select('user_id').eq('id', id).maybeSingle();

  // Missing and not-yours are both reported as 403 so this cannot be used to
  // probe which story ids exist.
  if (!story || story.user_id !== profile.id) {
    return NextResponse.json({ error: 'Not your story' }, { status: 403 });
  }

  const { data: views, count } = await db
    .from('ir_story_views')
    .select('viewer_id, viewed_at', { count: 'exact' })
    .eq('story_id', id)
    .order('viewed_at', { ascending: false })
    .limit(MAX_VIEWERS);

  const rows = views ?? [];
  const ids  = [...new Set(rows.map(v => v.viewer_id))];

  let who: Record<string, { name: string | null; profession_key: string | null }> = {};
  if (ids.length) {
    const { data: profiles } = await db
      .from('ir_user_profiles').select('id, full_name, email, profession_key').in('id', ids);
    who = Object.fromEntries((profiles ?? []).map(p => [
      p.id,
      { name: p.full_name || (p.email ? p.email.split('@')[0] : null), profession_key: p.profession_key ?? null },
    ]));
  }

  return NextResponse.json({
    count: count ?? rows.length,
    viewers: rows.map(v => ({
      id:            v.viewer_id,
      name:          who[v.viewer_id]?.name ?? 'Member',
      professionKey: who[v.viewer_id]?.profession_key ?? null,
      viewedAt:      v.viewed_at,
    })),
  });
}

/**
 * POST /api/stories/[id]/view  → record that the signed-in member watched it
 *   200 → { ok:true }
 *   204-ish no-op for anonymous viewers (see below)
 *
 * Fired by the story viewer as each slide opens. Two things depend on it:
 *   • the owner's "seen by" list (../viewers)
 *   • the watched/unwatched ring state on the member's own story tray
 *
 * Anonymous visitors get a silent 200 rather than a 401. Stories are public
 * content, and a signed-out reader failing this call must not surface an
 * error in the middle of someone's story — there is simply nobody to record.
 *
 * Idempotent by construction: (story_id, viewer_id) is the primary key of
 * ir_story_views, so re-watching upserts the same row. viewed_at is
 * deliberately NOT refreshed on re-view — the owner wants "when did they
 * first see this", and bumping it would reorder the seen-by list every time
 * someone flicks back.
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
  const { id } = await params;

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.email) return NextResponse.json({ ok: true, recorded: false });

  const db = serviceClient();
  const profile = await ensureProfile(db, session.user.email, session.user.name || null); // || not ?? — better-auth defaults name to '', not null

  // ignoreDuplicates keeps the original viewed_at on a re-watch.
  const { error } = await db
    .from('ir_story_views')
    .upsert({ story_id: id, viewer_id: profile.id }, { onConflict: 'story_id,viewer_id', ignoreDuplicates: true });

  // A story that expired or was deleted between render and view fails the FK.
  // That is not worth erroring at the viewer over.
  if (error && error.code !== '23503') {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, recorded: !error });
}

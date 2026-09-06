import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';

/**
 * POST /api/revalidate   header  x-revalidate-secret: <REVALIDATE_SECRET>
 *
 * On-demand ISR. Purging tags alone stopped being enough once /p/[slug] and
 * /channels/[slug] became prerendered: a tag purge clears the cached *data*,
 * but the page is a static file and keeps serving until its own `revalidate`
 * window expires — up to ten minutes after a publish. The paths have to be
 * purged too.
 *
 * Body (all optional):
 *   { "slug": "abc123" }    also purge that one share page
 *   { "path": "/pricing" }  also purge one arbitrary path
 *
 * With no body it purges the listing surfaces, which is the common case: the
 * admin pushes new profiles and wants them visible now.
 */

/** Cached data, keyed by the tags used in lib/data. */
// 'biodata' was missing: lib/data tags all three loaders, but this route
// only ever purged two, so hand-authored biodata stayed cached for the
// full 30 minutes after an edit however many times the hook was called.
const TAGS = ['profiles', 'featured', 'biodata'];

/** Pages built from that data. */
const PATHS = ['/', '/profiles', '/channels'];

export async function POST(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET?.trim();
  if (secret && req.headers.get('x-revalidate-secret') !== secret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // A missing or unparseable body is not an error: it means "the usual".
  let body: { slug?: unknown; path?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  for (const tag of TAGS) revalidateTag(tag, {});

  const paths = [...PATHS];

  // Slugs are nano ids; anything else is not one of ours and is ignored
  // rather than passed to revalidatePath.
  if (typeof body.slug === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(body.slug)) {
    paths.push(`/p/${body.slug}`);
  }

  // Same-origin absolute paths only — never a full URL, never a traversal.
  if (typeof body.path === 'string' && /^\/[A-Za-z0-9/_-]{0,120}$/.test(body.path)) {
    paths.push(body.path);
  }

  for (const path of paths) revalidatePath(path);

  return NextResponse.json({
    ok: true,
    revalidated: { tags: TAGS, paths },
    at: new Date().toISOString(),
  });
}

import { timingSafeEqual } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';
import { LISTING_DATA_TAGS } from '@/lib/cache/tags';
import { purgeListingData } from '@/lib/cache/revalidate';

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

// The tags and the pages built from them now live together in
// lib/cache/revalidate. This list used to be hand-maintained here, and it
// drifted: 'biodata' was missing, so hand-authored biodata stayed cached for
// the full 30 minutes after an edit however many times this hook was called.
// A registry is harder to forget than a string literal.

/**
 * Constant-time compare, so the number of matching leading characters cannot
 * be read off the response time. Length is compared first because
 * timingSafeEqual throws on a length mismatch — that much is observable either
 * way, and a wrong-length guess tells an attacker nothing they can build on.
 */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET?.trim();

  // Fail closed when the secret is not configured.
  //
  // This used to read `if (secret && ...)`, which skipped the check entirely
  // whenever the variable was missing — and it was missing in production, so
  // the endpoint was open to anyone who knew the path. Purging every listing
  // tag on demand is a cheap way to force origin re-fetches for the whole
  // site, and an unauthenticated one is a denial-of-service lever.
  //
  // A missing secret is a deployment mistake, so it is answered as one rather
  // than as an authentication failure — 401 would send whoever set this up
  // hunting for a wrong credential instead of an absent one.
  if (!secret) {
    console.error('[revalidate] REVALIDATE_SECRET is not set — refusing to purge');
    return NextResponse.json(
      { ok: false, error: 'Revalidation is not configured on this deployment.' },
      { status: 503 },
    );
  }

  if (!secretMatches(req.headers.get('x-revalidate-secret'), secret)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // A missing or unparseable body is not an error: it means "the usual".
  let body: { slug?: unknown; path?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const extra: string[] = [];

  // Slugs are nano ids; anything else is not one of ours and is ignored
  // rather than passed to revalidatePath.
  if (typeof body.slug === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(body.slug)) {
    extra.push(`/p/${body.slug}`);
  }

  // Same-origin absolute paths only — never a full URL, never a traversal.
  if (typeof body.path === 'string' && /^\/[A-Za-z0-9/_-]{0,120}$/.test(body.path)) {
    extra.push(body.path);
  }

  purgeListingData(extra);

  return NextResponse.json({
    ok: true,
    revalidated: { tags: LISTING_DATA_TAGS, extraPaths: extra },
    at: new Date().toISOString(),
  });
}

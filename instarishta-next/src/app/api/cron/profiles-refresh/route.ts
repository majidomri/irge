/**
 * GET|POST /api/cron/profiles-refresh
 *
 * The scheduled twin of the "Refresh profiles" button in /nizam. Same work:
 * bust GitHub's CDN, repopulate the worker's KV cache, purge Next's tag —
 * see /api/admin/profiles/refresh for why all three are needed.
 *
 * The button covers "I just pushed an edit and want it live now". This covers
 * "keep it reasonably fresh without me having to remember" — point any
 * scheduler at it (Vercel cron, pg_cron + pg_net, an external pinger). Both
 * paths are safe to run as often as you like: the refresh is idempotent, and
 * a failed source fetch leaves the previous payload in place rather than
 * caching an error page.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` (or `?secret=`), matching
 * /api/cron/renewals and /api/cron/cohort-counts. Fails closed when
 * CRON_SECRET is unset.
 *
 * Note this needs BOTH secrets: CRON_SECRET to authorise the caller, and
 * PROFILES_PURGE_SECRET to authorise us to the worker. Neither is ever sent
 * to a browser.
 *
 * Node runtime.
 */
import { NextRequest, NextResponse } from 'next/server';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { purgeTag } from '@/lib/cache/revalidate';
import { PROFILE_WORKER_BASE, clearProfilesDevCache } from '@/lib/data';

export const runtime = 'nodejs';

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;                       // fail closed
  const header = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  const query  = new URL(req.url).searchParams.get('secret')?.trim();
  return header === secret || query === secret;
}

async function run(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const purgeSecret = process.env.PROFILES_PURGE_SECRET?.trim();
  if (!purgeSecret) {
    return NextResponse.json(
      { error: 'PROFILES_PURGE_SECRET is not set on this deployment' },
      { status: 503 },
    );
  }

  let count: number | null = null;

  try {
    const res = await fetch(`${PROFILE_WORKER_BASE}/api/profiles/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${purgeSecret}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      // 404 is what the worker returns for a bad secret as well as an
      // undeployed route — it does not distinguish them on purpose.
      const detail = res.status === 404
        ? 'worker rejected the refresh (secret mismatch or route not deployed)'
        : `worker returned ${res.status}`;
      return NextResponse.json({ ok: false, error: detail }, { status: 502 });
    }

    const data = await res.json().catch(() => ({}));
    count = typeof data.count === 'number' ? data.count : null;
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `could not reach the worker: ${(e as Error).message}` },
      { status: 502 },
    );
  }

  purgeTag(CACHE_TAGS.profiles);
  clearProfilesDevCache();

  return NextResponse.json({ ok: true, count, refreshedAt: new Date().toISOString() });
}

export const GET  = run;
export const POST = run;

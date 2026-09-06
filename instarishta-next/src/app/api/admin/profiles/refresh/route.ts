/**
 * POST /api/admin/profiles/refresh
 *
 * Force /profiles to pick up an edited jsdata.json immediately, instead of
 * waiting out the caches.
 *
 * There are THREE caches between a GitHub push and the profiles page, and a
 * refresh has to clear all of them or it only appears to work:
 *
 *   1. raw.githubusercontent.com's CDN  — the worker busts this with a
 *      cache-busting query param on refetch.
 *   2. The worker's KV cache (5 min)    — deleted, then repopulated from
 *      source, by the worker's own refresh endpoint.
 *   3. Next's unstable_cache (30 min)   — purgeTag(CACHE_TAGS.profiles) here.
 *
 * Order matters: the worker is refreshed FIRST, so that when Next's tag is
 * purged and the next visitor triggers a refetch, the worker already holds
 * the new payload. Purging Next first would just re-cache the stale copy.
 *
 * Security — the whole point of keeping profiles behind the worker:
 *   • Admin-gated by withAdmin (session + ADMIN_EMAILS allowlist).
 *   • PROFILES_PURGE_SECRET is read server-side and never reaches the
 *     browser. The admin page calls this route with its session cookie and
 *     nothing else, so there is no token in client code to lift.
 *   • The worker answers an unauthenticated caller with a bare 404, so the
 *     refresh endpoint is not discoverable from outside.
 *
 * Node runtime (inherited from withAdmin).
 */
import { NextResponse } from 'next/server';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { purgeTag } from '@/lib/cache/revalidate';
import { withAdmin } from '@/lib/admin-route';
import { PROFILE_WORKER_BASE, clearProfilesDevCache } from '@/lib/data';

export const POST = withAdmin(async () => {
  const secret = process.env.PROFILES_PURGE_SECRET?.trim();

  // Fail closed and say so plainly — this message only ever reaches an
  // authenticated admin, so it can be specific about the misconfiguration.
  if (!secret) {
    return NextResponse.json(
      { error: 'PROFILES_PURGE_SECRET is not set on this deployment' },
      { status: 503 },
    );
  }

  let count: number | null = null;
  let workerOk = false;
  let workerError: string | null = null;

  try {
    const res = await fetch(`${PROFILE_WORKER_BASE}/api/profiles/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      workerOk = true;
      count = typeof data.count === 'number' ? data.count : null;
    } else if (res.status === 404) {
      // The worker returns 404 for a wrong/missing secret as well as for an
      // undeployed route — it deliberately does not distinguish them, so
      // name both possibilities rather than guessing.
      workerError = 'Worker rejected the refresh — check PROFILES_PURGE_SECRET matches in Cloudflare, and that the worker is deployed.';
    } else {
      const data = await res.json().catch(() => ({}));
      workerError = data.error ?? `Worker returned ${res.status}`;
    }
  } catch (e) {
    workerError = (e as Error).name === 'TimeoutError'
      ? 'Worker did not respond within 15s'
      : `Could not reach the worker: ${(e as Error).message}`;
  }

  // Purge Next's cache regardless of the worker's outcome. If the worker
  // refresh failed the page is no more stale than it already was, and a
  // successful worker refresh must not be stranded behind Next's own cache.
  purgeTag(CACHE_TAGS.profiles);
  clearProfilesDevCache();

  if (!workerOk) {
    return NextResponse.json(
      { ok: false, error: workerError ?? 'Refresh failed', revalidated: true },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    count,
    refreshedAt: new Date().toISOString(),
  });
});

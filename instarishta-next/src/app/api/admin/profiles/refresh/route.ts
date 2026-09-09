/**
 * POST /api/admin/profiles/refresh
 *
 * Make an edited listing visible immediately instead of waiting out the cache.
 *
 * ── What this used to do ─────────────────────────────────────────────────────
 * There were THREE caches between a GitHub push and the profiles page, and a
 * refresh had to clear all of them or it only appeared to work: the
 * raw.githubusercontent.com CDN, the Cloudflare worker's 5-minute KV, and
 * Next's unstable_cache. This route orchestrated all three, in order, because
 * purging Next first would just re-cache the stale copy.
 *
 * The listings now live in ir_profile_ads (migration 032), so two of those
 * three caches are gone along with the network hop they were hiding. /profiles
 * reads the database directly on every request and does not need this at all;
 * what is left is the `profiles` tag, which the whole-catalogue consumers
 * (sitemap, /l/[id], the admin lists) still read through.
 *
 * To pull new listings in from the old jsdata.json, use
 * POST /api/admin/profile-ads/import — that is the fetch; this is the purge.
 *
 * Admin-gated by withAdmin. Node runtime.
 */
import { NextResponse } from 'next/server';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { purgeTag } from '@/lib/cache/revalidate';
import { withAdmin } from '@/lib/admin-route';
import { clearProfilesDevCache } from '@/lib/data';

export const POST = withAdmin(async (_req, { db }) => {
  purgeTag(CACHE_TAGS.profiles);
  clearProfilesDevCache();

  // Report what the catalogue actually holds. The old version reported a count
  // the worker claimed, which was one more thing that could be stale; this is
  // the number the next request will render.
  const { count, error } = await db
    .from('ir_profile_ads')
    .select('id', { count: 'exact', head: true })
    .eq('hidden', false);

  return NextResponse.json({
    ok: true,
    count: error ? null : count,
    refreshedAt: new Date().toISOString(),
  });
});

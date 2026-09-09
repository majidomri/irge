/**
 * GET|POST /api/cron/profiles-refresh
 *
 * The scheduled twin of the "Refresh profiles" button in /nizam: purge the
 * `profiles` tag so the whole-catalogue readers (sitemap, /l/[id], the admin
 * lists) pick up edits without anyone having to remember.
 *
 * It used to do considerably more — bust the GitHub CDN, repopulate the
 * Cloudflare worker KV, then purge Next — because the listings lived in
 * jsdata.json behind a relay and all three caches had to be cleared in order.
 * They are rows in ir_profile_ads now (migration 032), so two of those three
 * caches no longer exist, and with them the PROFILES_PURGE_SECRET this route
 * needed in order to talk to the worker.
 *
 * /profiles does not depend on this at all any more: it queries the database
 * per request. Safe to run as often as you like — purging a tag is idempotent.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` (or `?secret=`), matching
 * /api/cron/renewals and /api/cron/cohort-counts. Fails closed when
 * CRON_SECRET is unset.
 *
 * Node runtime.
 */
import { NextRequest, NextResponse } from 'next/server';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { purgeTag } from '@/lib/cache/revalidate';
import { clearProfilesDevCache } from '@/lib/data';

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

  purgeTag(CACHE_TAGS.profiles);
  clearProfilesDevCache();

  return NextResponse.json({ ok: true, refreshedAt: new Date().toISOString() });
}

export const GET  = run;
export const POST = run;

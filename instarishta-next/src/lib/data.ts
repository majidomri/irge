/**
 * Server-side data fetching — Remix loader pattern adapted for Next.js.
 *
 * unstable_cache() = persistent cross-request cache with tag invalidation
 *   → equivalent to Remix's loader caching + resource routes
 *   → POST /api/revalidate calls revalidateTag() to purge on-demand
 *
 * All fetches here run SERVER-SIDE ONLY — no client waterfalls.
 */
import { unstable_cache } from 'next/cache';
import { createClient } from '@supabase/supabase-js';

// In next dev, unstable_cache doesn't persist between requests.
// This module-level Map fills that gap so dev reloads are instant after first fetch.
const _dev = new Map<string, { v: unknown; exp: number }>();
function devCached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  if (process.env.NODE_ENV !== 'development') return fn();
  const hit = _dev.get(key);
  if (hit && hit.exp > Date.now()) return Promise.resolve(hit.v as T);
  return fn().then(v => { _dev.set(key, { v, exp: Date.now() + ttlMs }); return v; });
}

/**
 * Drop the dev-only profiles cache. revalidateTag() has no effect on the Map
 * above, so without this a force-refresh appears to do nothing in `next dev`
 * for up to two minutes — which reads as a broken button.
 */
export function clearProfilesDevCache(): void {
  _dev.delete('profiles');
}

export interface FeaturedItem {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  link_url: string | null;
}

export type ProfilePlacement = 'home' | 'channels' | 'profiles' | 'all';

// ── Profiles ──────────────────────────────────────────────────────────────────
// ISR: 30 min cache, tag 'profiles' for on-demand purge via POST /api/revalidate.

/**
 * Every loader below degrades to an empty result rather than throwing, so a
 * broken fetch, a missing env var and a genuinely empty table all render the
 * same blank UI. Log the difference — silent catches here cost real debugging
 * time when the featured carousel simply vanished with no trace anywhere.
 */
function loaderFailed(source: string, err: unknown): void {
  console.error(`[data] ${source} failed — rendering empty:`, err);
}

/**
 * Degrade to `fallback` on failure, WITHOUT letting the failure be cached.
 *
 * This wrapper has to sit outside unstable_cache, and that placement is the
 * entire point. An earlier version caught the error inside the cached function
 * and returned [] from there, so unstable_cache did what it is supposed to do
 * and stored the empty array against the key — for the full 30-minute
 * revalidate window. One blip from the profile worker therefore took the main
 * listing page down for half an hour and healed on its own, which is the
 * hardest possible shape of bug to catch in the act. It emptied /profiles in
 * production and had to be cleared with a tag purge.
 *
 * Throwing from inside the cached function instead means nothing is written,
 * so the next request retries. The empty result still reaches the page — the
 * page must not crash over a missing carousel — but it is never persisted.
 */
async function orEmpty<T>(source: string, fallback: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    loaderFailed(source, err);
    return fallback;
  }
}

/**
 * The whole catalogue, in feed order.
 *
 * This used to fetch jsdata.json from GitHub through a Cloudflare relay. It
 * now reads ir_profile_ads (migration 032) — the listings are hosted here, and
 * the relay, its KV cache and the GitHub CDN are all out of the path.
 *
 * /profiles no longer calls this: it asks lib/profile-ads.ts for one filtered,
 * counted, paginated page instead of pulling 500 rows to render 48. What is
 * left are the consumers that genuinely want every listing — sitemap.ts, the
 * /l/[id] permalink and its OG image, markdown-view, and the admin lists — so
 * the full read stays, and stays cached.
 *
 * The `.limit()` is explicit because PostgREST caps a request at 1000 rows by
 * default and would silently truncate a larger catalogue rather than error.
 * Raise it here and in the check below together.
 */
const CATALOGUE_LIMIT = 5000;

const cachedProfiles = unstable_cache(
  async () => devCached('profiles', 120_000, async () => {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data, error } = await sb
      .from('ir_profile_ads')
      .select('id, title, body, gender, phone, whatsapp, age_declared, education, priority, audio_url, instagram_post_id')
      .eq('hidden', false)
      .order('seq', { ascending: true })
      .limit(CATALOGUE_LIMIT);

    // Every failure below throws rather than returning [], so that the empty
    // result never becomes the cached answer. See orEmpty.
    if (error) throw new Error(error.message);
    // An empty catalogue is not a plausible state for a site with 500
    // listings, and caching it blanks every page that reads this. Treated as
    // a failure so the next request asks again — the same guard the worker
    // version had, and for the same reason.
    if (!data || data.length === 0) throw new Error('ir_profile_ads returned an empty catalogue');

    // `age_declared` is the column name; every consumer reads `age`. Renamed
    // here rather than in the table, because `age` alongside the derived
    // `age_years` would be two fields with one obvious name and no way to tell
    // which one a filter meant.
    return data.map(({ age_declared, ...rest }) => ({ ...rest, age: age_declared }));
  }),
  ['ir-profiles'],
  { revalidate: 1800, tags: ['profiles'] },
);

export const getProfiles = () => orEmpty('getProfiles', [] as unknown[], cachedProfiles);

// ── Featured carousel ─────────────────────────────────────────────────────────
// ISR: 30 min cache (aligned with profiles), tag 'featured' for on-demand purge
const cachedFeatured = unstable_cache(
  async (placement: ProfilePlacement) => devCached(`featured-${placement}`, 120_000, async () => {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data, error } = await sb
      .from('ir_featured')
      .select('id, title, description, image_url, link_url')
      .eq('active', true)
      .or(`placement.eq.all,placement.eq.${placement}`)
      .order('sort_order', { ascending: true })
      .limit(10);
    // Thrown, not swallowed: a query that errored and a carousel with nothing
    // in it are different facts, and only one of them should be remembered.
    // An empty result IS legitimate here — an admin can deactivate every
    // featured item — so unlike the profile feed it is cached as-is.
    if (error) throw new Error(error.message);
    return (data ?? []) as FeaturedItem[];
  }),
  ['ir-featured'],
  { revalidate: 1800, tags: ['featured'] },
);

export const getFeatured = (placement: ProfilePlacement) =>
  orEmpty(`getFeatured(${placement})`, [] as FeaturedItem[], () => cachedFeatured(placement));

// ── Authored biodata ──────────────────────────────────────────────────────────
// Rich biodata written in /nizam, keyed by feed profile id. Only a minority of
// profiles have one — the rest fall back to regex extraction over the ad text
// in BiodataModal, so a miss here is normal, not an error.
//
// Returned as a plain object rather than a Map: this crosses the server/client
// boundary as a prop, and a Map does not survive serialisation.
const cachedBiodata = unstable_cache(
  async () => devCached('biodata', 120_000, async () => {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data, error } = await sb.from('ir_biodata').select('profile_id, sections');
    // The previous version logged the error and then cached the empty map it
    // built from `data ?? []` anyway, so a failed read looked exactly like a
    // table with no rows — which this table genuinely has today.
    if (error) throw new Error(error.message);
    const out: Record<string, unknown> = {};
    for (const row of data ?? []) out[String(row.profile_id)] = row.sections;
    return out;
  }),
  ['ir-biodata'],
  { revalidate: 1800, tags: ['biodata'] },
);

export const getBiodata = () =>
  orEmpty('getBiodata', {} as Record<string, unknown>, cachedBiodata);

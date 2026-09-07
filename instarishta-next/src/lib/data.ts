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

/**
 * The Cloudflare relay in front of jsdata.json. Exported so the admin
 * force-refresh route (/api/admin/profiles/refresh) can reach the worker's
 * own cache — purging Next's tag alone is not enough, the worker holds a
 * separate 5-minute KV cache behind it.
 */
export const PROFILE_WORKER_BASE = 'https://instarishta-profile-relay.instarishtalead.workers.dev';

const WORKER_URL = `${PROFILE_WORKER_BASE}/api/profiles`;

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
//
// The Cloudflare worker enforces an Origin allowlist to block browser-based
// scrapers. Server-side fetches don't get an Origin attached automatically, so
// we send our production origin explicitly — the worker's check is a browser
// gate, not a real auth boundary, so this is the standard pattern.
const WORKER_ORIGIN = 'https://instarishta.me';

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

const cachedProfiles = unstable_cache(
  async () => devCached('profiles', 120_000, async () => {
    const res = await fetch(WORKER_URL, {
      cache: 'no-store',
      headers: { 'Origin': WORKER_ORIGIN, 'Referer': WORKER_ORIGIN + '/' },
    });
    // Every failure below throws rather than returning [], so that the empty
    // result never becomes the cached answer. See orEmpty.
    if (!res.ok) throw new Error(`worker responded ${res.status} ${res.statusText}`);

    const data = await res.json() as unknown;
    if (!Array.isArray(data)) throw new Error('worker payload was not an array');
    // An empty array from a healthy worker is not a plausible state for a
    // catalogue of 500 listings, and caching it blanks the site. Treated as a
    // failure so the next request asks again.
    if (data.length === 0) throw new Error('worker returned an empty catalogue');

    return data;
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

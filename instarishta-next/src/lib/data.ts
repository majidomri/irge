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

export const getProfiles = unstable_cache(
  async () => devCached('profiles', 120_000, async () => {
    try {
      const res = await fetch(WORKER_URL, {
        cache: 'no-store',
        headers: { 'Origin': WORKER_ORIGIN, 'Referer': WORKER_ORIGIN + '/' },
      });
      if (!res.ok) return [];
      const data = await res.json() as unknown;
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }),
  ['ir-profiles'],
  { revalidate: 1800, tags: ['profiles'] },
);

// ── Featured carousel ─────────────────────────────────────────────────────────
// ISR: 30 min cache (aligned with profiles), tag 'featured' for on-demand purge
export const getFeatured = unstable_cache(
  async (placement: ProfilePlacement) => devCached(`featured-${placement}`, 120_000, async () => {
    try {
      const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const { data } = await sb
        .from('ir_featured')
        .select('id, title, description, image_url, link_url')
        .eq('active', true)
        .or(`placement.eq.all,placement.eq.${placement}`)
        .order('sort_order', { ascending: true })
        .limit(10);
      return (data ?? []) as FeaturedItem[];
    } catch {
      return [] as FeaturedItem[];
    }
  }),
  ['ir-featured'],
  { revalidate: 1800, tags: ['featured'] },
);

// ── Authored biodata ──────────────────────────────────────────────────────────
// Rich biodata written in /nizam, keyed by feed profile id. Only a minority of
// profiles have one — the rest fall back to regex extraction over the ad text
// in BiodataModal, so a miss here is normal, not an error.
//
// Returned as a plain object rather than a Map: this crosses the server/client
// boundary as a prop, and a Map does not survive serialisation.
export const getBiodata = unstable_cache(
  async () => devCached('biodata', 120_000, async () => {
    try {
      const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const { data } = await sb.from('ir_biodata').select('profile_id, sections');
      const out: Record<string, unknown> = {};
      for (const row of data ?? []) out[String(row.profile_id)] = row.sections;
      return out;
    } catch {
      return {} as Record<string, unknown>;
    }
  }),
  ['ir-biodata'],
  { revalidate: 1800, tags: ['biodata'] },
);

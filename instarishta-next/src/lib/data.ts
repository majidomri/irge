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

const WORKER_URL = 'https://instarishta-profile-relay.instarishtalead.workers.dev/api/profiles';

// In next dev, unstable_cache doesn't persist between requests.
// This module-level Map fills that gap so dev reloads are instant after first fetch.
const _dev = new Map<string, { v: unknown; exp: number }>();
function devCached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  if (process.env.NODE_ENV !== 'development') return fn();
  const hit = _dev.get(key);
  if (hit && hit.exp > Date.now()) return Promise.resolve(hit.v as T);
  return fn().then(v => { _dev.set(key, { v, exp: Date.now() + ttlMs }); return v; });
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

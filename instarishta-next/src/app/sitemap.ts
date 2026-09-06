import type { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';

/**
 * sitemap.xml
 *
 * robots.txt has always pointed at this URL; until now nothing answered it.
 *
 * Static routes are listed unconditionally. Slugs come from ir_nano_ids, the
 * same table the /p/[slug] route resolves against, and a database failure
 * degrades to the static list rather than taking the whole sitemap down --
 * a 200 listing fewer pages beats a 500 listing none.
 */
export const revalidate = 3600;

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://instarishta.me').replace(/\/$/, '');

/** Public, indexable, and stable enough to be worth a crawl budget. */
const STATIC_ROUTES: Array<[string, MetadataRoute.Sitemap[number]['changeFrequency'], number]> = [
  ['', 'daily', 1],
  ['/profiles', 'daily', 0.9],
  ['/channels', 'weekly', 0.7],
  ['/biodata', 'weekly', 0.7],
  ['/pricing', 'monthly', 0.6],
  ['/security', 'yearly', 0.3],
  ['/child-safety', 'yearly', 0.3],
  ['/privacy', 'yearly', 0.3],
  ['/toc', 'yearly', 0.3],
  ['/disclaimer', 'yearly', 0.3],
  ['/refund-policy', 'yearly', 0.3],
];

/**
 * Share slugs that resolve under /p.
 *
 * Posts belong here too: /post/[slug] is only a 308 to /p/[slug], kept alive
 * for links already out in the world. Listing those pointed 96 of the
 * sitemap's 136 URLs at redirects and spent crawl budget getting nowhere.
 *
 * Channels are deliberately absent. /channels/[slug] matches ir_channels.slug,
 * not a nano id, so the seven channel URLs this used to emit were 404s.
 */
const SHARE_TYPES = ['profile', 'post'];

async function dynamicEntries(): Promise<MetadataRoute.Sitemap> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];

  try {
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const [shares, channels] = await Promise.all([
      db.from('ir_nano_ids')
        .select('slug, created_at')
        .in('entity_type', SHARE_TYPES)
        .limit(20000),
      db.from('ir_channels')
        .select('slug, created_at')
        .limit(1000),
    ]);

    const entries: MetadataRoute.Sitemap = [];

    for (const row of shares.data ?? []) {
      if (!row.slug) continue;
      entries.push({
        url: `${SITE_URL}/p/${row.slug}`,
        lastModified: row.created_at ? new Date(row.created_at as string) : undefined,
        changeFrequency: 'weekly',
        priority: 0.6,
      });
    }

    for (const row of channels.data ?? []) {
      if (!row.slug) continue;
      entries.push({
        url: `${SITE_URL}/channels/${row.slug}`,
        lastModified: row.created_at ? new Date(row.created_at as string) : undefined,
        changeFrequency: 'daily',
        priority: 0.8,
      });
    }

    return entries;
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  return [
    ...STATIC_ROUTES.map(([path, changeFrequency, priority]) => ({
      url: `${SITE_URL}${path}`,
      lastModified: now,
      changeFrequency,
      priority,
    })),
    ...(await dynamicEntries()),
  ];
}

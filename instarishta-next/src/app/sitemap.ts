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

/** entity_type -> route prefix. Anything else is not a public page. */
const ROUTE_FOR: Record<string, string> = {
  profile: '/p',
  post: '/post',
  channel: '/channels',
};

async function dynamicEntries(): Promise<MetadataRoute.Sitemap> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];

  try {
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await db
      .from('ir_nano_ids')
      .select('slug, entity_type, created_at')
      .in('entity_type', Object.keys(ROUTE_FOR))
      .limit(20000);

    if (error || !data) return [];

    return data.flatMap((row) => {
      const prefix = ROUTE_FOR[row.entity_type as string];
      if (!prefix || !row.slug) return [];
      return [{
        url: `${SITE_URL}${prefix}/${row.slug}`,
        lastModified: row.created_at ? new Date(row.created_at as string) : undefined,
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      }];
    });
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

/**
 * The channel feed's first screen, fetched on the server.
 *
 * Why this exists: the feed was entirely client-rendered, so the browser had
 * to boot the JS bundle and wait for a Supabase round trip before it knew a
 * single image existed. Lighthouse on the live site put 6016ms of a 7.1s LCP
 * into "load delay" -- 85% of it -- against only 287ms actually spent
 * transferring the image. No amount of `priority` helps an element that is
 * not in the HTML.
 *
 * These queries mirror the browser ones in lib/supabase.ts exactly (same
 * columns, same order, same page size, which is imported rather than
 * repeated). If one changes, change both: the server renders page 0 and the
 * client continues from page 1, and a mismatch would either duplicate or skip
 * a post at the seam.
 *
 * The anon key, not the service role: this is the same public data the browser
 * already reads directly under RLS. A server component is not a reason to
 * reach for higher privileges than the page needs.
 */
import { createClient } from '@supabase/supabase-js';
import { cache } from 'react';

import { POST_PAGE_SIZE } from './feed-constants';
// `import type` is erased at compile time, so this does NOT pull lib/supabase
// (and its browser client) into the server bundle.
import type { IChannel, IPost } from './supabase';

const SUPABASE_URL = 'https://cxgxyqxeakjrghfzkuko.supabase.co';
const SUPABASE_ANON = 'sb_publishable_C2qwOBB0NvHL0KRGwpXBQg_UGZFoCis';

function db() {
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface FeedBootstrap {
  channel: IChannel | null;
  posts: IPost[];
  total: number;
  siblings: { id: string; name: string; slug: string }[];
}

/**
 * Everything the first paint needs, in one round of parallel queries.
 *
 * A failure here is not a broken page: the client component falls back to
 * fetching for itself, exactly as it did before. So this returns empties
 * rather than throwing — a slow Supabase should cost the LCP win, not the
 * feed.
 *
 * Wrapped in React's cache() because /channels/[slug] calls it twice for the
 * same render — once in generateMetadata for the title and description, once
 * in the page for the feed itself. Each call is four Supabase queries (the
 * channel, then posts, count and siblings in parallel), so without the
 * memo every channel render paid for eight. cache() dedupes within a single
 * request, which is the same reason lib/slug-resolve.ts wraps resolveSlug.
 */
export const getChannelFeed = cache(async (slug: string): Promise<FeedBootstrap> => {
  const client = db();

  const { data: channel } = await client
    .from('ir_channels')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (!channel) return { channel: null, posts: [], total: 0, siblings: [] };

  const [postsRes, countRes, siblingsRes] = await Promise.all([
    client
      .from('ir_posts')
      .select('*')
      .eq('channel_id', channel.id)
      .order('created_at', { ascending: false })
      .range(0, POST_PAGE_SIZE - 1),
    client
      .from('ir_posts')
      .select('id', { count: 'exact', head: true })
      .eq('channel_id', channel.id),
    client
      .from('ir_channels')
      .select('id, name, slug')
      .order('name'),
  ]);

  return {
    channel: channel as IChannel,
    posts: (postsRes.data ?? []) as IPost[],
    total: countRes.count ?? 0,
    siblings: (siblingsRes.data ?? []) as { id: string; name: string; slug: string }[],
  };
});

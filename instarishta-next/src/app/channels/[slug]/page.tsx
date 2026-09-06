/**
 * /channels/[slug] — the channel feed, with its first screen server-rendered.
 *
 * This route used to be a single client component that fetched everything on
 * mount. That put the whole first screen behind "boot the bundle, then wait
 * for Supabase": Lighthouse on the live site measured a 7.1s LCP of which
 * 6016ms (85%) was load DELAY -- the browser had no idea an image existed --
 * against 287ms actually transferring it. `priority` cannot help an element
 * that is not in the HTML, so the fix is to put it there.
 *
 * The split is deliberately thin: this file fetches and hands over, and
 * ChannelFeedClient still owns every piece of behaviour it did before,
 * continuing from page 1.
 */
import { serverDb } from '@/lib/slug-resolve';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getChannelFeed } from '@/lib/feed-server';
import ChannelFeedClient from './ChannelFeedClient';

/**
 * Rendered per request, but cached for a minute at the edge.
 *
 * A channel gains posts in bursts, not continuously, and the client
 * subscribes to realtime inserts the moment it hydrates -- so a reader who
 * arrives on a 60-second-old page still sees a new post appear without
 * reloading. Paying for a fresh query on every single visit buys nothing that
 * the live subscription does not already provide.
 */
export const revalidate = 60;

/**
 * Pre-render the channels that exist, so the first visit to one is a file read
 * rather than a query. There are seven; the build cost is negligible, and a
 * channel created later still renders on demand and caches from then on.
 */
export const dynamicParams = true;

export async function generateStaticParams() {
  if (process.env.NODE_ENV === 'development') return [];

  // ir_channels.slug — this route matches the channel's own slug, not a nano
  // id. Prerendering nano ids baked a 404 into every channel page.
  const { data, error } = await serverDb()
    .from('ir_channels')
    .select('slug')
    .limit(1000);

  // Never fail the build over this; without params every channel just renders
  // on demand, which is what happened before.
  if (error || !data) return [];

  return data
    .filter((row) => typeof row.slug === 'string' && row.slug)
    .map((row) => ({ slug: row.slug as string }));
}

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const { channel, total } = await getChannelFeed(slug);
  if (!channel) return { title: 'Channel not found · InstaRishta' };
  return {
    title: `${channel.name} · InstaRishta`,
    description: channel.description
      ?? `${total} rishta profiles in ${channel.name} on InstaRishta.`,
  };
}

export default async function ChannelFeedPage({ params }: Params) {
  const { slug } = await params;
  const { channel, posts, total, siblings } = await getChannelFeed(slug);

  // A slug with no channel behind it is a 404, not an empty feed with an
  // error message in it — which is what the client component used to render.
  if (!channel) notFound();

  return (
    <ChannelFeedClient
      slug={slug}
      initialChannel={channel}
      initialPosts={posts}
      initialTotal={total}
      initialSiblings={siblings}
    />
  );
}

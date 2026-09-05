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

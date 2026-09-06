/**
 * /p/[slug] — one public share route for both profiles and posts.
 *
 * These used to be two routes, /p for profiles and /post for posts, which
 * meant a share link's prefix depended on what was being shared and a reader
 * could not tell what /post/xxx even was. Slugs are globally unique across
 * entity types (ir_nano_ids.slug is the primary key), so the prefix carries no
 * information the slug doesn't already have — the entity type is a lookup, not
 * a routing decision.
 *
 * /post/[slug] still exists and permanently redirects here, so every link
 * already shared stays alive.
 *
 * Stories keep their own /s/[slug] route: a story is a different surface with
 * a different lifetime, not a variant of this page.
 */
import { resolveSlug, serverDb } from '@/lib/slug-resolve';
import { notFound }     from 'next/navigation';
import type { Metadata } from 'next';
import ProfileView      from './ProfileView';
import PostView         from './PostView';

/**
 * Pre-render every share page, and keep them fresh with ISR.
 *
 * Rendered on demand, this route cost several Supabase round trips before
 * anything reached the browser, and Next marks a dynamically rendered page
 * `no-store` — which also kept it out of the back/forward cache. Pre-rendering
 * turns the request into a static file read.
 *
 * There are ~120 of these, not the 5,000 the experiment this is adapted from
 * used, so the build cost is seconds rather than minutes. The counters shown
 * on the page go stale for up to `revalidate`, which is the trade: an
 * approximate view count against a page that arrives immediately.
 */
export const revalidate = 600;

/**
 * A slug created after the last build still renders — it is generated on the
 * first request and cached from then on, so publishing does not wait for a
 * deploy.
 */
export const dynamicParams = true;

export async function generateStaticParams() {
  // The article's own advice: skip this in development so `next dev` does not
  // pay for a full listing on every start.
  if (process.env.NODE_ENV === 'development') return [];

  const { data, error } = await serverDb()
    .from('ir_nano_ids')
    .select('slug')
    .in('entity_type', ['profile', 'post'])
    .limit(5000);

  // A failure here must not fail the build: with no params every page simply
  // renders on demand, which is exactly the behaviour we had before.
  if (error || !data) return [];

  return data
    .filter((row) => typeof row.slug === 'string' && row.slug)
    .map((row) => ({ slug: row.slug as string }));
}

/**
 * Which kind of thing does this slug point at?
 *
 * resolveSlug is request-cached, so generateMetadata and the render below
 * share one lookup instead of issuing two, and ProfileView/PostView reuse the
 * same result rather than repeating it a third time.
 */
async function resolveType(slug: string): Promise<string | null> {
  const resolved = await resolveSlug(slug);
  return resolved?.entity_type ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const type = await resolveType(slug);
  const isPost = type === 'post';
  return {
    title: isPost
      ? `Post · instarishta.me/p/${slug}`
      : `Profile · instarishta.me/p/${slug}`,
    description: isPost
      ? 'View this matrimony post on InstaRishta.'
      : 'View this matrimony profile on InstaRishta.',
  };
}

export default async function SharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const type = await resolveType(slug);

  if (type === 'profile') return <ProfileView slug={slug} />;
  if (type === 'post')    return <PostView    slug={slug} />;

  // Unknown slug, or one belonging to a type this route doesn't render
  // (story, channel, highlight — those have their own routes).
  return notFound();
}

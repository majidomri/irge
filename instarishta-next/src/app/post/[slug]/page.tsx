/**
 * /post/[slug] — permanent redirect to the unified /p/[slug] share route.
 *
 * Kept as a redirect rather than deleted because links like
 * instarishta.me/post/4tkPf-mEbb--D are already out in the world — in
 * WhatsApp threads, in search indexes, in people's messages. Removing the
 * route would 404 all of them.
 *
 * 308 (permanent) so crawlers transfer ranking to the new URL and clients
 * preserve the method; `permanentRedirect` is Next's helper for exactly this.
 */
import { permanentRedirect } from 'next/navigation';

export default async function LegacyPostSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  permanentRedirect(`/p/${slug}`);
}

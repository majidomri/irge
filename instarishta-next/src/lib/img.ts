/**
 * Image delivery helpers.
 *
 * Everything the site shows is a 1080x1920 frame or an uploaded photo, and
 * most places show it far smaller than that: a feed tile is ~177px wide, a
 * story ring is 64px. Served raw, each of those downloaded the whole original
 * -- the channel feed's first screen was 3.5 MB of JPEG for twenty-four
 * thumbnails.
 *
 * `next/image` fixes that wherever a component renders the tag itself. These
 * helpers cover the places that cannot: zuck.js builds its own DOM from URLs
 * we hand it, so the URL itself has to be the optimized one.
 *
 * Format is negotiated, not stored: with `images.formats` set to
 * ['image/avif', 'image/webp'], the optimizer answers an AVIF-capable browser
 * with AVIF, an older one with WebP, and anything else with the original --
 * the same progressive enhancement <picture> gives, without keeping three
 * copies of every frame in the bucket. Measured on a real 233 KB frame:
 * 1200px wide comes back as 47 KB AVIF against 67 KB WebP and 105 KB JPEG.
 */

/**
 * Hosts `next/image` is allowed to fetch — must stay in step with
 * `images.remotePatterns` in next.config.ts. The optimizer answers 400 for
 * anything else, so a URL from outside this list has to be left alone rather
 * than rewritten: /nizam's image fields are free text and an admin can paste
 * a URL from anywhere.
 */
const OPTIMIZABLE_HOSTS = [
  'cxgxyqxeakjrghfzkuko.supabase.co',
  'res.cloudinary.com',
  'placehold.co',
];

export function isOptimizable(url: string | null | undefined): boolean {
  if (!url) return false;
  if (url.startsWith('/') || url.startsWith('data:')) return true;
  try {
    return OPTIMIZABLE_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * The optimizer URL for an image, at the width it will actually be shown.
 *
 * `width` must be one of the sizes configured in next.config.ts
 * (imageSizes + deviceSizes), or the optimizer rejects it — pass the next
 * size UP from what the element needs at the viewer's pixel ratio.
 *
 * A URL the optimizer may not fetch is returned unchanged, so a caller can
 * use this unconditionally.
 */
export function optimized(url: string, width: number, quality = 75): string {
  if (!isOptimizable(url)) return url;
  if (url.startsWith('/_next/image')) return url;      // already rewritten
  return `/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=${quality}`;
}

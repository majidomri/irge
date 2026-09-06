/**
 * The site's own origin, in one place.
 *
 * This was read as `process.env.NEXT_PUBLIC_SITE_URL ?? '<default>'` in four
 * files, and the four defaults did not agree:
 *
 *   app/layout.tsx                 https://instarishta.com     ← wrong TLD
 *   app/l/[id]/page.tsx            https://www.instarishta.me
 *   app/sitemap.ts                 https://instarishta.me
 *   app/api/share-card/[slug]      https://instarishta.me
 *
 * The variable is set in Vercel today, so the fallbacks never fire in
 * production and nothing is currently mis-tagged. The hazard is a deploy where
 * it is missing — a preview, a new environment, a restored project. Then
 * layout.tsx's `metadataBase` silently becomes a domain nobody here owns, and
 * because metadataBase resolves every *relative* metadata URL, canonical tags
 * and OG images across the whole site would point at instarishta.com.
 *
 * That is the failure this module exists to prevent, and it is worth
 * preventing given how much of this project's work is about being indexed and
 * cited correctly.
 *
 * Safe to import from a client component: NEXT_PUBLIC_ values are already in
 * the browser bundle. Deliberately not in config/env.ts, which is server-only
 * because it carries the service-role key.
 */

/** No trailing slash, so `${SITE_URL}/path` is always well-formed. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.instarishta.me'
).replace(/\/+$/, '');

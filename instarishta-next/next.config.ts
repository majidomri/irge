import type { NextConfig } from "next";
import path from "path";

/**
 * Security headers — applied to every response.
 * These replace what Apache's [CORE] block handled:
 *   ServerSignature Off  → poweredByHeader: false
 *   Options -Indexes     → Next.js never lists directories (default)
 *
 * Headers are added via next.config headers() rather than .htaccess.
 */
const SECURITY_HEADERS = [
  // Prevent browsers from MIME-sniffing the content type
  { key: 'X-Content-Type-Options', value: 'nosniff' },

  // Disallow framing (clickjacking protection)
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },

  // Legacy XSS filter — still respected by some older browsers
  { key: 'X-XSS-Protection', value: '1; mode=block' },

  // Only send origin on HTTPS cross-origin requests, nothing on downgrade
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

  // Disable features we don't use to reduce attack surface
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },

  // Force HTTPS for 2 years (includeSubDomains + preload for browser preload list)
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },

  // NOTE: Cross-Origin-Opener-Policy, Cross-Origin-Embedder-Policy, and
  // Cross-Origin-Resource-Policy are intentionally omitted.
  // COEP 'require-corp' would block cross-origin images from Supabase storage;
  // COOP 'same-origin' would break auth redirect / popup flows.
  // Add these only after verifying all resource origins set appropriate headers.
];

const nextConfig: NextConfig = {
  poweredByHeader: false,

  // /nizam's post/story "Image URL" fields are free text, and next/image
  // rejects any host not listed here. This used to be hostname:'**', which
  // meant two things worth avoiding: Vercel bills image optimization per
  // source image transformed, so an open allowlist makes that spend
  // unbounded; and it let any URL reaching the feed be fetched by our
  // optimizer, which is a server-side request on our behalf.
  //
  // Listed hosts are the ones actually in use (checked against ir_posts /
  // ir_stories / ir_channels / ir_highlights / ir_featured) plus our own
  // Supabase storage. ADDING A HOST IS A ONE-LINE CHANGE — if an admin
  // pastes an image from somewhere new, it renders fine through the plain
  // <img> tags in the channel feed and PostModal, and only /p/[slug],
  // /post/[slug] and /s/[slug] (which use next/image) will show it broken
  // until its host is added below.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'placehold.co' },
      { protocol: 'https', hostname: 'cxgxyqxeakjrghfzkuko.supabase.co' },
    ],
    /**
     * AVIF first, WebP second, original last.
     *
     * The default is ['image/webp'] alone, so no visitor was ever served
     * AVIF. The optimizer picks by the browser's Accept header, which is the
     * same progressive enhancement the <picture> element gives -- browsers
     * that understand AVIF get it, the rest get WebP, and anything older
     * gets the original. Nothing has to be stored twice for it.
     *
     * AVIF encodes slower than WebP, which costs on a cache miss; with a
     * 31-day TTL below and content-addressed URLs that never change behind
     * themselves, a miss is close to a one-off per image.
     */
    formats: ['image/avif', 'image/webp'],

    // Uploaded images never change behind their URL, so re-optimising them
    // every 60s (the default TTL) is pure waste — each miss is another
    // billable transformation. 31 days.
    minimumCacheTTL: 2678400,
    // Every distinct width is separately transformed and billed. The default
    // eight device sizes generate far more variants than this layout asks
    // for: covers render at container width, thumbnails at 80px.
    deviceSizes: [640, 828, 1200, 1920],
    // 384 earns its place: a feed tile is ~177px wide on a phone, which at
    // DPR 2 asks for 354 and would otherwise round all the way up to 640.
    imageSizes: [80, 160, 256, 384],

    /**
     * Allowed `quality` values. Anything not listed is rejected, which is the
     * point: each distinct quality is a separate transformation and a separate
     * cache entry, so leaving it open multiplies both the bill and the miss
     * rate.
     *
     * 75 is the default and stays for anything looked at properly. 45 is for
     * images the layout never shows at size — an 80px thumbnail strip, a
     * backdrop blurred to nothing — where the difference is invisible and the
     * saving is not.
     */
    qualities: [45, 75],
  },

  turbopack: {
    root: path.resolve(__dirname),
  },
  devIndicators: false,

  experimental: {
    // Inline the route's atomic Tailwind CSS into <style> tags in the
    // document head — kills the render-blocking <link rel="stylesheet">
    // round-trip Lighthouse keeps flagging. Equivalent to Remix's
    // critical-CSS-in-document pattern.
    inlineCss: true,
  },

  async headers() {
    return [
      {
        // Apply security headers to every route
        source: '/(.*)',
        headers: SECURITY_HEADERS,
      },
      {
        /**
         * The self-hosted Nastaliq subset. Files under public/ get
         * `public, max-age=0` by default, so a 239 KB face that never changes
         * was being revalidated on every visit.
         *
         * `immutable` is a promise, and the way to keep it is to rename the
         * file rather than replace it — a new subset means a new filename.
         */
        source: '/fonts/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        /**
         * These URLs answer with HTML or markdown depending on Accept (see
         * middleware.ts), so any shared cache has to key on it. Setting this
         * in middleware did not stick — Next replaces Vary on the response —
         * and a CDN without it would eventually hand markdown to a browser.
         */
        source: '/:path(|profiles|channels|biodata|pricing|security|child-safety|privacy|toc|disclaimer|refund-policy)',
        headers: [{ key: 'Vary', value: 'Accept' }],
      },
      {
        source: '/p/:slug',
        headers: [{ key: 'Vary', value: 'Accept' }],
      },
      {
        /**
         * RFC 8288 Link headers, so an agent can find the machine-readable
         * description of this site before parsing any HTML.
         *
         * Deliberately no rel="api-catalog" or rel="service-desc". Those
         * advertise an API for third parties to call, and there isn't one:
         * every route under /api/ serves this site's own frontend and is
         * authenticated, admin-only, or a cron target. Publishing a catalog
         * of them would invite traffic they are not built to answer and that
         * the rate limiters would reject anyway. llms.txt says the same thing
         * in prose.
         *
         * rel values below are all in the IANA link relations registry.
         */
        source: '/',
        headers: [
          {
            key: 'Link',
            value: [
              '</md>; rel="alternate"; type="text/markdown"',
              '</llms.txt>; rel="describedby"; type="text/plain"',
              '</manifest.webmanifest>; rel="manifest"; type="application/manifest+json"',
              '</sitemap.xml>; rel="describedby"; type="application/xml"',
              '</toc>; rel="terms-of-service"',
              '</privacy>; rel="privacy-policy"',
            ].join(', '),
          },
        ],
      },
      {
        /**
         * The traffic-advice file must be served as this exact type or the
         * prefetch proxy ignores it. It opts this origin in to cross-site
         * prefetching from search results, so the first page a visitor sees
         * can already be in their browser before they click.
         */
        source: '/.well-known/traffic-advice',
        headers: [{ key: 'Content-Type', value: 'application/trafficadvice+json' }],
      },
      {
        /**
         * Public pages, cacheable and — the reason this entry exists —
         * bfcache-eligible.
         *
         * A dynamically rendered route gets `no-store` from Next by default,
         * and Chrome refuses to put a `no-store` page in the back/forward
         * cache at all. Lighthouse flagged exactly that on the channel feed.
         * None of these pages render anything per-user on the server: the
         * navbar and session are client components, so the HTML is the same
         * for everyone and is safe to cache.
         *
         * 60 seconds with a long stale-while-revalidate: a channel gains
         * posts in bursts, and the feed subscribes to realtime inserts once
         * it hydrates, so a reader on a slightly stale document still sees
         * new posts arrive without reloading.
         */
        source: '/:path(channels|live|p|s|post)',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=60, stale-while-revalidate=600' },
        ],
      },
      {
        // The same rule for everything below those prefixes. Two entries and
        // not one, because `/:rest*` does not match the bare prefix -- with
        // only the nested form, /live kept its no-store and stayed out of
        // bfcache while /live/anything did not.
        source: '/:path(channels|live|p|s|post)/:rest*',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=60, stale-while-revalidate=600' },
        ],
      },
      {
        // Remix-style HTTP caching for the dynamic /profiles route. The page
        // is server-filtered per searchParams, but the underlying data updates
        // only every ~30 min (ISR revalidate). Letting a CDN cache for that
        // window with stale-while-revalidate keeps p99 latency low.
        source: '/profiles',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=1800, stale-while-revalidate=3600' },
        ],
      },
    ];
  },
};

export default nextConfig;

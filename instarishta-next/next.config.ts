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

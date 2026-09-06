import type { Metadata } from 'next';
import { Inter, Noto_Naskh_Arabic } from 'next/font/google';
import './globals.css';
import SiteShell from '@/components/SiteShell';
import PreloadResources from '@/components/PreloadResources';
import ContentProtection from '@/components/ContentProtection';
import { DevAnnotation } from '@/components/DevAnnotation';
import { GoogleOneTap } from '@/components/GoogleOneTap';
import { SpeculationRules } from '@/components/SpeculationRules';
import LazyNastaliq from '@/components/LazyNastaliq';
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';
import { WebVitals } from '@/components/WebVitals';

// Variable Inter (latin) — ~80 KB single file with all weights, smaller than
// shipping multiple non-variable cuts and lets next/font auto-preload it.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// Naskh Arabic is the *primary* Urdu/Arabic font during initial paint —
// ~85 KB, ships in the critical CSS, used for LCP.
const notoNaskhArabic = Noto_Naskh_Arabic({
  subsets: ['arabic'],
  // No `weight`: that asks next/font for the variable file, one wght 400-700
  // axis instead of a separate static cut per weight.
  variable: '--font-arabic',
  display: 'swap',
});

// NOTE: Noto Nastaliq Urdu (~234 KB) was previously loaded via next/font and
// dragged onto the LCP critical chain. Remix-style: only load LCP-critical
// resources synchronously. Nastaliq is a calligraphic visual upgrade — it
// loads asynchronously via <LazyNastaliq /> after first paint, then text
// swaps from Naskh → Nastaliq with no LCP penalty.

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://instarishta.com'),
  title: {
    default: 'InstaRishta — Trusted Muslim Matrimony & Nikah Matchmaking',
    template: '%s — InstaRishta',
  },
  description:
    'Find verified Muslim marriage proposals on InstaRishta. Trusted nikah matchmaking platform with family-controlled contact and verified profiles.',
  keywords: ['Muslim matrimony', 'nikah', 'rishta', 'Muslim marriage', 'halal matchmaking'],
  authors: [{ name: 'InstaRishta' }],
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
  openGraph: {
    siteName: 'InstaRishta',
    type: 'website',
    // No `images` here on purpose: opengraph-image.tsx generates the PNG
    // and an explicit entry would override it — which is how this ended up
    // advertising an SVG that no platform will render.
  },
  verification: {
    // Two Search Console properties are verified against this origin; both
    // tags have to stay in the head or the older one loses verification.
    google: [
      'fe-DSxzYfbTmx1W4Mid5V-GEOz2s-QdQEOaBIERNpuI',
      'd9uyXoGcUWeI62JAiuwUG2f9Z5FkwuBE_JsAd7hJMzU',
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${inter.variable} ${notoNaskhArabic.variable}`}
    >
      <body className="min-h-full flex flex-col">
        <PreloadResources />
        <ContentProtection />
        <ServiceWorkerRegistration />
        <WebVitals />
        <LazyNastaliq />
        {/* Prefetches the next page on hover; see the component for what it
            deliberately never speculates on. */}
        <SpeculationRules />
        <SiteShell>{children}</SiteShell>
        {/* Renders nothing; prompts Google One Tap once for signed-out
            visitors, and stays quiet on admin, payment and auth routes. */}
        <GoogleOneTap />
        <DevAnnotation />
      </body>
    </html>
  );
}

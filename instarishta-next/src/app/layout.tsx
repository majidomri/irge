import type { Metadata } from 'next';
import { Inter, Noto_Naskh_Arabic } from 'next/font/google';
import './globals.css';
import SiteShell from '@/components/SiteShell';
import PreloadResources from '@/components/PreloadResources';
import LazyNastaliq from '@/components/LazyNastaliq';

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
  weight: ['400', '700'],
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
    images: [{ url: '/logo.svg', width: 512, height: 512, alt: 'InstaRishta' }],
  },
  verification: {
    google: 'fe-DSxzYfbTmx1W4Mid5V-GEOz2s-QdQEOaBIERNpuI',
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
        <LazyNastaliq />
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}

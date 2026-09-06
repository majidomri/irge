import type { Metadata } from 'next';

/**
 * Metadata for /pricing.
 *
 * The page is a client component, so it cannot export `metadata` itself, and
 * it was inheriting the root layout's title — which meant /pricing, /biodata
 * and /channels all published the homepage title and description, with no
 * canonical of their own. Duplicate titles across pages are one of the things
 * Search Console flags, and a missing canonical leaves Google to guess which
 * URL is authoritative.
 *
 * A segment layout can carry metadata for a client page without touching it.
 */
export const metadata: Metadata = {
  title: 'Plans & Pricing',
  description: 'Contact credits for InstaRishta, refilled every month. Browsing verified Muslim rishta profiles is always free.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: 'Plans & Pricing — InstaRishta',
    description: 'Contact credits for InstaRishta, refilled every month. Browsing verified Muslim rishta profiles is always free.',
    url: '/pricing',
  },
};

export default function SegmentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

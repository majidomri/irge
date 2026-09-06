import type { Metadata } from 'next';

/**
 * Metadata for /biodata.
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
  title: 'Submit Your Bio Data',
  description: 'Add a rishta profile to InstaRishta. Every submission is reviewed by our team before it is published.',
  alternates: { canonical: '/biodata' },
  openGraph: {
    title: 'Submit Your Bio Data — InstaRishta',
    description: 'Add a rishta profile to InstaRishta. Every submission is reviewed by our team before it is published.',
    url: '/biodata',
  },
};

export default function SegmentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

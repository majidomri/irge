import type { Metadata } from 'next';
import { SITE_URL } from '@/config/site';

/**
 * Metadata for "/" only.
 *
 * The homepage is a client component, so it cannot export `metadata` itself,
 * and the root layout is the wrong place for a canonical: every page that does
 * not override it would inherit `/` and declare itself a duplicate of the
 * homepage. A route group gives "/" its own layout without changing the URL.
 *
 * The structured data lives here too, because WebSite and Organization
 * describe the site rather than any one page. Google reads Organization for
 * the knowledge panel, and an answer engine asked "what is InstaRishta" gets
 * a name, a URL and a description as fields instead of having to infer them
 * from prose — which is the same reason /l/[id] carries ItemPage JSON-LD.
 */
export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: 'InstaRishta',
      description:
        'Verified Muslim rishta and nikah listings, with contact details released ' +
        'under the listing family’s control.',
      inLanguage: ['en', 'ur'],
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'InstaRishta',
      url: SITE_URL,
      description:
        'A Muslim matrimony service for Hyderabad and the wider Indian diaspora, ' +
        'built around wali and family approved introductions.',
      areaServed: 'IN',
    },
  ],
};

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(JSON_LD).replace(/</g, '\\u003c'),
        }}
      />
      {children}
    </>
  );
}

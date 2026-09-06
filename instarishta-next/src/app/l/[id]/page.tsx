/**
 * /l/[id] — one listing, at its own URL.
 *
 * Built so an answer engine has something to cite. Until now a feed listing
 * existed only as a filtered view of /profiles: no permalink, no per-listing
 * metadata, nothing for a crawler to index or a model to link to. A page that
 * cannot be addressed cannot be recommended.
 *
 * Contacts are absent by construction, not by filtering. The listing's `phone`
 * and `whatsapp` fields are never read here, and the body is passed through
 * the shared redactor, which also catches numbers, emails and handles typed
 * into the prose. What is published is what a signed-out visitor already sees
 * on /profiles.
 *
 * Prerendered with ISR: 500 static pages that cost nothing to serve and can be
 * crawled without waking the database.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProfiles } from '@/lib/data';
import { hiddenSet } from '@/lib/moderation';
import { redactContacts } from '@/lib/redact';
import { rtlTextProps } from '@/lib/text-direction';
import { isUrgent } from '@/app/profiles/_shared';
import type { Profile } from '@/types/profile';

export const revalidate = 3600;
export const dynamicParams = true;

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.instarishta.me';

type Params = { params: Promise<{ id: string }> };

/** The listing behind an id, or null — hidden ones are treated as absent. */
async function findListing(id: string): Promise<Profile | null> {
  const numeric = Number.parseInt(id, 10);
  if (!Number.isFinite(numeric)) return null;

  const [all, hidden] = await Promise.all([
    getProfiles() as Promise<Profile[]>,
    hiddenSet('profile'),
  ]);

  if (hidden.has(String(numeric))) return null;
  return all.find((p) => p.id === numeric) ?? null;
}

/** "Groom, 28, B.Com" — the one-line summary used in metadata and headings. */
function summarise(p: Profile): string {
  return [
    p.gender === 'female' ? 'Bride' : p.gender === 'male' ? 'Groom' : 'Rishta profile',
    p.age ? `${p.age} years` : null,
    p.education || null,
  ].filter(Boolean).join(' · ');
}

export async function generateStaticParams() {
  // Skipped in development so `next dev` does not pay for the whole feed.
  if (process.env.NODE_ENV === 'development') return [];

  try {
    const all = (await getProfiles()) as Profile[];
    return all.filter((p) => p.id).map((p) => ({ id: String(p.id) }));
  } catch {
    // Never fail the build over the feed; every page still renders on demand.
    return [];
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const listing = await findListing(id);

  if (!listing) {
    return { title: 'Listing not found', robots: { index: false, follow: false } };
  }

  const summary = summarise(listing);
  // The body is the family's own description and makes a far better snippet
  // than anything generated — once the contact details are out of it.
  const description = redactContacts(listing.body || '').slice(0, 200) || summary;

  return {
    title: `${summary} — Rishta ${listing.id}`,
    description,
    alternates: { canonical: `/l/${listing.id}` },
    openGraph: {
      type: 'profile',
      title: `${summary} — InstaRishta`,
      description,
      url: `${SITE}/l/${listing.id}`,
    },
  };
}

export default async function ListingPage({ params }: Params) {
  const { id } = await params;
  const listing = await findListing(id);
  if (!listing) notFound();

  const body = redactContacts(listing.body || '');
  const summary = summarise(listing);
  const urgent = isUrgent(listing.body || '');

  return (
    <main style={{ minHeight: '100vh', background: '#FAFAF9' }}>
      {/* Structured data, so an answer engine reads fields rather than prose. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'ItemPage',
            '@id': `${SITE}/l/${listing.id}`,
            url: `${SITE}/l/${listing.id}`,
            name: `${summary} — Rishta ${listing.id}`,
            description: body.slice(0, 300),
            inLanguage: rtlTextProps(listing.body || '').lang === 'ur' ? 'ur' : 'en',
            isPartOf: { '@type': 'WebSite', name: 'InstaRishta', url: SITE },
          }).replace(/</g, '\\u003c'),
        }}
      />

      <div style={{ background: '#1E3932', padding: '28px 24px 22px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <Link
            href="/profiles"
            style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, textDecoration: 'none' }}
          >
            ← All rishta profiles
          </Link>
          <h1 style={{ margin: '10px 0 0', color: '#fff', fontSize: 26, lineHeight: 1.3 }}>
            {summary}
          </h1>
          <p style={{ margin: '6px 0 0', color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>
            InstaRishta · Rishta {listing.id}
            {urgent ? ' · Urgent' : ''}
          </p>
        </div>
      </div>

      <article style={{ maxWidth: 680, margin: '0 auto', padding: '24px' }}>
        <p
          {...rtlTextProps(listing.body || '')}
          style={{
            ...rtlTextProps(listing.body || '').style,
            color: '#141413',
            fontSize: 16,
            lineHeight: 1.75,
            margin: 0,
          }}
        >
          {body}
        </p>

        <div
          style={{
            marginTop: 28,
            padding: 16,
            borderRadius: 12,
            background: '#fff',
            border: '1px solid #E8E4E0',
          }}
        >
          <p style={{ margin: 0, fontSize: 14, color: '#4B4B4B', lineHeight: 1.6 }}>
            Contact details are not published here. The family decides when its
            phone or WhatsApp number is released, and it is shared through
            InstaRishta with signed-in members.
          </p>
          <Link
            href={`/profiles?id=${listing.id}`}
            style={{
              display: 'inline-block',
              marginTop: 14,
              padding: '11px 22px',
              borderRadius: 999,
              background: '#006241',
              color: '#fff',
              fontWeight: 600,
              fontSize: 15,
              textDecoration: 'none',
            }}
          >
            Open this rishta on InstaRishta
          </Link>
        </div>
      </article>
    </main>
  );
}

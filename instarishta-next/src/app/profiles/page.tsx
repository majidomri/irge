import ProfilesClient from './ProfilesClient';
import { WebMcpTools } from '@/components/WebMcpTools';
import { getFeatured, getBiodata } from '@/lib/data';
import { searchProfileAds } from '@/lib/profile-ads';
import { parseFilterParams, parsePage } from './_shared';

export const metadata = {
  title: 'Browse Profiles – InstaRishta Muslim Matrimony',
  description:
    'Browse 500+ verified Muslim rishta profiles. Filter by gender, education, marital status. Contact via WhatsApp.',
  // Every filter combination is a distinct URL of the same page — ?id=,
  // ?gender=, ?education= and so on — so without this Google has to decide
  // for itself which of them is the real /profiles. Pointing them all at the
  // bare path says it plainly and keeps the crawl budget on one URL.
  alternates: { canonical: '/profiles' },
};

/**
 * Remix-style loader: searchParams drive the filter state and the server
 * decides everything the visitor sees.
 *
 * The filtering itself now happens in Postgres rather than here. It used to
 * pull all 500 listings across the network from a Cloudflare relay in front of
 * jsdata.json on GitHub, then run nine regex passes over the array to produce
 * 48 cards. searchProfileAds() asks an indexed query for the page, the total
 * and the counts in one round trip — see lib/profile-ads.ts and migration 032.
 *
 * Moderation moved with it: `hidden` is a column on ir_profile_ads, excluded
 * inside the query before `_num` is assigned, which is the same ordering
 * withoutHidden() enforced here — a hidden listing is not one that failed a
 * filter, it is one that was never in the set, including in the counts and in
 * what WebMcpTools can search.
 */
export default async function ProfilesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params  = await searchParams;
  const filters = parseFilterParams(params);

  const [result, featured, biodata] = await Promise.all([
    searchProfileAds(filters, parsePage(params.page)),
    getFeatured('profiles'),
    getBiodata(),
  ]);

  const { profiles: pageItems, page, pageCount } = result;

  /**
   * Stats count every match, not the page — "312 profiles found" has to stay
   * true regardless of which slice is on screen. The query computes them over
   * the same filtered set it pages, so they cannot disagree with the grid.
   */
  const stats = {
    total:  result.total,
    male:   result.male,
    female: result.female,
    urgent: result.urgent,
  };

  /**
   * Biodata for the profiles on this page, and no others.
   *
   * getBiodata() reads the whole ir_biodata table, and the entire map used to
   * be handed to ProfilesClient — which reads exactly one entry from it, for
   * the profile the visitor opened. So every /profiles response carried the
   * authored biodata of every profile that has any, to render at most one.
   *
   * That is invisible today because the table is empty, which is the only
   * reason it has cost nothing so far. It is worth bounding before it fills:
   * these sections are the detailed family write-ups, and shipping all of
   * them to every signed-out visitor is the wrong default to leave in place.
   *
   * Scoping to pageItems is safe rather than clever — the modal can only be
   * opened from a card that is on the page, so an entry outside this slice
   * was never reachable.
   */
  const pageBiodata: Record<string, unknown> = {};
  for (const p of pageItems) {
    const key = String(p.id ?? '');
    if (key && key in biodata) pageBiodata[key] = biodata[key];
  }

  return (
    <>
      {/* Exposes search over the same listings this page rendered — the page,
          now, which is what the tool descriptions already claim. */}
      <WebMcpTools profiles={pageItems} />
      <ProfilesClient
      profiles={pageItems}
      totalCount={result.total}
      page={page}
      pageCount={pageCount}
      stats={stats}
      filters={filters}
      initialFeatured={featured}
      authoredBiodata={pageBiodata}
      />
    </>
  );
}

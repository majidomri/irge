import ProfilesClient from './ProfilesClient';
import { WebMcpTools } from '@/components/WebMcpTools';
import { getProfiles, getFeatured, getBiodata } from '@/lib/data';
import { hiddenSet, withoutHidden } from '@/lib/moderation';
import { applyFilters, parseFilterParams, parsePage, isUrgent, PAGE_SIZE, type Profile } from './_shared';

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

// Remix-style loader: searchParams drive the filter state, server applies all
// filters and ships the full matched set in the SSR HTML. Mirrors the original
// vanilla-JS renderer (js/app/modules/renderer.js) — render all, no paginator.
export default async function ProfilesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, allProfiles, featured, biodata, hidden] = await Promise.all([
    searchParams,
    getProfiles() as Promise<Profile[]>,
    getFeatured('profiles'),
    getBiodata(),
    hiddenSet('profile'),
  ]);

  const filters  = parseFilterParams(params);

  // Moderation runs before the visitor's own filters: a hidden listing is not
  // a listing that failed a filter, it is one that should not be in the set at
  // all — including in the counts and in what WebMcpTools can search.
  const visible  = withoutHidden(allProfiles, hidden, p => p.id);
  const filtered = applyFilters(visible, filters);

  /**
   * Stats count every match, not the page — "312 profiles found" has to stay
   * true regardless of which slice is on screen.
   */
  const stats = {
    total:  filtered.length,
    male:   filtered.filter(p => p.gender === 'male').length,
    female: filtered.filter(p => p.gender === 'female').length,
    urgent: filtered.filter(p => isUrgent(p.body)).length,
  };

  // Paginate on the server: the document then carries one page of cards
  // instead of every match, which is where the DOM size came from.
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page      = Math.min(parsePage(params.page), pageCount);
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
      totalCount={filtered.length}
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

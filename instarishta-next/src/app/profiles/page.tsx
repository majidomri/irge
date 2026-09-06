import ProfilesClient from './ProfilesClient';
import { WebMcpTools } from '@/components/WebMcpTools';
import { getProfiles, getFeatured, getBiodata } from '@/lib/data';
import { hiddenSet, withoutHidden } from '@/lib/moderation';
import { applyFilters, parseFilterParams, parsePage, isUrgent, PAGE_SIZE, type Profile } from './_shared';

export const metadata = {
  title: 'Browse Profiles – InstaRishta Muslim Matrimony',
  description:
    'Browse 500+ verified Muslim rishta profiles. Filter by gender, education, marital status. Contact via WhatsApp.',
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
      authoredBiodata={biodata}
      />
    </>
  );
}

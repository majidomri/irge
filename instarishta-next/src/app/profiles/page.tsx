import ProfilesClient from './ProfilesClient';
import { getProfiles, getFeatured } from '@/lib/data';
import { applyFilters, parseFilterParams, isUrgent, type Profile } from './_shared';

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
  const [params, allProfiles, featured] = await Promise.all([
    searchParams,
    getProfiles() as Promise<Profile[]>,
    getFeatured('profiles'),
  ]);

  const filters  = parseFilterParams(params);
  const filtered = applyFilters(allProfiles, filters);

  const stats = {
    total:  filtered.length,
    male:   filtered.filter(p => p.gender === 'male').length,
    female: filtered.filter(p => p.gender === 'female').length,
    urgent: filtered.filter(p => isUrgent(p.body)).length,
  };

  return (
    <ProfilesClient
      profiles={filtered}
      stats={stats}
      filters={filters}
      initialFeatured={featured}
    />
  );
}

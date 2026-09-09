/**
 * Listing search, run in Postgres.
 *
 * ── What this replaces ───────────────────────────────────────────────────────
 * getProfiles() in lib/data.ts fetched all 500 listings from a Cloudflare relay
 * in front of jsdata.json on GitHub, and app/profiles/page.tsx then ran
 * applyFilters() over the whole array in JS — nine regex passes per request,
 * for a page that renders 48 cards.
 *
 * That worked, but it meant the listing page could only be as available as
 * raw.githubusercontent.com and a worker: the relay was answering 522 while
 * this was written, and /profiles was upright only because Next still held a
 * 30-minute cached copy of a file it could no longer fetch. When that expired,
 * the page had nothing.
 *
 * Now the rows live in ir_profile_ads and one RPC does the filtering, the
 * counting and the paging against indexes. See migration 032 — in particular
 * why the facets are generated columns, which is the part that makes this
 * "instant" rather than merely "elsewhere".
 *
 * ── Not cached, on purpose ───────────────────────────────────────────────────
 * The old loader had to be cached for 30 minutes because every miss cost a
 * cross-network fetch of the entire catalogue. An indexed query against the
 * project's own database is not worth a cache layer that also has to be
 * purged, and dropping it means an edit in /nizam is live on the next request
 * rather than after three separate invalidations.
 */
import { createClient } from '@supabase/supabase-js';
import type { DeckProfile } from '@/types/profile';

/**
 * Listings per page.
 *
 * Defined here rather than in app/profiles/_shared, and re-exported from there
 * — shared code must not import from app/ (see types/profile.ts), and this is
 * now the number the SQL is given, so the query and the paginator cannot
 * disagree about it.
 *
 * 48 fills three full rows on the widest grid. The grid used to render every
 * match — 500 cards, 18,175 DOM elements, which is what Lighthouse's dom-size
 * audit and most of the page's blocking time were measuring.
 */
export const PAGE_SIZE = 48;

/**
 * The filter set, as the URL expresses it. app/profiles/_shared parses
 * searchParams into this and re-exports it as FilterParams.
 */
export interface ProfileAdFilters {
  search:     string;
  idFilter:   string;
  gender:     string;        // 'all' | 'male' | 'female'
  urgentOnly: boolean;
  education:  string;
  marital:    string;
  state:      string;
  community:  string;
  ageMin:     number;
  ageMax:     number;
  sort:       string;        // 'default' | 'urgent' | 'male' | 'female'
}

export interface ProfileAdsPage {
  profiles:  DeckProfile[];
  /** Every match, not the page — the stat line has to stay true. */
  total:     number;
  male:      number;
  female:    number;
  urgent:    number;
  page:      number;
  pageCount: number;
}

const EMPTY: ProfileAdsPage = {
  profiles: [], total: 0, male: 0, female: 0, urgent: 0, page: 1, pageCount: 1,
};

/** Shape of the single row ir_search_profile_ads returns. */
interface SearchRow {
  total:        number | string;
  male_count:   number | string;
  female_count: number | string;
  urgent_count: number | string;
  rows:         DeckProfile[] | null;
}

function anonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/**
 * Postgres returns bigint as a string over PostgREST, because a bigint does not
 * fit a JS number. These counts never will either, but the string still has to
 * be coerced or `total` renders as "312" concatenated somewhere downstream.
 */
const int = (v: number | string | null | undefined): number => Number(v ?? 0);

/**
 * One page of listings for a filter set.
 *
 * `page` is clamped against the real page count, which cannot be known before
 * the query runs — so an out-of-range ?page= costs one extra round trip rather
 * than returning an empty grid. That is the same behaviour the array version
 * had (it clamped after filtering) and it is what makes a stale bookmark land
 * on the last page instead of on nothing.
 */
export async function searchProfileAds(
  filters: ProfileAdFilters,
  requestedPage: number,
): Promise<ProfileAdsPage> {
  const numeric = Number.parseInt(filters.idFilter, 10);

  const args = {
    p_search:    filters.search,
    p_num:       Number.isFinite(numeric) ? numeric : null,
    p_gender:    filters.gender,
    p_urgent:    filters.urgentOnly,
    p_education: filters.education,
    p_marital:   filters.marital,
    p_state:     filters.state,
    p_community: filters.community,
    p_age_min:   filters.ageMin,
    p_age_max:   filters.ageMax,
    p_sort:      filters.sort,
    p_limit:     PAGE_SIZE,
  };

  const run = async (page: number): Promise<{ row: SearchRow; page: number }> => {
    const { data, error } = await anonClient()
      .rpc('ir_search_profile_ads', { ...args, p_offset: (page - 1) * PAGE_SIZE })
      .single<SearchRow>();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('ir_search_profile_ads returned no row');
    return { row: data, page };
  };

  try {
    let { row, page } = await run(Math.max(1, requestedPage));

    const total     = int(row.total);
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

    // Past the end: re-run at the last real page rather than showing an empty
    // grid under a "312 profiles found" heading.
    if (page > pageCount) ({ row, page } = await run(pageCount));

    return {
      profiles:  row.rows ?? [],
      total,
      male:      int(row.male_count),
      female:    int(row.female_count),
      urgent:    int(row.urgent_count),
      page,
      pageCount,
    };
  } catch (err) {
    // Degrade to an empty page rather than a 500 — the same contract the old
    // loader had (see orEmpty in lib/data.ts), and for the same reason: a
    // listing page that renders nothing is recoverable, one that throws is a
    // crash the visitor sees.
    console.error('[profile-ads] searchProfileAds failed — rendering empty:', err);
    return EMPTY;
  }
}

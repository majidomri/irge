'use client';

import FilterDrawer from '@/app/profiles/_components/FilterDrawer';
import {
  DEFAULT_FILTERS, activeFilterCount,
  isUrgent, parseAge, matchesEdu, matchesMarital, matchesLocation,
  EDUCATION_OPTIONS, MARITAL_OPTIONS, STATE_OPTIONS, COMMUNITY_OPTIONS, SORT_OPTIONS,
  type FilterParams,
} from '@/app/profiles/_shared';
import type { IPost } from '@/lib/supabase';

/**
 * The channel feed's filters ARE the /profiles filters.
 *
 * This file used to be a hand-built port of the RishtaSwipe modal with its own
 * option lists built from whatever values the loaded posts happened to carry.
 * Two filter vocabularies for one catalogue of people: "B.com" here and
 * "Graduate (BA/BCom)" there, "USA" here and "All States / Countries" there.
 *
 * So it is not a port any more. It renders the same `FilterDrawer` component
 * /profiles renders, from the same five option lists, and matches with the
 * same exported matchers -- `matchesEdu`, `matchesMarital`, `matchesLocation`.
 * Adding an education to `EDUCATION_OPTIONS` now adds it to both surfaces.
 *
 * Three things had to be adapted, because a post is not a profile:
 *
 *   - A profile is a block of Urdu text and every matcher reads it. A post is
 *     columns -- education, community, city, country -- with the text sitting
 *     inside the picture where nothing can read it. So the matchers are run
 *     over those columns joined into one string; see `bodyOf`.
 *   - Gender is 'male'/'female' on a profile and 'groom'/'bride' on a post.
 *   - Profile ID is the profile's position in the deck. A post has no such
 *     number, so the box matches the digits against the title and caption,
 *     which is where an IR id appears when the row carries one.
 */

/** The feed's own extra: the education chips above the grid set this. */
export type FeedFilterState = FilterParams & { eduRaw?: string };

export const EMPTY_FILTERS: FeedFilterState = { ...DEFAULT_FILTERS, eduRaw: '' };

export function activeCount(f: FeedFilterState): number {
  return activeFilterCount(f) + (f.eduRaw ? 1 : 0);
}

/** Everything about a post a text matcher could want, as one string. */
function bodyOf(p: IPost): string {
  return [
    p.title, p.caption,
    p.education, p.community, p.marital,
    p.city, p.state, p.country,
  ].filter(Boolean).join(' ');
}

const GENDER_COL: Record<string, string> = { male: 'groom', female: 'bride' };

export function applyFeedFilters(posts: IPost[], f: FeedFilterState): IPost[] {
  let list = posts.filter((p) => {
    const body = bodyOf(p);

    if (f.gender !== 'all' && p.gender !== GENDER_COL[f.gender]) return false;
    if (f.urgentOnly && !(p.is_urgent || isUrgent(body))) return false;

    if (f.search) {
      const q = f.search.toLowerCase();
      if (!body.toLowerCase().includes(q)) return false;
    }

    // Not a deck position -- the digits of an IR id, wherever the row shows it.
    if (f.idFilter && !`${p.title ?? ''} ${p.caption ?? ''}`.includes(f.idFilter)) return false;

    if (f.education && !matchesEdu(body, f.education)) return false;
    if (f.marital   && !matchesMarital(body, f.marital)) return false;
    if (f.state     && !matchesLocation(body, f.state)) return false;
    if (f.community && !body.toLowerCase().includes(f.community.toLowerCase())) return false;

    // The chips above the grid pick a qualification exactly as the data spells
    // it, which the option list deliberately does not do.
    if (f.eduRaw && p.education !== f.eduRaw) return false;

    // An unanswered age never excludes a post -- filtering on a blank is the
    // same mistake as rendering one. /profiles keeps this rule too.
    if (f.ageMin > 18 || f.ageMax < 60) {
      const age = typeof p.age === 'number' && p.age > 0 ? p.age : parseAge(body);
      if (age && (age < f.ageMin || age > f.ageMax)) return false;
    }

    return true;
  });

  if (f.sort === 'urgent') list = [...list].sort((a, b) => +!!b.is_urgent - +!!a.is_urgent);
  if (f.sort === 'male')   list = [...list].sort((a, b) => +(a.gender !== 'groom') - +(b.gender !== 'groom'));
  if (f.sort === 'female') list = [...list].sort((a, b) => +(a.gender !== 'bride') - +(b.gender !== 'bride'));

  return list;
}

/** The label an option value carries, for the active-filter chips. */
function labelOf(options: { label: string; value: string }[], value: string) {
  return options.find((o) => o.value === value)?.label ?? value;
}

const LINE = 'rgba(255,255,255,0.12)';
const GREEN = '#00A86B';

export default function FeedFilters({
  value,
  onChange,
  matched,
  open,
  onOpenChange,
}: {
  posts: IPost[];
  value: FeedFilterState;
  onChange: (next: FeedFilterState) => void;
  /** What the current filters left, for the stats row. */
  matched: IPost[];
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const set = <K extends keyof FeedFilterState>(k: K, v: FeedFilterState[K]) =>
    onChange({ ...value, [k]: v });

  const stats = {
    total:  matched.length,
    male:   matched.filter((p) => p.gender === 'groom').length,
    female: matched.filter((p) => p.gender === 'bride').length,
    urgent: matched.filter((p) => p.is_urgent).length,
  };

  /** What is switched on right now, as removable chips. */
  const active: { label: string; clear: () => void }[] = [];
  if (value.gender !== 'all') {
    active.push({ label: value.gender === 'male' ? 'Groom' : 'Bride', clear: () => set('gender', 'all') });
  }
  if (value.education) active.push({ label: labelOf(EDUCATION_OPTIONS, value.education), clear: () => set('education', '') });
  if (value.eduRaw)    active.push({ label: value.eduRaw, clear: () => set('eduRaw', '') });
  if (value.marital)   active.push({ label: labelOf(MARITAL_OPTIONS, value.marital), clear: () => set('marital', '') });
  if (value.state)     active.push({ label: labelOf(STATE_OPTIONS, value.state), clear: () => set('state', '') });
  if (value.community) active.push({ label: labelOf(COMMUNITY_OPTIONS, value.community), clear: () => set('community', '') });
  if (value.sort !== 'default') active.push({ label: labelOf(SORT_OPTIONS, value.sort), clear: () => set('sort', 'default') });
  if (value.idFilter)  active.push({ label: `ID ${value.idFilter}`, clear: () => set('idFilter', '') });
  if (value.urgentOnly) active.push({ label: 'Urgent', clear: () => set('urgentOnly', false) });
  if (value.search)    active.push({ label: `"${value.search}"`, clear: () => set('search', '') });
  if (value.ageMin > 18 || value.ageMax < 60) {
    active.push({
      label: `${value.ageMin}–${value.ageMax} yrs`,
      clear: () => onChange({ ...value, ageMin: 18, ageMax: 60 }),
    });
  }

  return (
    <>
      {/* What is on, in the flow — the badge on the trigger says how many,
          this says which, and each one comes off on its own. */}
      {active.length > 0 && (
        <div style={{ background: '#0B0B0A' }} className="px-4 pb-3 flex gap-2 overflow-x-auto items-center">
          {active.map((a) => (
            <button
              key={a.label}
              onClick={a.clear}
              className="shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border"
              style={{ background: 'rgba(0,168,107,0.16)', color: GREEN, borderColor: 'rgba(0,168,107,0.45)' }}
            >
              {a.label}
              <span aria-hidden style={{ opacity: 0.7 }}>×</span>
            </button>
          ))}
          <button
            onClick={() => onChange({ ...EMPTY_FILTERS })}
            className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold border"
            style={{ background: 'transparent', color: 'rgba(255,255,255,0.7)', borderColor: LINE }}
          >
            Clear all
          </button>
        </div>
      )}

      <FilterDrawer
        open={open}
        onClose={() => onOpenChange(false)}
        onClear={() => onChange({ ...EMPTY_FILTERS })}
        stats={stats}
        side="right-on-desktop"
        idFilter={value.idFilter}   setIdFilter={(v) => set('idFilter', v)}
        gender={value.gender}       setGender={(v) => set('gender', v)}
        ageMin={value.ageMin}       setAgeMin={(v) => set('ageMin', v)}
        ageMax={value.ageMax}       setAgeMax={(v) => set('ageMax', v)}
        state={value.state}         setState={(v) => set('state', v)}
        community={value.community} setCommunity={(v) => set('community', v)}
        education={value.education} setEducation={(v) => set('education', v)}
        marital={value.marital}     setMarital={(v) => set('marital', v)}
        sort={value.sort}           setSort={(v) => set('sort', v)}
      />
    </>
  );
}

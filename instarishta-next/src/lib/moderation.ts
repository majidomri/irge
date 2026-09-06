/**
 * The read side of moderation: what is currently hidden.
 *
 * Hiding has to work across two unrelated data sources. Feed listings on
 * /profiles come from the Cloudflare profile worker and are keyed by an
 * integer id; posts and stories live in Supabase under uuids. Neither source
 * knows about the other, so the hidden set is held here and applied as a
 * filter over whichever list is being rendered.
 *
 * Cached with the same 30-minute window and tag as the other loaders, so
 * POST /api/revalidate purges it — which is what makes a hide take effect
 * immediately rather than whenever the window happens to lapse.
 */
import { unstable_cache } from 'next/cache';
import { serverDb } from '@/lib/slug-resolve';

export type HiddenEntityType = 'profile' | 'member' | 'post' | 'story';

/**
 * Ids hidden right now, grouped by type.
 *
 * Returns empty sets on failure rather than throwing. Failing closed here
 * would blank the listing page for everyone because one table was briefly
 * unreachable; failing open shows content that should be hidden until the
 * next attempt. Neither is good, but only one of them is an outage — and a
 * hide is a moderation decision measured in minutes, not milliseconds.
 */
export const getHiddenIds = unstable_cache(
  async (): Promise<Record<HiddenEntityType, string[]>> => {
    const empty: Record<HiddenEntityType, string[]> = {
      profile: [], member: [], post: [], story: [],
    };

    try {
      const { data, error } = await serverDb()
        .from('ir_hidden_listings')
        .select('entity_type, entity_id')
        .is('unhidden_at', null)
        .limit(10_000);

      if (error || !data) {
        if (error) console.error('[moderation] hidden list failed:', error.message);
        return empty;
      }

      for (const row of data) {
        const type = row.entity_type as HiddenEntityType;
        if (type in empty) empty[type].push(String(row.entity_id));
      }
      return empty;
    } catch (err) {
      console.error('[moderation] hidden list threw:', err);
      return empty;
    }
  },
  ['ir-hidden-listings'],
  { revalidate: 1800, tags: ['moderation'] },
);

/** A Set of the hidden ids for one entity type, ready for a filter. */
export async function hiddenSet(type: HiddenEntityType): Promise<Set<string>> {
  const all = await getHiddenIds();
  return new Set(all[type]);
}

/**
 * Drop hidden entries from a list.
 *
 * `idOf` exists because the two sources disagree about what an id is: the feed
 * calls it `id` and stores a number, Supabase calls it `id` and stores a uuid.
 * Both are compared as strings.
 */
export function withoutHidden<T>(
  items: readonly T[],
  hidden: Set<string>,
  idOf: (item: T) => string | number | null | undefined,
): T[] {
  if (hidden.size === 0) return items as T[];

  return items.filter((item) => {
    const id = idOf(item);
    return id === null || id === undefined || !hidden.has(String(id));
  });
}

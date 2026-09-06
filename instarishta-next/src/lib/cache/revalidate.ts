/**
 * Cache invalidation, in one place.
 *
 * The skill's second rule — mutations import from here rather than calling
 * the cache API directly — with one deliberate change. The skill writes this
 * file as `'use server'`, because its callers are Server Actions. Every caller
 * here is a route handler, so these stay plain functions; marking them
 * `'use server'` would make them async server actions for no benefit.
 *
 * The important part is what each helper does. Purging a tag clears the cached
 * *data*, but a prerendered page is a static file and keeps serving until its
 * own `revalidate` window expires — /api/revalidate's own docstring says so.
 * Every helper below therefore purges the tag and the pages built from it
 * together, so the two cannot be remembered separately.
 */
import { revalidatePath, revalidateTag } from 'next/cache';

import { CACHE_TAGS, LISTING_DATA_TAGS, type CacheTag } from './tags';

/** Next 16 requires the second argument; missing it is a type error, not a no-op. */
function purgeTags(tags: CacheTag[]) {
  for (const tag of tags) revalidateTag(tag, {});
}

/** One tag, for callers that genuinely only invalidate data. */
export function purgeTag(tag: CacheTag) {
  purgeTags([tag]);
}

/** Pages rendered from the listing data. */
const LISTING_PATHS = ['/', '/profiles', '/channels'];

/** New or edited feed data: purge what produced it and what renders it. */
export function purgeListingData(extraPaths: string[] = []) {
  purgeTags(LISTING_DATA_TAGS);
  for (const path of [...LISTING_PATHS, ...extraPaths]) revalidatePath(path);
}

/**
 * A listing was hidden or unhidden.
 *
 * The tag purge alone was not enough, and this is the bug this helper exists
 * for. /profiles is dynamic, so it picked up a hidden id on the next request
 * — but /l/[id] is one of 500 prerendered pages with `revalidate = 3600`, so
 * a listing an admin had just hidden stayed readable at its own permalink for
 * up to an hour. That permalink is in the sitemap and is the URL this project
 * asks answer engines to cite, which makes it the worst place to keep serving
 * something that was pulled.
 *
 * @param profileIds ids whose /l/[id] permalink must come down too.
 */
export function purgeModeration(profileIds: Array<string | number> = []) {
  purgeTags([CACHE_TAGS.moderation]);

  revalidatePath('/profiles');
  for (const id of profileIds) revalidatePath(`/l/${id}`);
}

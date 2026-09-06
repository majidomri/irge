/**
 * Every cache tag in the app, in one place.
 *
 * From the nextjs-cache-architecture skill's first rule: no raw tag strings
 * outside this file. The rest of that skill is built on `cacheComponents`,
 * which this app does not enable, but the registry is worth having on its own
 * — and the codebase already has the scar to prove it.
 *
 * /api/revalidate carries this comment:
 *
 *   'biodata' was missing: lib/data tags all three loaders, but this route
 *   only ever purged two, so hand-authored biodata stayed cached for the
 *   full 30 minutes after an edit however many times the hook was called.
 *
 * That is exactly what a producer/consumer pair of hand-typed strings does
 * when they drift. `moderation` had drifted the same way. A literal-typed
 * registry makes the pair impossible to mistype and easy to enumerate.
 */
export const CACHE_TAGS = {
  /** The rishta feed — lib/data.getProfiles. */
  profiles: 'profiles',
  /** Spotlight entries — lib/data.getFeatured. */
  featured: 'featured',
  /** Hand-authored biodata — lib/data.getBiodata. */
  biodata: 'biodata',
  /** Hidden-listing ids — lib/moderation.getHiddenIds. */
  moderation: 'moderation',
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];

/** Everything the listing surfaces are built from. */
export const LISTING_DATA_TAGS: CacheTag[] = [
  CACHE_TAGS.profiles,
  CACHE_TAGS.featured,
  CACHE_TAGS.biodata,
];

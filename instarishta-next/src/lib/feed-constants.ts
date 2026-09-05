/**
 * Constants shared by the feed's browser and server data paths.
 *
 * They live apart from lib/supabase.ts because that module builds a browser
 * Supabase client at import time, which a server component must not pull in.
 */

/**
 * 24, not 9. Nine filled barely two rows of a five-column desktop grid, so the
 * first screen looked like the whole channel -- and the post viewer, which can
 * only page through what is loaded, capped at "1 / 9" on a channel holding
 * eighty-seven.
 */
export const POST_PAGE_SIZE = 24;

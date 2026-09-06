/**
 * The listing shape, as the profile worker returns it.
 *
 * Lifted out of app/profiles/_shared so shared code can use it. lib/ and
 * components/ were importing this type from a route folder, which inverts the
 * dependency the rest of the tree follows: shared code must not reach into
 * app/.
 */
// Shared types, constants, and pure helpers used by the profiles route.
// Extracted from ProfilesClient.tsx so that lazy-loaded modal/drawer chunks
// can reuse the same logic without re-bundling it.

export interface Profile {
  /**
   * Upstream feed id — stable and unique (verified 500/500, none null).
   * This, NOT `_num`, is the identity to persist against. `_num` is only the
   * position in the filtered array and shifts whenever the feed changes.
   */
  id?: number;
  title: string;
  body: string;
  gender: 'male' | 'female' | string;
  /** Advertiser contact. Currently the business relay number on every profile. */
  phone?: string;
  whatsapp?: string;
  age?: number;
  education?: string;
  priority?: string;
  audio_url?: string;
  instagram_post_id?: string;
}

export type DeckProfile = Profile & { _num: number };

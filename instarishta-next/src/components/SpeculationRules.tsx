/**
 * Speculation Rules — start the next navigation before it is asked for.
 *
 * A server component: this is a static <script> tag, so it belongs in the
 * HTML rather than being written by JavaScript after hydration.
 *
 * Two rulesets, because the two speculations are not interchangeable.
 *
 * `prerender` runs the target page for real -- its effects, its data fetches,
 * its WebSocket -- and pays off accordingly: prerendered navigations land
 * around a 320ms p75 LCP against roughly 1,800ms for a normal one. It is
 * limited here to profile and post detail pages, which are read-only on
 * mount. The channel feed opens a Supabase realtime subscription when it
 * mounts, so prerendering three channels from the strip would open three live
 * connections for pages nobody has opened; those stay on prefetch.
 *
 * `prefetch` fetches the document and leaves it cold. That is where nearly
 * all of the latency is anyway -- the response, not the parse -- and it is
 * safe for pages whose mount does something.
 *
 * `eagerness: moderate` is the browser's own heuristic (roughly 200ms of
 * hover, or pointerdown if that comes first), so nothing speculates on a link
 * merely because it exists. On a channel feed, eager would mean speculating
 * every sibling channel and every post on the page at once.
 *
 * The exclusions are the point of the `where` clause:
 *
 *   - `/api/` is not a page;
 *   - `/nizam` is the admin panel, and prefetching admin routes for a visitor
 *     who cannot open them is wasted bandwidth at best;
 *   - `/pay` and `/account` are per-user, and a speculative GET of a payment
 *     route is exactly the kind of request that should only ever happen
 *     because someone asked for it;
 *   - `/auth` carries one-time tokens in its URLs, which must be spent by a
 *     real navigation, not by a speculative fetch that discards the result.
 */

/** Read-only on mount, so safe to actually run ahead of time. */
const PRERENDERABLE = ['/p/*', '/post/*'];

/** Never speculate these, by either mechanism. */
const EXCLUDED = [
  { not: { href_matches: '/api/*' } },
  { not: { href_matches: '/nizam*' } },
  { not: { href_matches: '/pay/*' } },
  { not: { href_matches: '/account*' } },
  { not: { href_matches: '/auth/*' } },
  // Anything a browser would download rather than render.
  { not: { selector_matches: '[download]' } },
  // Rel=nofollow tends to mark links we do not vouch for.
  { not: { selector_matches: '[rel~="nofollow"]' } },
];

/**
 * Shared links arrive carrying campaign parameters that change nothing about
 * the response. Without this the browser treats `/p/abc?utm_source=whatsapp`
 * as a different URL from the `/p/abc` it already has in hand and speculates
 * again; with it, the in-flight speculation is reused.
 */
const NO_VARY_SEARCH =
  'params=("utm_source" "utm_medium" "utm_campaign" "utm_term" "utm_content" "fbclid" "gclid" "ref")';

export function SpeculationRules() {
  const rules = {
    prerender: [
      {
        source: 'document',
        where: {
          and: [
            { or: PRERENDERABLE.map((href_matches) => ({ href_matches })) },
            ...EXCLUDED,
          ],
        },
        eagerness: 'moderate',
        expects_no_vary_search: NO_VARY_SEARCH,
      },
    ],
    prefetch: [
      {
        source: 'document',
        where: {
          and: [
            { href_matches: '/*' },
            // Already covered, more thoroughly, by the prerender rule above.
            ...PRERENDERABLE.map((href_matches) => ({ not: { href_matches } })),
            ...EXCLUDED,
          ],
        },
        eagerness: 'moderate',
        expects_no_vary_search: NO_VARY_SEARCH,
      },
    ],
  };

  return (
    <script
      type="speculationrules"
      // The content is a constant defined immediately above, not anything
      // derived from user input or the database.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(rules) }}
    />
  );
}

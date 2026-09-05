/**
 * Speculation Rules — start the next navigation before it is asked for.
 *
 * A server component: this is a static <script> tag, so it belongs in the
 * HTML rather than being written by JavaScript after hydration.
 *
 * `prefetch`, not `prerender`, and the distinction matters here. Prerender
 * runs the target page for real -- its effects, its data fetches, its
 * WebSocket. The channel feed opens a Supabase realtime subscription on
 * mount, so prerendering three channels from the strip would open three live
 * connections for pages nobody has opened yet. Prefetch fetches the document
 * and leaves it cold, which is where nearly all the latency is anyway: the
 * response, not the parse.
 *
 * `eagerness: moderate` is the browser's own heuristic -- roughly, hover or
 * pointerdown -- so nothing speculates on a link merely because it exists.
 * On a channel feed that would mean prefetching every sibling channel and
 * every post on the page at once.
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
export function SpeculationRules() {
  const rules = {
    prefetch: [
      {
        source: 'document',
        where: {
          and: [
            { href_matches: '/*' },
            { not: { href_matches: '/api/*' } },
            { not: { href_matches: '/nizam*' } },
            { not: { href_matches: '/pay/*' } },
            { not: { href_matches: '/account*' } },
            { not: { href_matches: '/auth/*' } },
            // Anything a browser would download rather than render.
            { not: { selector_matches: '[download]' } },
            // Rel=nofollow tends to mark links we do not vouch for.
            { not: { selector_matches: '[rel~="nofollow"]' } },
          ],
        },
        eagerness: 'moderate',
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

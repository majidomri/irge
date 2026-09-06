/**
 * GET /md/<any public path>  → that page as markdown
 *
 * Never linked and never navigated to directly. Middleware rewrites here when a
 * request carries `Accept: text/markdown`, so the agent's URL stays the real one
 * and the markdown is a representation of it rather than a separate page.
 *
 * A path with no markdown view 404s rather than inventing one. Middleware only
 * rewrites paths this route knows about, so a 404 here means the two lists have
 * drifted apart.
 */
import { markdownForPath, approximateTokens } from '@/lib/markdown-view';

export const runtime = 'nodejs';

/**
 * These markdown views exist so an agent can read a page without parsing the
 * HTML, and the .well-known documents that advertise them already send this
 * header. This route did not, so a browser-based agent could discover the
 * endpoint and then be blocked from reading it.
 *
 * `*` is safe here specifically: the response is a public page's own text,
 * there is no session, no cookie is read, and nothing varies per caller.
 */
const CORS = { 'Access-Control-Allow-Origin': '*' } as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug?: string[] }> },
) {
  const { slug } = await params;
  const pathname = '/' + (slug ?? []).join('/');

  const markdown = await markdownForPath(pathname);

  if (markdown === null) {
    return new Response('Not found\n', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS },
    });
  }

  return new Response(markdown, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'x-markdown-tokens': String(approximateTokens(markdown)),
      // The same URL answers with HTML or markdown depending on Accept, so any
      // shared cache has to key on it. Without this a CDN could hand markdown
      // to a browser, or an HTML page to an agent.
      Vary: 'Accept',
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      ...CORS,
    },
  });
}

/**
 * Preflight. A plain GET carrying only an Accept header is CORS-safelisted and
 * never preflights, so this is reached only by a client that sends something
 * extra. It costs nothing and it keeps that client from failing silently.
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      ...CORS,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Accept, Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

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
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
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
    },
  });
}

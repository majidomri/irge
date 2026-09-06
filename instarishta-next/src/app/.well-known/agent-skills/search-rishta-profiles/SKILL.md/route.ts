/**
 * GET /.well-known/agent-skills/search-rishta-profiles/SKILL.md
 *
 * The skill document itself. Its bytes are the ones hashed into the index's
 * sha256, so the two can never disagree.
 */
import { SKILL_MARKDOWN } from '@/lib/agent-skills';

export const dynamic = 'force-static';

export function GET() {
  return new Response(SKILL_MARKDOWN, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}

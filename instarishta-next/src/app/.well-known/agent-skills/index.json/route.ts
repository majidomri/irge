/**
 * GET /.well-known/agent-skills/index.json
 *
 * Agent Skills Discovery RFC v0.2.0.
 *
 * One skill, because there is one thing an agent can usefully be taught about
 * this site: how to read the listings and how to handle the contact details it
 * will not find in them. The digest is computed from the served document.
 */
import { SKILL_NAME, skillDigest } from '@/lib/agent-skills';

export const dynamic = 'force-static';

const SITE = 'https://www.instarishta.me';

export function GET() {
  const index = {
    $schema: 'https://agentskills.io/schemas/v0.2.0/index.json',
    version: '0.2.0',
    skills: [
      {
        name: SKILL_NAME,
        type: 'skill',
        description:
          'Find Muslim marriage listings on InstaRishta, filter them, and cite ' +
          'them correctly — including why contact details are absent.',
        url: `${SITE}/.well-known/agent-skills/${SKILL_NAME}/SKILL.md`,
        sha256: skillDigest(),
      },
    ],
  };

  return new Response(JSON.stringify(index, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}

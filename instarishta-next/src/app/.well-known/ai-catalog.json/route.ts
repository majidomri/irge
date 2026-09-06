/**
 * GET /.well-known/ai-catalog.json  → ARD capability manifest
 *
 * https://agenticresourcediscovery.org/
 *
 * Lists what an agent can actually use here. That is a short list on purpose:
 * this site has no MCP server, no A2A agent and no public write API, so none
 * are claimed. Every entry below resolves to something that exists today.
 *
 * representativeQueries exist so registries can build embeddings and route a
 * question here without fetching first; they are phrased as the errands people
 * actually arrive with.
 */

export const dynamic = 'force-static';

const SITE = 'https://www.instarishta.me';
const NS = 'urn:air:instarishta.me';

const catalog = {
  specVersion: '0.2',
  host: {
    name: 'InstaRishta',
    description:
      'Muslim matrimony and nikah matchmaking. Families browse verified bride ' +
      'and groom listings; contact details stay under the listing family’s control.',
    url: SITE,
  },
  entries: [
    {
      id: `${NS}:content:site-index`,
      displayName: 'Site index for assistants',
      description:
        'Plain-text summary of the site: what it is, which pages exist, and how ' +
        'assistants should treat listing data.',
      type: 'text/plain',
      url: `${SITE}/llms.txt`,
      representativeQueries: [
        'what is InstaRishta',
        'is InstaRishta a real matrimony site',
        'how does InstaRishta work',
      ],
    },
    {
      id: `${NS}:content:profiles-markdown`,
      displayName: 'Verified rishta listings (markdown)',
      description:
        'The public listing as markdown: title, age, gender and education per ' +
        'entry. Contact details are deliberately excluded. The same content is ' +
        'served at /profiles to any request sending Accept: text/markdown.',
      type: 'text/markdown',
      url: `${SITE}/md/profiles`,
      representativeQueries: [
        'find Muslim rishta profiles in Hyderabad',
        'verified nikah proposals for a 25 year old',
        'browse bride and groom listings',
      ],
    },
    {
      id: `${NS}:content:home-markdown`,
      displayName: 'Homepage (markdown)',
      description: 'The homepage as markdown, including the policy page index.',
      type: 'text/markdown',
      url: `${SITE}/md`,
      representativeQueries: [
        'InstaRishta pricing and policies',
        'what does InstaRishta cost',
      ],
    },
    {
      id: `${NS}:index:sitemap`,
      displayName: 'Sitemap',
      description: 'Every indexable URL, including individual profile pages.',
      type: 'application/xml',
      url: `${SITE}/sitemap.xml`,
      representativeQueries: [
        'list all InstaRishta pages',
        'InstaRishta profile URLs',
      ],
    },
  ],
};

export function GET() {
  return new Response(JSON.stringify(catalog, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      // The spec asks for this so a registry can read the manifest from a
      // browser context on another origin.
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}

/**
 * GET /.well-known/api-catalog  → RFC 9727 linkset
 *
 * A catalog of what a third party can actually call. That is the read-only
 * content surface and nothing else.
 *
 * There is deliberately no entry for the routes under /api/. All 46 of them
 * serve this site's own frontend and are admin-gated, cron-triggered or
 * session-authenticated; cataloguing them would advertise an API that does not
 * exist for third parties and send agents into rate limiters and 401s.
 *
 * No `service-desc` either: that relation points at a machine-readable API
 * description (OpenAPI), and writing one for endpoints nobody may call would
 * be describing a contract this site does not offer.
 */

export const dynamic = 'force-static';

const SITE = 'https://www.instarishta.me';

const linkset = {
  linkset: [
    {
      anchor: `${SITE}/profiles`,
      'service-doc': [
        {
          href: `${SITE}/llms.txt`,
          type: 'text/plain',
          title: 'How to read this site, and what not to do with it',
        },
      ],
      describedby: [
        {
          href: `${SITE}/md/profiles`,
          type: 'text/markdown',
          title: 'Verified rishta listings as markdown, without contact details',
        },
      ],
      alternate: [
        {
          href: `${SITE}/profiles`,
          type: 'text/markdown',
          title: 'Same URL with Accept: text/markdown',
        },
      ],
    },
    {
      anchor: `${SITE}/`,
      describedby: [
        { href: `${SITE}/llms.txt`, type: 'text/plain' },
        { href: `${SITE}/sitemap.xml`, type: 'application/xml' },
        { href: `${SITE}/.well-known/ai-catalog.json`, type: 'application/json' },
      ],
      'terms-of-service': [{ href: `${SITE}/toc`, type: 'text/html' }],
      'privacy-policy': [{ href: `${SITE}/privacy`, type: 'text/html' }],
    },
  ],
};

export function GET() {
  return new Response(JSON.stringify(linkset, null, 2), {
    headers: {
      'Content-Type': 'application/linkset+json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}

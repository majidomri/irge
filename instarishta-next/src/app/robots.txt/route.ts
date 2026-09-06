/**
 * robots.txt
 *
 * Replaces the metadata `robots.ts` convention, which can only emit the fields
 * Next models — and Content-Signal is not one of them. Same rules as before,
 * plus the signal line.
 *
 * Google indexing is allowed; every other automated crawler is not, including
 * the AI training crawlers.
 */

export const dynamic = 'force-static';

/** Google's indexing crawlers — the only agents allowed to fetch the site. */
const ALLOWED = [
  'Googlebot',
  'Googlebot-Image',
  'Googlebot-Video',
  'Googlebot-News',
  'AdsBot-Google',
  'APIs-Google',
  'Mediapartners-Google',
  'Google-InspectionTool',
];

/**
 * Everything else. Google-Extended leads the list because it is Google's AI
 * training crawler and is a different agent from Googlebot — allowing search
 * does not imply allowing training.
 */
const DISALLOWED = [
  'Google-Extended',
  'GPTBot', 'ChatGPT-User', 'OAI-SearchBot',
  'ClaudeBot', 'anthropic-ai', 'Claude-Web',
  'PerplexityBot', 'Perplexity-User',
  'CCBot',
  'Bytespider',
  'FacebookBot', 'meta-externalagent', 'meta-externalfetcher',
  'Applebot', 'Applebot-Extended',
  'Amazonbot',
  'cohere-ai', 'AI2Bot', 'Diffbot', 'ImagesiftBot', 'YouBot', 'PetalBot',
  'Omgili', 'Omgilibot', 'magpie-crawler', 'Timpibot',
  'VelenPublicWebCrawler', 'TurnitinBot',
  'SemrushBot', 'DotBot', 'MJ12bot', 'AhrefsBot', 'BLEXBot',
  'DataForSeoBot', 'SeekportBot', 'FriendlyCrawler', 'Scrapy',
  'TavilyBot', 'img2dataset',
];

/**
 * Content-Signal (contentsignals.org) states what may be done with content
 * that was fetched legitimately — a separate question from who may fetch it,
 * which the rules below answer.
 *
 *   search=yes     appearing in a search index is the point of the site
 *   ai-train=no    listings are families' personal details, not training data
 *   ai-input=yes   an assistant answering "find me a rishta site" and citing
 *                  a page is the same errand a search result serves; this is
 *                  also why llms.txt and the markdown views exist
 *
 * These are declarations, not access control. A crawler that ignores the
 * Disallow lines below will ignore this line too.
 */
const CONTENT_SIGNAL = 'ai-train=no, search=yes, ai-input=yes';

function body(): string {
  const lines: string[] = [
    '# Content usage preferences — https://contentsignals.org/',
    `Content-Signal: ${CONTENT_SIGNAL}`,
    '',
    '# Google (indexing allowed)',
  ];

  for (const agent of ALLOWED) {
    lines.push(`User-agent: ${agent}`, 'Allow: /', '');
  }

  lines.push('# Everything else, including AI training crawlers');
  for (const agent of DISALLOWED) {
    lines.push(`User-agent: ${agent}`, `Content-Signal: ${CONTENT_SIGNAL}`, 'Disallow: /', '');
  }

  lines.push(
    '# Catch-all',
    'User-agent: *',
    `Content-Signal: ${CONTENT_SIGNAL}`,
    'Disallow: /',
    '',
    'Sitemap: https://www.instarishta.me/sitemap.xml',
    '',
  );

  return lines.join('\n');
}

export function GET() {
  return new Response(body(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}

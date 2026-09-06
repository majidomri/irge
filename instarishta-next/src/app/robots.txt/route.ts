/**
 * robots.txt
 *
 * Replaces the metadata `robots.ts` convention, which can only emit the fields
 * Next models — and Content-Signal is not one of them. Same rules as before,
 * plus the signal line.
 *
 * Search crawlers and answer engines are allowed, as are the link-preview
 * fetchers that render a shared URL in a chat. AI training crawlers are not,
 * which is the other half of the Content-Signal at the top of the file.
 */

import { SITE_URL } from '@/config/site';

export const dynamic = 'force-static';

/** Search crawlers allowed to index the site. */
const ALLOWED = [
  'Googlebot',
  'Googlebot-Image',
  'Googlebot-Video',
  'Googlebot-News',
  'AdsBot-Google',
  'APIs-Google',
  'Mediapartners-Google',
  'Google-InspectionTool',
  // Bing indexes for Bing, DuckDuckGo and Microsoft Copilot, so leaving it to
  // the catch-all cost all three at once — including one of the answer engines
  // this file is otherwise trying to invite.
  'Bingbot',
  'DuckDuckBot',
];

/**
 * Link-preview fetchers.
 *
 * These are not crawlers. They fetch exactly one URL that a person has just
 * pasted into a chat, to render its title and image, and they index nothing.
 *
 * They were falling through to `User-agent: * / Disallow: /`, and all of them
 * honour that. Rishtas here spread by WhatsApp forward — that is the premise
 * of /api/share-card, which exists to render a card for precisely this moment
 * — so the site was blocking the one fetch its own distribution depends on.
 *
 * Applebot is deliberately absent: it is in DISALLOWED by an earlier decision
 * about Apple's crawlers, and this is not the place to reverse that.
 */
const LINK_PREVIEW = [
  'WhatsApp',
  'facebookexternalhit',
  'Twitterbot',
  'LinkedInBot',
  'Slackbot',
  'Slackbot-LinkExpanding',
  'TelegramBot',
  'Discordbot',
  'SkypeUriPreview',
];

/**
 * Everything else. Google-Extended leads the list because it is Google's AI
 * training crawler and is a different agent from Googlebot — allowing search
 * does not imply allowing training.
 */
/**
 * Answer engines: the crawlers that fetch a page in order to answer somebody's
 * question and cite the source, as opposed to the ones that harvest it into a
 * training set.
 *
 * These are allowed because the Content-Signal at the top of this file already
 * says so — `ai-train=no, ai-input=yes`. Until now that was a contradiction:
 * the signal invited grounding while every group below refused the crawlers
 * that do it, so a question like "where can I find Muslim rishta listings in
 * Hyderabad" could never surface this site.
 *
 * The training crawlers stay in DISALLOWED, which keeps the other half of the
 * signal honest. GPTBot and OAI-SearchBot are different agents and are treated
 * differently on purpose; so are ClaudeBot and Claude-User, and Googlebot and
 * Google-Extended.
 */
const ANSWER_ENGINES = [
  'OAI-SearchBot',
  'ChatGPT-User',
  'PerplexityBot',
  'Perplexity-User',
  'Claude-User',
  'Claude-SearchBot',
];

const DISALLOWED = [
  // Training crawlers. Listings are families' personal details.
  'Google-Extended',
  'GPTBot',
  'ClaudeBot', 'anthropic-ai', 'Claude-Web',
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
 *
 * Emitted once, at the top, rather than inside every group. The spec treats it
 * as origin-wide, and repeating it made Lighthouse report 42 "Unknown
 * directive" errors instead of one — robots.txt validators do not know this
 * directive yet (google/robotstxt#80 tracks it upstream). Real crawlers ignore
 * lines they do not recognise, so nothing about indexing changes either way.
 */
const CONTENT_SIGNAL = 'ai-train=no, search=yes, ai-input=yes';

function body(): string {
  const lines: string[] = [
    '# Content usage preferences — https://contentsignals.org/',
    `Content-Signal: ${CONTENT_SIGNAL}`,
    '',
    '# Search engines (indexing allowed)',
  ];

  for (const agent of ALLOWED) {
    lines.push(`User-agent: ${agent}`, 'Allow: /', '');
  }

  lines.push('# Link previews — one URL a person shared, not a crawl');
  for (const agent of LINK_PREVIEW) {
    lines.push(`User-agent: ${agent}`, 'Allow: /', '');
  }

  lines.push('# Answer engines — may fetch to answer a question and cite us');
  for (const agent of ANSWER_ENGINES) {
    lines.push(`User-agent: ${agent}`, 'Allow: /', '');
  }

  lines.push('# Everything else, including AI training crawlers');
  for (const agent of DISALLOWED) {
    lines.push(`User-agent: ${agent}`, 'Disallow: /', '');
  }

  lines.push(
    '# Catch-all',
    'User-agent: *',
    'Disallow: /',
    '',
    `Sitemap: ${SITE_URL}/sitemap.xml`,
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

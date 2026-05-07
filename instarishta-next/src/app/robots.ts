import type { MetadataRoute } from 'next';

/**
 * robots.txt — Google indexing only.
 * All AI training bots, scrapers, and crawlers are disallowed.
 * Googlebot and its sub-crawlers are the only permitted agents.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // ── Google (indexing allowed) ──────────────────────────────────────────
      { userAgent: 'Googlebot',              allow: '/' },
      { userAgent: 'Googlebot-Image',        allow: '/' },
      { userAgent: 'Googlebot-Video',        allow: '/' },
      { userAgent: 'Googlebot-News',         allow: '/' },
      { userAgent: 'AdsBot-Google',          allow: '/' },
      { userAgent: 'APIs-Google',            allow: '/' },
      { userAgent: 'Mediapartners-Google',   allow: '/' },
      { userAgent: 'Google-InspectionTool',  allow: '/' },

      // ── Google AI training bot (block — different from Googlebot) ──────────
      { userAgent: 'Google-Extended', disallow: '/' },

      // ── OpenAI ────────────────────────────────────────────────────────────
      { userAgent: 'GPTBot',          disallow: '/' },
      { userAgent: 'ChatGPT-User',    disallow: '/' },
      { userAgent: 'OAI-SearchBot',   disallow: '/' },

      // ── Anthropic ─────────────────────────────────────────────────────────
      { userAgent: 'ClaudeBot',       disallow: '/' },
      { userAgent: 'anthropic-ai',    disallow: '/' },
      { userAgent: 'Claude-Web',      disallow: '/' },

      // ── Perplexity ────────────────────────────────────────────────────────
      { userAgent: 'PerplexityBot',   disallow: '/' },
      { userAgent: 'Perplexity-User', disallow: '/' },

      // ── Common Crawl (used to train most LLMs) ────────────────────────────
      { userAgent: 'CCBot',           disallow: '/' },

      // ── ByteDance / TikTok ────────────────────────────────────────────────
      { userAgent: 'Bytespider',      disallow: '/' },

      // ── Meta ──────────────────────────────────────────────────────────────
      { userAgent: 'FacebookBot',         disallow: '/' },
      { userAgent: 'meta-externalagent',  disallow: '/' },
      { userAgent: 'meta-externalfetcher',disallow: '/' },

      // ── Apple ─────────────────────────────────────────────────────────────
      { userAgent: 'Applebot',            disallow: '/' },
      { userAgent: 'Applebot-Extended',   disallow: '/' },

      // ── Amazon / AWS ──────────────────────────────────────────────────────
      { userAgent: 'Amazonbot',           disallow: '/' },

      // ── Other AI / LLM crawlers ───────────────────────────────────────────
      { userAgent: 'cohere-ai',           disallow: '/' },
      { userAgent: 'AI2Bot',              disallow: '/' },
      { userAgent: 'Diffbot',             disallow: '/' },
      { userAgent: 'ImagesiftBot',        disallow: '/' },
      { userAgent: 'YouBot',              disallow: '/' },
      { userAgent: 'PetalBot',            disallow: '/' },
      { userAgent: 'Omgili',              disallow: '/' },
      { userAgent: 'Omgilibot',           disallow: '/' },
      { userAgent: 'magpie-crawler',      disallow: '/' },
      { userAgent: 'Timpibot',            disallow: '/' },
      { userAgent: 'VelenPublicWebCrawler', disallow: '/' },
      { userAgent: 'TurnitinBot',         disallow: '/' },
      { userAgent: 'SemrushBot',          disallow: '/' },
      { userAgent: 'DotBot',              disallow: '/' },
      { userAgent: 'MJ12bot',             disallow: '/' },
      { userAgent: 'AhrefsBot',           disallow: '/' },
      { userAgent: 'BLEXBot',             disallow: '/' },
      { userAgent: 'DataForSeoBot',       disallow: '/' },
      { userAgent: 'SeekportBot',         disallow: '/' },
      { userAgent: 'FriendlyCrawler',     disallow: '/' },
      { userAgent: 'Scrapy',              disallow: '/' },
      { userAgent: 'TavilyBot',           disallow: '/' },
      { userAgent: 'img2dataset',         disallow: '/' },

      // ── Everything else ───────────────────────────────────────────────────
      { userAgent: '*', disallow: '/' },
    ],
    sitemap: 'https://instarishta.me/sitemap.xml',
  };
}

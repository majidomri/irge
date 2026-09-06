/**
 * Where a visitor came from, as a name rather than a hostname.
 *
 * traffic-source (mddanishyusuf/traffic-source) stores `referrer_domain` and
 * the UTM fields raw and classifies at read time. That is the right call for a
 * general analytics product — it cannot know what its users care about. This
 * one can: the question here is always "did this rishta get seen because it was
 * forwarded on WhatsApp, found on Google, or cited by an LLM", and answering it
 * from raw hostnames means every read re-implements the same mapping.
 *
 * So classification happens once, on write, and the raw host is kept alongside
 * it. If a mapping is later found wrong, `source_detail` is what lets it be
 * recomputed rather than lost.
 *
 * The LLM group is the reason this file exists at all. Nothing in a normal
 * analytics tool separates a citation in ChatGPT from a link on Facebook, and
 * for this project that distinction is most of the point — a listing surfacing
 * inside an answer engine is the outcome the /l/[id] pages, llms.txt, the
 * markdown views and the Content-Signal work were all built for. Until now
 * there was no way to tell whether any of it worked.
 */

/** Canonical buckets. Stored as text so a new one is data, not a migration. */
export type TrafficSource =
  | 'whatsapp'
  | 'google'
  | 'llm'
  | 'facebook'
  | 'instagram'
  | 'telegram'
  | 'youtube'
  | 'x'
  | 'linkedin'
  | 'bing'
  | 'search'
  | 'social'
  | 'email'
  | 'internal'
  | 'referral'
  | 'direct';

/**
 * Short hosts, matched as a whole domain rather than a substring.
 *
 * This split is not tidiness, it is a bug fix. The first version matched
 * everything with `includes`, and `t.co` — Twitter's link shortener — matched
 * "chatgp{t.co}m", so every visit from ChatGPT was filed under X. Which is
 * both wrong and wrong in the most expensive direction, since separating
 * answer-engine traffic is the reason this file exists.
 *
 * A host matches here if it equals the key or ends with "." + key, so
 * "t.co" catches t.co and www.t.co but never chatgpt.com.
 */
const EXACT_HOSTS: Array<[host: string, source: TrafficSource]> = [
  ['t.co', 'x'],
  ['x.com', 'x'],
  ['x.ai', 'llm'],
  ['t.me', 'telegram'],
  ['wa.me', 'whatsapp'],
  ['fb.me', 'facebook'],
  ['fb.com', 'facebook'],
  ['you.com', 'llm'],
  ['poe.com', 'llm'],
  ['grok.com', 'llm'],
  ['youtu.be', 'youtube'],
  ['brave.com', 'search'],
];

/**
 * Host fragments, most specific first. Matched with `includes`, so
 * "l.facebook.com" and "m.facebook.com" both land on facebook without listing
 * every subdomain a platform invents.
 *
 * Only unambiguous fragments belong here — anything short enough to appear
 * inside an unrelated domain goes in EXACT_HOSTS above.
 */
const HOST_RULES: Array<[fragment: string, source: TrafficSource]> = [
  // Answer engines first, so gemini.google.com is not read as Google search
  // and chatgpt.com is not read as anything else.
  ['chatgpt.com', 'llm'],
  ['chat.openai.com', 'llm'],
  ['openai.com', 'llm'],
  ['perplexity.ai', 'llm'],
  ['claude.ai', 'llm'],
  ['gemini.google.com', 'llm'],
  ['bard.google.com', 'llm'],
  ['copilot.microsoft.com', 'llm'],
  ['phind.com', 'llm'],
  ['deepseek.com', 'llm'],
  ['mistral.ai', 'llm'],

  // Messaging — the distribution channel this site actually runs on.
  ['whatsapp', 'whatsapp'],
  ['telegram', 'telegram'],

  // Social.
  ['facebook', 'facebook'],
  ['instagram', 'instagram'],
  ['youtube', 'youtube'],
  ['twitter.com', 'x'],
  ['linkedin', 'linkedin'],
  ['pinterest', 'social'],
  ['reddit', 'social'],
  ['snapchat', 'social'],
  ['tiktok', 'social'],
  ['threads.net', 'social'],
  ['quora', 'social'],

  // Mail before search, so mail.google.com is not counted as Google search.
  ['mail.google', 'email'],
  ['mail.yahoo', 'email'],
  ['outlook', 'email'],

  // Search. google.* last among Google hosts so gemini/bard/mail win above.
  ['bing.com', 'bing'],
  ['google.', 'google'],
  ['duckduckgo', 'search'],
  ['yandex', 'search'],
  ['ecosia', 'search'],
  ['baidu', 'search'],
  ['yahoo', 'search'],
];

/** Whole-domain match: equal to the key, or a subdomain of it. */
function matchExact(host: string): TrafficSource | null {
  for (const [key, source] of EXACT_HOSTS) {
    if (host === key || host.endsWith('.' + key)) return source;
  }
  return null;
}

/** utm_medium values, when a campaign says what it is. */
const MEDIUM_RULES: Array<[fragment: string, source: TrafficSource]> = [
  ['email', 'email'],
  ['social', 'social'],
  ['cpc', 'search'],
  ['ppc', 'search'],
  ['paid', 'search'],
  ['organic', 'search'],
  ['referral', 'referral'],
];

function match(
  value: string,
  rules: Array<[string, TrafficSource]>,
): TrafficSource | null {
  for (const [fragment, source] of rules) {
    if (value.includes(fragment)) return source;
  }
  return null;
}

export interface ClassifiedSource {
  /** The bucket to group by. */
  source: TrafficSource;
  /** The referrer hostname or utm_source, kept so a wrong mapping is fixable. */
  detail: string | null;
}

/**
 * @param referrer  the Referer header, or a URL string; anything unparseable
 *                  is treated as absent rather than thrown on
 * @param url       the landing URL, read for utm_source / utm_medium
 * @param selfHost  this site's own hostname, so internal navigation is not
 *                  counted as a referral from ourselves
 */
export function classifySource(
  referrer: string | null | undefined,
  url?: string | null,
  selfHost?: string | null,
): ClassifiedSource {
  // An explicit campaign beats a guess from the referrer.
  let utmSource: string | null = null;
  let utmMedium: string | null = null;
  if (url) {
    try {
      const params = new URL(url).searchParams;
      utmSource = params.get('utm_source');
      utmMedium = params.get('utm_medium');
    } catch {
      // Not a URL. Fall through to the referrer.
    }
  }

  if (utmSource) {
    const lower = utmSource.toLowerCase();
    const byHost = matchExact(lower) ?? match(lower, HOST_RULES);
    if (byHost) return { source: byHost, detail: lower };
    const byMedium = utmMedium ? match(utmMedium.toLowerCase(), MEDIUM_RULES) : null;
    return { source: byMedium ?? 'referral', detail: lower };
  }

  if (!referrer) return { source: 'direct', detail: null };

  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    // Some clients send a bare hostname rather than a URL.
    host = referrer.toLowerCase().trim();
    if (!host || host.includes(' ')) return { source: 'direct', detail: null };
  }

  // Our own pages linking to each other are not traffic from anywhere.
  if (selfHost && (host === selfHost || host.endsWith('.' + selfHost))) {
    return { source: 'internal', detail: host };
  }

  return { source: matchExact(host) ?? match(host, HOST_RULES) ?? 'referral', detail: host };
}

/** Display label for the admin table. */
export const SOURCE_LABEL: Record<TrafficSource, string> = {
  whatsapp:  'WhatsApp',
  google:    'Google',
  llm:       'AI / answer engines',
  facebook:  'Facebook',
  instagram: 'Instagram',
  telegram:  'Telegram',
  youtube:   'YouTube',
  x:         'X / Twitter',
  linkedin:  'LinkedIn',
  bing:      'Bing',
  search:    'Other search',
  social:    'Other social',
  email:     'Email',
  internal:  'On-site',
  referral:  'Other sites',
  direct:    'Direct',
};

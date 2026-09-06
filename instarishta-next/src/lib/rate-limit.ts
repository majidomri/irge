/**
 * A sliding-window rate limiter for the edge.
 *
 * The DataDome template buys this as a service. This is the same shape without
 * the vendor, and it is worth being precise about what that costs, because the
 * difference matters when someone is actually attacking you:
 *
 *   - State lives in the memory of one edge instance. Vercel runs many, and
 *     recycles them, so a determined attacker spread across regions gets a
 *     budget per instance rather than one budget. This raises the cost of
 *     abuse; it does not cap it.
 *   - It resets on cold start.
 *   - It cannot see a distributed botnet as one actor.
 *
 * So: a speed bump against scripted hammering from a handful of addresses,
 * which is what this site actually sees, and honest about not being a WAF. If
 * the traffic ever justifies one, the upgrade is a shared store (Upstash,
 * Vercel KV) behind the same interface, or a real vendor.
 *
 * The window is a two-bucket approximation rather than a list of timestamps:
 * memory stays O(1) per key, which matters when the map is holding thousands
 * of addresses.
 */

type Bucket = {
  /** Start of the current window, in ms. */
  windowStart: number;
  current: number;
  previous: number;
};

const buckets = new Map<string, Bucket>();

/**
 * Bound the map so a flood of unique addresses cannot grow it without limit —
 * the memory exhaustion would be a denial of service in itself.
 */
const MAX_KEYS = 20_000;

export type RateLimitResult = {
  ok: boolean;
  /** Requests counted in the current sliding window. */
  count: number;
  limit: number;
  /** Seconds until the window rolls over; for Retry-After. */
  resetSeconds: number;
};

/**
 * @param key    what is being limited — usually "<scope>:<ip>"
 * @param limit  requests permitted per window
 * @param windowMs  window length
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket) {
    // Evict wholesale rather than tracking an LRU: this map is a cache of
    // recent behaviour, and dropping it costs an attacker one window at worst.
    if (buckets.size >= MAX_KEYS) buckets.clear();
    bucket = { windowStart: now, current: 0, previous: 0 };
    buckets.set(key, bucket);
  }

  const elapsed = now - bucket.windowStart;

  if (elapsed >= windowMs * 2) {
    // Long gone: start fresh.
    bucket.windowStart = now;
    bucket.previous = 0;
    bucket.current = 0;
  } else if (elapsed >= windowMs) {
    // One window has rolled over.
    bucket.windowStart = now - (elapsed - windowMs);
    bucket.previous = bucket.current;
    bucket.current = 0;
  }

  bucket.current += 1;

  // Weight the previous window by how much of it still overlaps. A burst that
  // straddles a boundary is counted, instead of being forgiven by the reset.
  const overlap = 1 - (now - bucket.windowStart) / windowMs;
  const count = Math.round(bucket.previous * Math.max(0, overlap) + bucket.current);

  return {
    ok: count <= limit,
    count,
    limit,
    resetSeconds: Math.max(1, Math.ceil((windowMs - (now - bucket.windowStart)) / 1000)),
  };
}

/**
 * Per-address ceilings, applied alongside the per-visitor budgets below.
 *
 * India's mobile networks are heavily CGNAT'd: thousands of real people can
 * share one public address, so an IP-only limit punishes a whole carrier for
 * one abuser. A visitor cookie gives each browser its own budget — but a
 * cookie is trivially rotated, so keying *only* on it would hand an attacker
 * an unlimited allowance.
 *
 * So both apply, and the stricter wins. The address ceiling is generous
 * enough that a shared carrier NAT never reaches it in normal use, while
 * still stopping one host hammering the site behind a thousand fresh cookies.
 */
export const IP_CEILINGS = {
  auth: { limit: 60, windowMs: 60_000 },
  api: { limit: 600, windowMs: 60_000 },
  botPages: { limit: 240, windowMs: 60_000 },
  /** Anonymous writes — reports and comments. Nobody files 20 in a minute. */
  anonWrite: { limit: 40, windowMs: 60_000 },
  /**
   * Generous, because Indian mobile networks put thousands of people behind
   * one carrier-NAT address and a whole college sharing an IP must not be
   * throttled because one of them is browsing quickly.
   */
  listings: { limit: 200, windowMs: 60_000 },
  /** Same reasoning as listings: the ceiling is the shared-address guard. */
  creditSpend: { limit: 60, windowMs: 60_000 },
} as const;

/** Budgets, by what is being protected. */
export const BUDGETS = {
  /**
   * Sign-in, magic links, phone codes. Tight: these cost real money (SMS,
   * email) and are the ones worth brute-forcing.
   */
  auth: { limit: 12, windowMs: 60_000 },
  /** Everything else under /api/. Generous enough for a busy session. */
  api: { limit: 120, windowMs: 60_000 },
  /**
   * Page requests, and only from clients that look automated. Real browsers
   * are not limited at all: pages are CDN-cached, so a human clicking fast
   * costs us nothing, and a false positive here would be a broken site.
   */
  botPages: { limit: 60, windowMs: 60_000 },
  /**
   * /api/reports, /api/comments and /api/payment-notify accept writes from
   * signed-out visitors by design — requiring an account to report abuse
   * suppresses the reports that matter most, and someone paying for their
   * first plan may not have signed in yet — which makes them the anonymous
   * write surface, and the one worth a tighter budget than the rest of the API.
   */
  anonWrite: { limit: 8, windowMs: 60_000 },
  /**
   * Listing detail pages — /l/[id] and /p/[slug].
   *
   * These carry sequential ids, so the whole catalogue can be walked by
   * counting. Page requests were only limited when the user-agent looked like
   * a bot, which means a scraper sending a normal Chrome string had no limit
   * at all — the exact "hit a sequence of ids in one session" pattern this
   * budget exists to stop.
   *
   * 45/min is far more than reading allows. Opening a listing, reading it and
   * going back is a several-second loop, so a person skimming hard reaches
   * perhaps 15; 45 leaves room for prefetch and double-taps while still
   * cutting a 500-page harvest from seconds to a quarter of an hour — long
   * enough that STRIKES below can see it happening.
   */
  listings: { limit: 45, windowMs: 60_000 },
  /**
   * The endpoints that can move a member's contact credits.
   *
   * Today this is belt and braces: /api/interests/reveal needs a session, a
   * real interestId, an interest the other family has *accepted*, and it is
   * idempotent on a repeat reveal — so credits cannot be drained by walking
   * ids, and re-revealing the same contact charges once.
   *
   * The reason it gets its own budget anyway is that every one of those checks
   * is an invariant in application code. A future change that relaxes any of
   * them turns the general 120/min API budget into 120 chances a minute to
   * spend somebody else's credits. A member reveals a handful of numbers in a
   * sitting; 10 a minute is already generous, and it costs a real user
   * nothing.
   */
  creditSpend: { limit: 10, windowMs: 60_000 },
} as const;

/**
 * The second step: what happens when the pattern repeats.
 *
 * One burst is a fast reader or a flaky connection retrying, and a 60-second
 * 429 is the whole answer. Somebody who trips that budget repeatedly is not
 * reading, and telling them "try again in a minute" forever just sets the pace
 * of their crawl.
 *
 * So trips are counted, and the third within the hour buys a much longer
 * pause and writes a security event, which is what puts the address in front
 * of an admin in /nizam. Verification is a human step there — the denylist is
 * admin-managed on purpose, so nothing here bans anyone by itself.
 */
export const STRIKES = {
  /** Trips allowed in the window before the long pause applies. */
  limit: 3,
  windowMs: 60 * 60_000,
  /** Retry-After sent once the strikes are used up. */
  cooldownSeconds: 15 * 60,
} as const;

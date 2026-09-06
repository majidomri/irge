/**
 * What we know about a request before any of our code runs: where it came
 * from, who is asking, and whether we already distrust them.
 *
 * Everything here is a pure read of headers, so it is safe in middleware (edge
 * runtime, no I/O) and in route handlers alike.
 *
 * One rule governs how these may be used: **never vary a cacheable response by
 * any of it.** 191 pages are prerendered and served from the CDN, and Next
 * overwrites `Vary` on page responses with its own RSC value — proven twice in
 * this codebase, once for markdown negotiation and once for the Accept header.
 * A page rendered differently per country or per device would be cached under
 * one visitor's variant and served to everyone. Geo and device are therefore
 * for *decisions* — block, rate-limit, log — not for rendering.
 */

/** Vercel's edge geo headers. Absent locally and on other hosts. */
export type Geo = {
  country?: string;
  region?: string;
  city?: string;
  timezone?: string;
};

export function geoFrom(headers: Headers): Geo {
  const read = (name: string) => {
    const v = headers.get(name);
    // Vercel percent-encodes city names with non-ASCII characters.
    if (!v) return undefined;
    try {
      return decodeURIComponent(v) || undefined;
    } catch {
      return v;
    }
  };

  return {
    country: read('x-vercel-ip-country'),
    region: read('x-vercel-ip-country-region'),
    city: read('x-vercel-ip-city'),
    timezone: read('x-vercel-ip-timezone'),
  };
}

/** Compact form for a log line: "IN/TG/Hyderabad". */
export function geoLabel(geo: Geo): string {
  const parts = [geo.country, geo.region, geo.city].filter(Boolean);
  return parts.length ? parts.join('/') : '-';
}

/**
 * The client's address.
 *
 * `x-forwarded-for` is a chain and only the *first* entry is the client; the
 * rest are proxies and are attacker-controlled on the way in. Vercel sets
 * `x-real-ip` itself, so it is preferred where present.
 */
export function clientIp(headers: Headers): string {
  const real = headers.get('x-real-ip');
  if (real) return real.trim();

  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();

  return headers.get('cf-connecting-ip')?.trim() ?? 'unknown';
}

export type DeviceClass = 'bot' | 'mobile' | 'tablet' | 'desktop';

/**
 * Coarse device classification.
 *
 * Deliberately coarse: fine-grained UA parsing is a losing game, and this is
 * only ever used for logging and for choosing a rate-limit budget. It must not
 * reach a render — see the note at the top of this file.
 */
export function deviceClass(userAgent: string): DeviceClass {
  const ua = userAgent.toLowerCase();

  if (/bot|crawl|spider|slurp|headless|curl|wget|python-requests|axios|postman/.test(ua)) {
    return 'bot';
  }
  // Tablet before mobile: an iPad's UA contains neither "mobile" nor "android"
  // in the desktop-mode case, but Android tablets say "android" without
  // "mobile", which is the standard way to tell them apart.
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(ua)) return 'tablet';
  if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini/.test(ua)) return 'mobile';

  return 'desktop';
}

/**
 * Addresses we refuse outright, from the BLOCKED_IPS environment variable:
 * a comma-separated list of exact addresses or prefixes ending in a dot, so
 * "203.0.113." blocks that /24 without needing CIDR arithmetic at the edge.
 *
 * Parsed once per instance rather than per request.
 */
let denyList: string[] | null = null;

function getDenyList(): string[] {
  if (denyList) return denyList;
  denyList = (process.env.BLOCKED_IPS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return denyList;
}

export function isBlockedIp(ip: string): boolean {
  if (ip === 'unknown') return false;

  for (const entry of getDenyList()) {
    if (entry.endsWith('.') ? ip.startsWith(entry) : ip === entry) return true;
  }
  return false;
}

/**
 * The denylist, as maintained in /nizam.
 *
 * Middleware runs at the edge and cannot reach Postgres, so it reads the list
 * through /api/firewall and holds it in module memory. One request per
 * instance per TTL, not per visitor.
 *
 * Fail-open throughout: if the fetch fails the previous list stays in force,
 * and if there has never been one nobody is blocked. A denylist that starts
 * refusing everyone because a database was briefly unreachable would be a
 * worse outage than the abuse it exists to stop.
 */
const LIST_TTL_MS = 60_000;

let livePatterns: string[] = [];
let fetchedAt = 0;
let inFlight: Promise<void> | null = null;

export function refreshDenyList(origin: string, secret: string | undefined): Promise<void> | void {
  if (!secret) return;
  if (Date.now() - fetchedAt < LIST_TTL_MS) return;
  // One refresh at a time per instance, however many requests arrive together.
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetch(`${origin}/api/firewall`, {
        headers: { 'x-firewall-secret': secret },
        cache: 'no-store',
      });
      if (!res.ok) return;

      const data = (await res.json()) as { patterns?: unknown; stale?: boolean };
      if (data.stale || !Array.isArray(data.patterns)) return;

      livePatterns = data.patterns.filter((p): p is string => typeof p === 'string');
      fetchedAt = Date.now();
    } catch {
      // Keep the previous list.
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Checks the env fallback and the admin-managed list together. */
export function isDenied(ip: string): boolean {
  if (ip === 'unknown') return false;
  if (isBlockedIp(ip)) return true;

  for (const entry of livePatterns) {
    if (entry.endsWith('.') ? ip.startsWith(entry) : ip === entry) return true;
  }
  return false;
}

/**
 * Headers the proxy sets for API route handlers, so each one does not
 * re-derive the same facts from raw headers.
 *
 * Prefixed and stripped on the way in. A client can send any header it likes,
 * including these, so inbound copies are removed before ours are written —
 * otherwise a request could forge the IP and geo that end up in the firewall
 * log and the rate-limit key.
 */
export const FORWARDED = {
  ip:     'x-ir-ip',
  geo:    'x-ir-geo',
  device: 'x-ir-device',
  requestId: 'x-ir-request-id',
} as const;

/**
 * A short id for correlating a response with its log lines.
 *
 * Not a UUID: this only has to be unique enough to grep for within a window
 * of logs, and it travels in a header on every API response.
 */
export function newRequestId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/**
 * A per-browser identifier used only for rate-limit fairness.
 *
 * Set on API responses, never on page responses: a page can be served from the
 * CDN, and a cached Set-Cookie would hand every visitor the same id. API
 * routes are already no-store, so there is nothing to poison.
 *
 * Deliberately not an identity. It is httpOnly so page scripts cannot read it,
 * carries no information about the person, and survives only as a bucket key.
 * Anyone can drop it and fall back to being limited by address, which is why
 * the address ceiling exists alongside it.
 */
export const VISITOR_COOKIE = 'ir_rl';

export function visitorId(req: { cookies: { get(name: string): { value: string } | undefined } }): string | null {
  const raw = req.cookies.get(VISITOR_COOKIE)?.value;
  // Only accept what we would have issued; a hand-crafted value is ignored
  // rather than trusted as a bucket key.
  return raw && /^[a-z0-9]{16,32}$/.test(raw) ? raw : null;
}

export function newVisitorId(): string {
  return (
    Math.random().toString(36).slice(2, 12) +
    Date.now().toString(36).slice(-6)
  ).slice(0, 20);
}

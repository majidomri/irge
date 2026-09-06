/**
 * 8G Firewall — Next.js Proxy (the v16 rename of the middleware convention)
 *
 * Enforces the 8G Firewall rules that Apache's mod_rewrite handled server-side.
 * Two-mode operation controlled by FIREWALL_SAFE_MODE env var:
 *
 *   FIREWALL_SAFE_MODE=1  →  AUDIT mode: logs what would be blocked, never blocks.
 *                            Use this in staging / first deploy to catch false positives.
 *
 *   (unset / 0)           →  ENFORCE mode: blocks with 403.
 *                            Set this once audit logs look clean.
 *
 * Check enforcement split:
 *   ALL routes  — method, URI path, query string, cookie
 *   PAGE routes — user agent, referrer   (API routes skip UA check so dev tools work)
 */

import { NextRequest, NextResponse, type NextFetchEvent } from 'next/server';
import {
  BAD_METHOD,
  BAD_URI,
  BAD_QUERY,
  BAD_COOKIE,
  ALLOW_UA,
  BAD_UA,
  BAD_REFERER,
} from '@/lib/firewall';
import {
  clientIp,
  deviceClass,
  FORWARDED,
  geoFrom,
  geoLabel,
  isDenied,
  newRequestId,
  newVisitorId,
  refreshDenyList,
  visitorId,
  VISITOR_COOKIE,
} from '@/lib/request-context';
import { BUDGETS, IP_CEILINGS, rateLimit } from '@/lib/rate-limit';

const SAFE_MODE = process.env.FIREWALL_SAFE_MODE === '1';

// Admin-gated route. Anything matching is checked for both a valid
// better-auth session AND for the user's email being on ADMIN_EMAILS.
const ADMIN_ROUTE = /^\/nizam(\/.*)?$/;

/**
 * Write a security event, without making the visitor wait for it.
 *
 * The proxy runs at the edge and cannot reach Postgres, so it posts to
 * /api/firewall, which can. `waitUntil` keeps the proxy alive until the write
 * settles — without it the response returns and the request is torn down
 * mid-flight, which is why nothing was landing in the table before.
 *
 * Failures are swallowed on purpose: a block must still block when the
 * logging is broken.
 */
function recordEvent(
  event: NextFetchEvent | undefined,
  req: NextRequest,
  kind: string,
  reason: string,
) {
  const secret = process.env.FIREWALL_SECRET;
  if (!secret || !event) return;

  const ua = req.headers.get('user-agent') ?? '';
  const geo = geoFrom(req.headers);

  event.waitUntil(
    fetch(`${req.nextUrl.origin}/api/firewall`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-firewall-secret': secret },
      body: JSON.stringify({
        kind,
        reason,
        ip: clientIp(req.headers),
        country: geo.country, region: geo.region, city: geo.city,
        device: deviceClass(ua),
        method: req.method,
        // Path only — a campaign parameter is the visitor's business, not
        // something to keep in a security log.
        path: req.nextUrl.pathname,
        userAgent: ua.slice(0, 300),
      }),
    }).catch(() => {}),
  );
}

function block(reason: string, req: NextRequest, event?: NextFetchEvent): NextResponse {
  const label = `[8G${SAFE_MODE ? '-AUDIT' : '-BLOCK'}]`;
  const ua = req.headers.get('user-agent') ?? '-';

  // Geo turns "someone is probing /wp-admin" into something you can act on:
  // one city hammering the site reads very differently from the same count
  // spread across three continents.
  console.warn(
    `${label} ${reason} | ${req.method} ${req.nextUrl.pathname}${req.nextUrl.search} | ` +
    `IP: ${clientIp(req.headers)} | GEO: ${geoLabel(geoFrom(req.headers))} | ` +
    `DEV: ${deviceClass(ua)} | UA: ${ua.slice(0, 80)}`
  );

  recordEvent(event, req, SAFE_MODE ? 'audit' : 'blocked', reason);

  if (SAFE_MODE) return NextResponse.next();
  return new NextResponse(null, { status: 403 });
}

/** 429 with the headers a well-behaved client will actually respect. */
function tooManyRequests(
  reason: string,
  req: NextRequest,
  resetSeconds: number,
  event?: NextFetchEvent,
): NextResponse {
  console.warn(
    `[RATE-LIMIT${SAFE_MODE ? '-AUDIT' : ''}] ${reason} | ${req.method} ${req.nextUrl.pathname} | ` +
    `IP: ${clientIp(req.headers)} | GEO: ${geoLabel(geoFrom(req.headers))}`
  );

  recordEvent(event, req, 'rate-limited', reason);

  if (SAFE_MODE) return NextResponse.next();

  return new NextResponse('Too many requests\n', {
    status: 429,
    headers: {
      'Retry-After': String(resetSeconds),
      'Content-Type': 'text/plain; charset=utf-8',
      // Never cache a rate-limit response: it is about this client, now.
      'Cache-Control': 'no-store',
    },
  });
}

export function proxy(req: NextRequest, event: NextFetchEvent) {
  const pathname = req.nextUrl.pathname;
  const isAPI    = pathname.startsWith('/api/');

  // Block old /admin URL — redirect silently so the route is not discoverable.
  if (pathname.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  // The firewall's own back-channel must never be firewalled, or a refresh
  // could lock the instance out of the list it needs.
  if (pathname === '/api/firewall') return NextResponse.next();

  const ip = clientIp(req.headers);

  // Keep the admin-managed denylist warm. Not awaited: the first request after
  // a TTL lapse should not wait on a round trip, it just uses the list we have.
  refreshDenyList(req.nextUrl.origin, process.env.FIREWALL_SECRET);

  // ── Denylist ──────────────────────────────────────────────────────────────
  // Addresses an admin has blocked in /nizam, plus the BLOCKED_IPS fallback.
  if (isDenied(ip)) {
    return block('denied-ip', req, event);
  }

  // ── Rate limiting ─────────────────────────────────────────────────────────
  // Real browsers requesting pages are never limited: those pages are
  // CDN-cached, so fast clicking costs nothing, and a false positive here
  // would break the site for a real family. Only the expensive surfaces and
  // clients that look automated get a budget.
  const device = deviceClass(req.headers.get('user-agent') ?? '');

  // Reports and comments accept writes from signed-out visitors by design, so
  // they are the one anonymous write surface and get their own budget.
  const isAnonWrite =
    req.method === 'POST' &&
    (pathname === '/api/reports' || pathname === '/api/comments');

  const scope = isAnonWrite
    ? 'anonWrite'
    : pathname.startsWith('/api/auth/')
      ? 'auth'
      : isAPI
        ? 'api'
        : device === 'bot'
          ? 'botPages'
          : null;

  // The browser's own bucket, where it has one. A visitor behind a carrier NAT
  // shares an address with thousands of people but not a cookie.
  const visitor = visitorId(req);

  if (scope && ip !== 'unknown') {
    const perVisitor = BUDGETS[scope];
    const perAddress = IP_CEILINGS[scope];

    // Both apply and the stricter wins: the cookie stops one browser
    // monopolising a shared address, the address stops one host rotating
    // cookies to escape the cookie budget.
    const checks = [
      rateLimit(`${scope}:ip:${ip}`, perAddress.limit, perAddress.windowMs),
      ...(visitor
        ? [rateLimit(`${scope}:v:${visitor}`, perVisitor.limit, perVisitor.windowMs)]
        // No cookie yet — hold them to the per-visitor budget on their address
        // so a client that simply never stores cookies is not unlimited.
        : [rateLimit(`${scope}:nocookie:${ip}`, perVisitor.limit, perVisitor.windowMs)]),
    ];

    const failed = checks.find(c => !c.ok);
    if (failed) {
      return tooManyRequests(`${scope}:${failed.count}/${failed.limit}`, req, failed.resetSeconds, event);
    }
  }

  // ── [INTERNAL] HTTP Method ────────────────────────────────────────────────
  // Block CONNECT, DEBUG, MOVE, TRACE, TRACK — browsers never send these.
  if (BAD_METHOD.test(req.method)) {
    return block(`bad-method:${req.method}`, req, event);
  }

  // ── [EXTERNAL] Request URI ────────────────────────────────────────────────
  // Block shell exploits, config file probes, dangerous extensions, etc.
  if (BAD_URI.test(pathname)) {
    return block(`bad-uri:${pathname}`, req, event);
  }

  // ── [INTERNAL] Query String ───────────────────────────────────────────────
  // Block SQL injection, XSS, LFI, RFI, PHP code execution in query params.
  const rawQuery = req.nextUrl.search.slice(1); // strip leading '?'
  if (rawQuery && BAD_QUERY.test(rawQuery)) {
    return block('bad-query', req, event);
  }

  // ── [INTERNAL] Cookie ─────────────────────────────────────────────────────
  // Block malicious cookie values (HTML injection, null bytes, CRLF).
  const cookie = req.headers.get('cookie') ?? '';
  if (cookie && BAD_COOKIE.test(cookie)) {
    return block('bad-cookie', req, event);
  }

  // ── [EXTERNAL] User Agent + Referrer (page routes only) ──────────────────
  // API routes are excluded so legitimate developer tools (curl, Postman, etc.)
  // can still reach the API. Only browser-facing pages enforce UA blocking.
  if (!isAPI) {
    const ua = req.headers.get('user-agent') ?? '';

    // Googlebot family must always pass through for SEO — check first.
    if (ALLOW_UA.test(ua)) return NextResponse.next();

    // Block AI training bots, scrapers, exploit scanners.
    if (BAD_UA.test(ua)) return block('bad-ua', req, event);

    // Block pharma spam referrers and code injection via Referer header.
    const referer = req.headers.get('referer') ?? '';
    if (referer && BAD_REFERER.test(referer)) {
      return block('bad-referer', req, event);
    }
  }

  // ── [AUTH] /nizam admin gate ─────────────────────────────────────────────────
  // Fast path: check that the better-auth session cookie exists at all. The
  // full session-load + ADMIN_EMAILS check happens inside the /nizam page +
  // /api/admin/* routes (where we already have access to lib/auth's getSession).
  // That keeps middleware off the Postgres path while still bouncing
  // unauthenticated visitors before they see the dashboard shell.
  if (ADMIN_ROUTE.test(pathname)) {
    const cookies = req.headers.get('cookie') ?? '';
    const hasSessionCookie =
      /better-auth\.session_token=|__Secure-better-auth\.session_token=/.test(cookies);

    if (!hasSessionCookie) {
      const url = req.nextUrl.clone();
      url.pathname = '/';
      url.searchParams.set('signin', '1');
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
  }

  // ── Markdown content negotiation ──────────────────────────────────────────
  // An agent asking for `Accept: text/markdown` gets the markdown view of the
  // same URL. Browsers ask for text/html and are unaffected.
  if (req.method === 'GET' && wantsMarkdown(req) && MARKDOWN_PATHS.test(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = `/md${pathname === '/' ? '' : pathname}`;
    return NextResponse.rewrite(url);
  }

  // ── Request headers for API handlers ──────────────────────────────────────
  // Only for /api/: those routes are dynamic anyway, so passing per-request
  // facts to them costs no caching. Doing the same on page routes would be
  // the trap this file has hit twice — a page that reads a per-visitor header
  // is a page that cannot be shared from the CDN.
  if (isAPI) {
    const requestHeaders = new Headers(req.headers);

    // Strip any inbound copies first. A client can send these itself, and a
    // forged x-ir-ip would land in the firewall log and the rate-limit key.
    for (const name of Object.values(FORWARDED)) requestHeaders.delete(name);

    const requestId = newRequestId();
    requestHeaders.set(FORWARDED.ip, ip);
    requestHeaders.set(FORWARDED.geo, geoLabel(geoFrom(req.headers)));
    requestHeaders.set(FORWARDED.device, device);
    requestHeaders.set(FORWARDED.requestId, requestId);

    const apiRes = NextResponse.next({ request: { headers: requestHeaders } });

    // Echoed back so a report of "this call failed" can be found in the logs
    // without asking anyone for a timestamp.
    apiRes.headers.set(FORWARDED.requestId, requestId);

    // Issue the rate-limit cookie here and nowhere else. API responses are
    // no-store, so this can never be cached and handed to a second visitor.
    if (!visitor) {
      apiRes.cookies.set(VISITOR_COOKIE, newVisitorId(), {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return apiRes;
  }

  const res = NextResponse.next();

  // Every public page can answer in two representations now, so shared caches
  // must key on Accept even when this request wanted HTML.
  if (MARKDOWN_PATHS.test(pathname)) {
    res.headers.set('Vary', 'Accept');
  }

  return res;
}

/**
 * True when markdown is genuinely asked for.
 *
 * A wildcard Accept — what curl and most scripts send — must not match, or
 * every scripted fetch would get markdown instead of the page. Only an
 * explicit mention of text/markdown counts, and a `q=0` on it means "not this".
 */
function wantsMarkdown(req: NextRequest): boolean {
  const accept = req.headers.get('accept');
  if (!accept) return false;

  for (const part of accept.split(',')) {
    const [type, ...rest] = part.trim().split(';');
    if (type.trim().toLowerCase() !== 'text/markdown') continue;

    const q = rest
      .map((p) => p.trim().toLowerCase())
      .find((p) => p.startsWith('q='));

    return q ? Number(q.slice(2)) > 0 : true;
  }

  return false;
}

/**
 * Paths with a markdown view. Kept in step with markdownForPath() in
 * lib/markdown-view.ts — a path listed here but unknown there 404s.
 */
const MARKDOWN_PATHS =
  /^\/(?:$|profiles$|channels$|biodata$|pricing$|security$|child-safety$|privacy$|toc$|disclaimer$|refund-policy$|p\/[A-Za-z0-9_-]{1,64}$)/;

export const config = {
  matcher: [
    // All routes except Next.js static file serving (_next/static, _next/image).
    // Includes /api/, page routes, robots.txt, sitemap.xml, etc.
    '/((?!_next/static|_next/image).*)',
  ],
};

/**
 * 8G Firewall — Next.js Edge Middleware
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

import { NextRequest, NextResponse } from 'next/server';
import {
  BAD_METHOD,
  BAD_URI,
  BAD_QUERY,
  BAD_COOKIE,
  ALLOW_UA,
  BAD_UA,
  BAD_REFERER,
} from '@/lib/firewall';

const SAFE_MODE = process.env.FIREWALL_SAFE_MODE === '1';

// Admin-gated route. Anything matching is checked for both a valid
// better-auth session AND for the user's email being on ADMIN_EMAILS.
const ADMIN_ROUTE = /^\/nizam(\/.*)?$/;

function block(reason: string, req: NextRequest): NextResponse {
  const label = `[8G${SAFE_MODE ? '-AUDIT' : '-BLOCK'}]`;
  console.warn(
    `${label} ${reason} | ${req.method} ${req.nextUrl.pathname}${req.nextUrl.search} | ` +
    `UA: ${(req.headers.get('user-agent') ?? '-').slice(0, 80)} | ` +
    `IP: ${req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? '-'}`
  );
  if (SAFE_MODE) return NextResponse.next();
  return new NextResponse(null, { status: 403 });
}

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const isAPI    = pathname.startsWith('/api/');

  // Block old /admin URL — redirect silently so the route is not discoverable.
  if (pathname.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  // ── [INTERNAL] HTTP Method ────────────────────────────────────────────────
  // Block CONNECT, DEBUG, MOVE, TRACE, TRACK — browsers never send these.
  if (BAD_METHOD.test(req.method)) {
    return block(`bad-method:${req.method}`, req);
  }

  // ── [EXTERNAL] Request URI ────────────────────────────────────────────────
  // Block shell exploits, config file probes, dangerous extensions, etc.
  if (BAD_URI.test(pathname)) {
    return block(`bad-uri:${pathname}`, req);
  }

  // ── [INTERNAL] Query String ───────────────────────────────────────────────
  // Block SQL injection, XSS, LFI, RFI, PHP code execution in query params.
  const rawQuery = req.nextUrl.search.slice(1); // strip leading '?'
  if (rawQuery && BAD_QUERY.test(rawQuery)) {
    return block('bad-query', req);
  }

  // ── [INTERNAL] Cookie ─────────────────────────────────────────────────────
  // Block malicious cookie values (HTML injection, null bytes, CRLF).
  const cookie = req.headers.get('cookie') ?? '';
  if (cookie && BAD_COOKIE.test(cookie)) {
    return block('bad-cookie', req);
  }

  // ── [EXTERNAL] User Agent + Referrer (page routes only) ──────────────────
  // API routes are excluded so legitimate developer tools (curl, Postman, etc.)
  // can still reach the API. Only browser-facing pages enforce UA blocking.
  if (!isAPI) {
    const ua = req.headers.get('user-agent') ?? '';

    // Googlebot family must always pass through for SEO — check first.
    if (ALLOW_UA.test(ua)) return NextResponse.next();

    // Block AI training bots, scrapers, exploit scanners.
    if (BAD_UA.test(ua)) return block('bad-ua', req);

    // Block pharma spam referrers and code injection via Referer header.
    const referer = req.headers.get('referer') ?? '';
    if (referer && BAD_REFERER.test(referer)) {
      return block('bad-referer', req);
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

  return NextResponse.next();
}

export const config = {
  matcher: [
    // All routes except Next.js static file serving (_next/static, _next/image).
    // Includes /api/, page routes, robots.txt, sitemap.xml, etc.
    '/((?!_next/static|_next/image).*)',
  ],
};

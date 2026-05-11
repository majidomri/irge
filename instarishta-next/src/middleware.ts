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
import { createServerClient } from '@supabase/ssr';
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

// Route guards — page-level auth enforcement runs in middleware so unauthenticated
// requests are redirected BEFORE Next.js renders the page shell. Matches the
// Bytegrad / Next.js docs recommendation: keep auth in middleware, not layouts.
const ACCOUNT_ROUTE = /^\/account(\/.*)?$/;
const ADMIN_ROUTE   = /^\/nizam(\/.*)?$/;

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

export async function middleware(req: NextRequest) {
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

  // ── [AUTH] Protected page routes ─────────────────────────────────────────────
  // After firewall passes, gate /account/* and /nizam/* by verifying the user's
  // Supabase session server-side via getUser() (which validates the JWT against
  // Supabase Auth — unlike getSession() which trusts the local cookie blindly).
  // Returns the redirect BEFORE the page renders, so unauthenticated users never
  // see the protected page shell.
  const needsAuth  = ACCOUNT_ROUTE.test(pathname);
  const needsAdmin = ADMIN_ROUTE.test(pathname);

  if (needsAuth || needsAdmin) {
    let supabaseResponse = NextResponse.next({ request: req });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => req.cookies.getAll(),
          setAll: (cookiesToSet) => {
            // Forward refreshed auth cookies back to the browser. The Supabase
            // SDK may rotate tokens here, so we must include them in the response.
            supabaseResponse = NextResponse.next({ request: req });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      // Not signed in → bounce to home with a flag so the UI can open the
      // auth modal automatically. Includes the original destination so we
      // can return them after login.
      const url = req.nextUrl.clone();
      url.pathname = '/';
      url.searchParams.set('signin', '1');
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }

    // Admin routes additionally require the user's email to be in ADMIN_EMAILS.
    if (needsAdmin) {
      const allowed = (process.env.ADMIN_EMAILS ?? '')
        .split(',').map(e => e.trim()).filter(Boolean);
      if (allowed.length > 0 && !allowed.includes(user.email ?? '')) {
        const url = req.nextUrl.clone();
        url.pathname = '/';
        return NextResponse.redirect(url);
      }
    }

    return supabaseResponse;
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

/**
 * withAdmin — wrapper for /api/admin/* routes that gates by better-auth
 * session + ADMIN_EMAILS allowlist. Returns 401 for anonymous, 403 for
 * signed-in but non-admin. Provides a service-role Supabase client to
 * the handler for cross-RLS writes.
 */
// Server-only: this module reaches for the service-role key, which bypasses
// row-level security and must never be part of a browser bundle. Without
// this line a client component importing it is a silent regression rather
// than a build error — which is exactly how the Resend SDK ended up in the
// /report page's first load.
import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { auth, isAdminEmail } from '@/lib/auth';

// Loose typing for the admin's DB client. The default SupabaseClient generic
// resolves insert payloads to `never`, which collides with our untyped
// table inserts (ir_channels, ir_posts, etc. — no generated Database type).
// `SupabaseClient<any, any, any>` keeps autocomplete on .from()/select()/etc.
// without breaking inserts. We trust the admin route's own validation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AdminDb = SupabaseClient<any, any, any>;

export interface AdminCtx {
  email:  string;
  body:   Record<string, unknown>;
  params: Record<string, string>;
  db:     AdminDb;
}

type AdminHandler = (req: NextRequest, ctx: AdminCtx) => Promise<NextResponse>;

function serviceClient(): AdminDb {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// Mutating HTTP methods that should require a *fresh* session when step-up is on.
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Opt-in fresh-session step-up for admin mutations (xavio "fresh-session for
// mutations" parallel). OFF by default — this app has no re-auth challenge UI,
// so requiring re-login every `session.freshAge` (15 min) would block the
// admin's normal CRUD. Set ADMIN_FRESH_SESSION=1 to enforce; the client then
// gets a 401 { code: 'fresh_session_required' } and must sign in again.
const REQUIRE_FRESH = process.env.ADMIN_FRESH_SESSION === '1';
const FRESH_AGE_MS  = 60 * 15 * 1000; // keep in sync with session.freshAge in lib/auth.ts

function isFreshSession(createdAt: Date | string | null | undefined): boolean {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  return Number.isFinite(t) && (Date.now() - t) < FRESH_AGE_MS;
}

export function withAdmin(handler: AdminHandler) {
  return async (
    req: NextRequest,
    routeParams?: { params: Promise<Record<string, string>> },
  ): Promise<NextResponse> => {
    try {
      const session = await auth.api.getSession({ headers: req.headers });
      if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (!isAdminEmail(session.user.email)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (REQUIRE_FRESH && MUTATING.has(req.method) && !isFreshSession(session.session?.createdAt)) {
        return NextResponse.json(
          { error: 'Re-authentication required', code: 'fresh_session_required' },
          { status: 401 },
        );
      }

      let body: Record<string, unknown> = {};
      const ct = req.headers.get('content-type') ?? '';
      if (ct.includes('application/json')) {
        body = await req.json().catch(() => ({}));
      }
      const params = routeParams?.params ? await routeParams.params : {};

      return await handler(req, {
        email:  session.user.email,
        body,
        params,
        db:     serviceClient(),
      });
    } catch (e) {
      console.error('[withAdmin]', e);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}

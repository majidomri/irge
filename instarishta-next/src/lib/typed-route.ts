/**
 * Typed route handler factory — Anzen pattern adapted for this codebase.
 * Centralises: admin auth, JSON body parsing, structured error responses.
 * Usage:
 *   export const POST = withAdmin(async (req, { body }) => { ... });
 *   export const GET  = withAdmin(async (_req, { adminId }) => { ... });
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export interface AdminCtx {
  adminId:    string;
  adminEmail: string;
  token:      string;
  body:       Record<string, unknown>;
  params:     Record<string, string>;
}

type AdminHandler = (req: NextRequest, ctx: AdminCtx, routeParams?: { params: Promise<Record<string, string>> }) => Promise<NextResponse>;

export function withAdmin(handler: AdminHandler) {
  return async (req: NextRequest, routeParams?: { params: Promise<Record<string, string>> }) => {
    try {
      // 1. Auth
      const token = req.headers.get('authorization')?.replace('Bearer ', '').trim();
      if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

      const sb = serviceClient();
      const { data: { user }, error: authErr } = await sb.auth.getUser(token);
      if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

      // 2. Admin allowlist check
      const allowed = process.env.ADMIN_EMAILS;
      if (allowed && !allowed.split(',').map(e => e.trim()).includes(user.email ?? '')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      // 3. Body (tolerates GET with no body)
      let body: Record<string, unknown> = {};
      const ct = req.headers.get('content-type') ?? '';
      if (ct.includes('application/json')) {
        body = await req.json().catch(() => ({}));
      }

      // 4. Route params (e.g. /api/admin/users/[id])
      const params = routeParams?.params ? await routeParams.params : {};

      return await handler(req, { adminId: user.id, adminEmail: user.email ?? '', token, body, params });
    } catch (e) {
      console.error('[withAdmin]', e);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}

export interface UserCtx {
  userId:     string;
  userEmail:  string;
  token:      string;
  body:       Record<string, unknown>;
}

type UserHandler = (req: NextRequest, ctx: UserCtx) => Promise<NextResponse>;

/** Wrapper for signed-in user routes (no admin check). */
export function withUser(handler: UserHandler) {
  return async (req: NextRequest) => {
    try {
      const token = req.headers.get('authorization')?.replace('Bearer ', '').trim();
      if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

      const sb = serviceClient();
      const { data: { user }, error: authErr } = await sb.auth.getUser(token);
      if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

      let body: Record<string, unknown> = {};
      const ct = req.headers.get('content-type') ?? '';
      if (ct.includes('application/json')) {
        body = await req.json().catch(() => ({}));
      }

      return await handler(req, { userId: user.id, userEmail: user.email ?? '', token, body });
    } catch (e) {
      console.error('[withUser]', e);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}

/** Lightweight wrapper for public routes — just parses body + catches errors. */
export function withRoute(handler: (req: NextRequest, body: Record<string, unknown>) => Promise<NextResponse>) {
  return async (req: NextRequest) => {
    try {
      let body: Record<string, unknown> = {};
      const ct = req.headers.get('content-type') ?? '';
      if (ct.includes('application/json')) {
        body = await req.json().catch(() => ({}));
      }
      return await handler(req, body);
    } catch (e) {
      console.error('[withRoute]', e);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}

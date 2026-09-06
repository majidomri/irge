/**
 * The edge firewall's private back-channel.
 *
 * GET  → the active denylist, for middleware to cache
 * POST → record a security event
 *
 * Both require `x-firewall-secret` to match FIREWALL_SECRET. The list names
 * addresses we are blocking, which is not something to publish: it tells an
 * attacker exactly which of their hosts got caught. The event endpoint is
 * gated for the opposite reason — anyone could otherwise fill the table.
 *
 * Node runtime: middleware runs at the edge and cannot reach Postgres, so it
 * calls this instead, once per instance per minute rather than per request.
 */
import { NextRequest, NextResponse } from 'next/server';
import { serverDb } from '@/lib/slug-resolve';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorised(req: NextRequest): boolean {
  const secret = process.env.FIREWALL_SECRET?.trim();
  // With no secret configured the channel is closed rather than open: an
  // unset variable must not turn into an unauthenticated write endpoint.
  if (!secret) return false;
  return req.headers.get('x-firewall-secret') === secret;
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await serverDb()
    .from('ir_blocked_ips')
    .select('pattern, expires_at')
    .limit(5000);

  if (error) {
    // Fail open. A database hiccup must not start blocking or unblocking
    // anyone; middleware keeps whatever list it already had.
    return NextResponse.json({ patterns: [], stale: true }, { status: 200 });
  }

  const now = Date.now();
  const patterns = (data ?? [])
    .filter(row => !row.expires_at || new Date(row.expires_at as string).getTime() > now)
    .map(row => row.pattern as string);

  return NextResponse.json({ patterns, stale: false });
}

export async function POST(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad body' }, { status: 400 });
  }

  const str = (key: string, max: number) => {
    const v = body[key];
    return typeof v === 'string' ? v.slice(0, max) : null;
  };

  const kind = str('kind', 24);
  const reason = str('reason', 120);
  if (!kind || !reason) {
    return NextResponse.json({ error: 'kind and reason required' }, { status: 400 });
  }

  // Never awaited by the caller — middleware fires this and moves on — so a
  // failure here is logged and dropped rather than surfaced.
  const { error } = await serverDb().from('ir_security_events').insert({
    kind,
    reason,
    ip:         str('ip', 64),
    country:    str('country', 8),
    region:     str('region', 16),
    city:       str('city', 64),
    device:     str('device', 16),
    method:     str('method', 10),
    path:       str('path', 300),
    user_agent: str('userAgent', 300),
  });

  if (error) console.error('[firewall] event insert failed:', error.message);

  return new NextResponse(null, { status: 204 });
}

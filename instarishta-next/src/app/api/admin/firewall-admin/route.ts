/**
 * GET    /api/admin/firewall-admin           → denylist + recent firewall events
 * POST   /api/admin/firewall-admin { pattern, reason, expiresAt? }
 * DELETE /api/admin/firewall-admin { pattern }
 *
 * The admin face of the edge firewall. Separate from /api/firewall, which is
 * the proxy's own secret-gated back-channel: that one is machine-to-machine
 * and must stay reachable even when no admin is signed in, this one is gated
 * by withAdmin like the rest of /nizam. Same tables, different callers,
 * different auth — hence two routes rather than one with two modes.
 */
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/admin-route';

/**
 * An exact IPv4/IPv6-ish address, or a prefix ending in a dot. Deliberately
 * permissive about the address itself and strict about the shape: the point is
 * to reject anything that is not an address pattern, not to re-implement
 * inet_pton in a validator.
 */
const PATTERN_RE = /^[0-9a-fA-F:.]{3,45}$/;

export const GET = withAdmin(async (_req, { db }) => {
  const [blocked, events] = await Promise.all([
    db.from('ir_blocked_ips')
      .select('id, pattern, reason, created_by, created_at, expires_at')
      .order('created_at', { ascending: false })
      .limit(500),
    db.from('ir_security_events')
      .select('id, kind, reason, ip, country, region, city, device, method, path, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  return NextResponse.json({
    blocked: blocked.data ?? [],
    events:  events.data ?? [],
  });
});

export const POST = withAdmin(async (_req, { db, body, email: actor }) => {
  const pattern = typeof body.pattern === 'string' ? body.pattern.trim() : '';
  const reason  = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : '';

  if (!PATTERN_RE.test(pattern)) {
    return NextResponse.json({ error: 'Not an address or prefix' }, { status: 400 });
  }
  if (!reason) {
    // A denylist nobody can explain becomes one nobody dares prune.
    return NextResponse.json({ error: 'reason is required' }, { status: 400 });
  }

  const expiresAt = typeof body.expiresAt === 'string' ? body.expiresAt : null;

  const { error } = await db.from('ir_blocked_ips').upsert(
    { pattern, reason, created_by: actor, expires_at: expiresAt },
    { onConflict: 'pattern' },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from('ir_moderation_actions').insert({
    action: 'block', subject_type: 'ip', subject_id: pattern, actor, reason,
  });

  return NextResponse.json({ ok: true, pattern });
});

export const DELETE = withAdmin(async (_req, { db, body, email: actor }) => {
  const pattern = typeof body.pattern === 'string' ? body.pattern.trim() : '';
  if (!pattern) return NextResponse.json({ error: 'pattern required' }, { status: 400 });

  // Removed outright rather than tombstoned: the audit row below is the
  // record, and a denylist that accumulates dead entries stops being read.
  const { error } = await db.from('ir_blocked_ips').delete().eq('pattern', pattern);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from('ir_moderation_actions').insert({
    action: 'unblock', subject_type: 'ip', subject_id: pattern, actor,
    reason: 'Removed from denylist',
  });

  return NextResponse.json({ ok: true, pattern });
});

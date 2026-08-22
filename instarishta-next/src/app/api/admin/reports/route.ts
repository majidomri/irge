/**
 * GET   /api/admin/reports?status=open&category=&q=  → report queue
 * PATCH /api/admin/reports { id, status?, admin_notes? }
 *
 * Admin-gated via withAdmin (better-auth session + ADMIN_EMAILS allowlist,
 * service-role DB). ir_reports has RLS enabled with no admin policy, so this
 * route is the only read/write path for the queue — same pattern as
 * /api/admin/interests.
 *
 * Deliberately does NOT expose a "ban this account" shortcut: for
 * entity_type 'member' the reported party is only known by their /p/ slug
 * (the underlying auth uuid is intentionally never sent to the client — see
 * src/app/p/[slug]/page.tsx), and for 'post'/'story' the entity_id is a
 * content row id, not a user id. Wiring a one-click ban would need a real
 * slug → account resolver first; until then, banning goes through the
 * existing Users tab once the admin has identified the account.
 */
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/admin-route';

const COLS = 'id, reporter_user_id, reporter_email, reporter_contact, entity_type, entity_id, '
  + 'profile_num, category, description, severity, status, admin_notes, resolved_by, resolved_at, '
  + 'ip_address, created_at';

const SETTABLE_STATUS = ['open', 'reviewing', 'actioned', 'dismissed'] as const;

export const GET = withAdmin(async (req, { db }) => {
  const url      = new URL(req.url);
  const status   = url.searchParams.get('status');
  const category = url.searchParams.get('category');
  const q        = url.searchParams.get('q')?.trim();

  let query = db.from('ir_reports').select(COLS).order('created_at', { ascending: false }).limit(200);
  if (status)   query = query.eq('status', status);
  if (category) query = query.eq('category', category);

  if (q) {
    const term = q.replace(/[,()*"']/g, ' ').trim();
    const n = parseInt(term.replace(/^(?:ir)?\s*#?\s*/i, ''), 10);
    if (!isNaN(n) && String(n) === term.replace(/^(?:ir)?\s*#?\s*/i, '')) {
      query = query.eq('profile_num', n);
    } else if (term) {
      query = query.or(`reporter_email.ilike.%${term}%,description.ilike.%${term}%,entity_id.ilike.%${term}%`);
    }
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { count: openCount } = await db
    .from('ir_reports').select('id', { count: 'exact', head: true }).eq('status', 'open');
  const { count: urgentOpenCount } = await db
    .from('ir_reports').select('id', { count: 'exact', head: true }).eq('status', 'open').eq('severity', 'urgent');

  return NextResponse.json({ reports: data ?? [], openCount: openCount ?? 0, urgentOpenCount: urgentOpenCount ?? 0 });
});

export const PATCH = withAdmin(async (_req, { db, body, email }) => {
  const id = typeof body.id === 'string' ? body.id : null;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.status === 'string') {
    if (!(SETTABLE_STATUS as readonly string[]).includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    patch.status = body.status;
    if (body.status === 'actioned' || body.status === 'dismissed') {
      patch.resolved_by = email;
      patch.resolved_at = new Date().toISOString();
    }
  }
  if (typeof body.admin_notes === 'string') patch.admin_notes = body.admin_notes.slice(0, 2000);

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data, error } = await db.from('ir_reports').update(patch).eq('id', id).select(COLS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ report: data });
});

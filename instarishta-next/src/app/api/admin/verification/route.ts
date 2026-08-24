/**
 * GET   /api/admin/verification?status=pending  → the review queue
 * PATCH /api/admin/verification { id, action: 'approve' | 'reject', reason? }
 *
 * The human gate behind the verified-profession badge. Approving is the only
 * path in the app that writes ir_user_profiles.profession_key, and it goes
 * through ir_approve_verification (migration 016) so the request row, the
 * profile and the cohort's published member_count all move in one
 * transaction — that count is public marketing copy, so drift is visible.
 *
 * Rejection is a first-class outcome and requires a reason. If nobody is ever
 * rejected the gate is theatre, and members work that out quickly.
 *
 * Both RPCs return NULL when the request was already reviewed, which this
 * route surfaces as 409 — a double-tapped Approve cannot double-count.
 *
 * Admin-gated via withAdmin. Node runtime (inherited from withAdmin).
 */
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/admin-route';

const REQ_COLS =
  'id, user_id, profession_key, doc_type, doc_reference, doc_url, note, status, reject_reason, reviewed_by, reviewed_at, created_at';

export const GET = withAdmin(async (req, { db }) => {
  const status = new URL(req.url).searchParams.get('status') ?? 'pending';

  let query = db.from('ir_verification_requests').select(REQ_COLS).limit(200);

  // Pending is the work queue, so it sorts oldest-first — nobody should sit
  // unreviewed forever. Reviewed history sorts newest-first like every other
  // admin list.
  query = status === 'all'
    ? query.order('created_at', { ascending: false })
    : query.eq('status', status).order('created_at', { ascending: status === 'pending' });

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];

  // Attach applicant identity for the queue UI. ir_user_profiles has no
  // public-read policy, so this has to happen server-side. One batched
  // lookup, not one per row.
  const ids = [...new Set(rows.map(r => r.user_id).filter(Boolean))] as string[];
  let who: Record<string, { name: string | null; email: string | null }> = {};
  if (ids.length) {
    const { data: profiles } = await db
      .from('ir_user_profiles').select('id, full_name, email').in('id', ids);
    who = Object.fromEntries(
      (profiles ?? []).map(p => [p.id, { name: p.full_name ?? null, email: p.email ?? null }]),
    );
  }

  return NextResponse.json({
    requests: rows.map(r => ({ ...r, applicant: who[r.user_id] ?? null })),
  });
});

export const PATCH = withAdmin(async (_req, { db, body, email }) => {
  const id     = typeof body.id === 'string' ? body.id : null;
  const action = body.action;

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }

  if (action === 'approve') {
    const { data, error } = await db.rpc('ir_approve_verification', {
      p_request_id: id,
      p_admin:      email,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data)  return NextResponse.json({ error: 'Already reviewed' }, { status: 409 });
    return NextResponse.json({ ok: true, request: data });
  }

  // A rejection without a reason is not a rejection the applicant can act
  // on, and we show it to them — so require it.
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
  if (!reason) {
    return NextResponse.json({ error: 'A rejection reason is required' }, { status: 400 });
  }

  const { data, error } = await db.rpc('ir_reject_verification', {
    p_request_id: id,
    p_admin:      email,
    p_reason:     reason,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: 'Already reviewed' }, { status: 409 });
  return NextResponse.json({ ok: true, request: data });
});

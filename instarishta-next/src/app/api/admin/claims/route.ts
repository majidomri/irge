/**
 * GET   /api/admin/claims?status=pending
 * PATCH /api/admin/claims { id, action: 'approve' | 'reject' | 'revoke', reason? }
 *
 * The human half of listing ownership. A claim whose phone matches the ad is
 * approved by /api/account/claims without ever appearing here; what lands in
 * this queue is everything that could not prove itself.
 *
 * Approving is the consequential action: it opens that listing's audience
 * events to one account, permanently, until revoked. So the route re-checks
 * the one-owner rule rather than trusting that the queue is still accurate —
 * a claim can sit here while somebody else's claim on the same listing is
 * approved elsewhere.
 */
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/admin-route';
import { CLAIM_COLS, type ClaimStatus } from '@/lib/claims';

const STATUSES: ClaimStatus[] = ['pending', 'approved', 'rejected', 'revoked'];

export const GET = withAdmin(async (req, { db }) => {
  const status = new URL(req.url).searchParams.get('status')?.trim();

  let query = db.from('ir_profile_claims').select(CLAIM_COLS)
    .order('created_at', { ascending: false }).limit(200);

  // Pending is the only view that needs a decision, so it is the default.
  if (status && STATUSES.includes(status as ClaimStatus)) query = query.eq('status', status);
  else if (!status) query = query.eq('status', 'pending');
  else if (status !== 'all') {
    return NextResponse.json({ error: `Unknown status '${status}'` }, { status: 400 });
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ claims: data ?? [] });
});

export const PATCH = withAdmin(async (_req, { db, body, email }) => {
  const id = typeof body.id === 'string' ? body.id : null;
  const action = body.action;
  const reason = typeof body.reason === 'string' ? body.reason.slice(0, 300) : null;

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  if (action !== 'approve' && action !== 'reject' && action !== 'revoke') {
    return NextResponse.json({ error: "action must be 'approve', 'reject' or 'revoke'" }, { status: 400 });
  }

  const { data: claim, error: readErr } = await db
    .from('ir_profile_claims').select(CLAIM_COLS).eq('id', id).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 400 });
  if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 });

  const status: ClaimStatus =
    action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'revoked';

  const { data, error } = await db
    .from('ir_profile_claims')
    .update({
      status,
      reviewed_by: email,
      reviewed_at: new Date().toISOString(),
      reason,
      proof: action === 'approve' ? (claim as { proof: string | null }).proof ?? 'manual' : null,
    })
    .eq('id', id)
    .select(CLAIM_COLS).single();

  if (error) {
    // 23505 on the partial unique index means this listing already has an
    // approved owner — the queue was stale, not the request malformed.
    const taken = error.code === '23505';
    return NextResponse.json(
      { error: taken ? 'That listing already has an approved owner.' : error.message },
      { status: taken ? 409 : 400 },
    );
  }

  // The audit trail every other admin mutation writes to.
  await db.from('ir_moderation_actions').insert({
    action: `claim_${action}`,
    subject_type: 'profile_claim',
    subject_id: (claim as { email: string }).email,
    actor: email,
    reason: reason ?? `listing ${(claim as { profile_num: number }).profile_num}`,
  });

  return NextResponse.json({ claim: data });
});

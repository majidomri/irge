/**
 * GET  /api/verification  → the signed-in member's own verification state
 *   200 → { professionKey, verifiedAt, request } — request is their latest
 *          submission (pending/approved/rejected) or null if they never applied
 *   401 → not signed in
 *
 * POST /api/verification  { professionKey, docType, docReference?, docUrl?, note? }
 *   201 → { ok:true, request }
 *   400 → unknown profession, or proof this profession does not accept
 *   401 → not signed in
 *   403 → banned account
 *   409 → a request is already pending review
 *
 * This is the front door to the whole selectivity model: a member claims a
 * profession here, an admin approves or rejects it at /api/admin/verification,
 * and only an *approved* claim ever writes profession_key onto the profile.
 * Nothing in this route grants a badge — see migration 016's
 * ir_approve_verification for the only path that does.
 *
 * ir_verification_requests has RLS with a read-own SELECT policy and no write
 * policy at all, so this service-role route is the only write path.
 *
 * Node runtime.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { serviceClient, ensureProfile } from '@/lib/credits';
import { isProfessionKey, isDocType, acceptsDoc, getProfession } from '@/lib/professions';

export const runtime = 'nodejs';

const REQ_COLS =
  'id, profession_key, doc_type, doc_reference, note, status, reject_reason, reviewed_at, created_at';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = serviceClient();
  const profile = await ensureProfile(db, session.user.email, session.user.name || null); // || not ?? — better-auth defaults name to '', not null

  // The member's own profession/verified-at live on the profile, but
  // ensureProfile's RPC projection predates migration 015 and doesn't return
  // them, so read those two columns directly.
  const { data: prof } = await db
    .from('ir_user_profiles')
    .select('profession_key, profession_verified_at')
    .eq('id', profile.id)
    .maybeSingle();

  const { data: request } = await db
    .from('ir_verification_requests')
    .select(REQ_COLS)
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    professionKey: prof?.profession_key ?? null,
    verifiedAt:    prof?.profession_verified_at ?? null,
    request:       request ?? null,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Please sign in to apply' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const professionKey = body.professionKey;
  const docType       = body.docType;

  if (!isProfessionKey(professionKey)) {
    return NextResponse.json({ error: 'Please choose one of the listed professions' }, { status: 400 });
  }
  if (!isDocType(docType)) {
    return NextResponse.json({ error: 'Please choose a document type' }, { status: 400 });
  }
  // Reject mismatched proof here rather than letting it reach the review
  // queue — an admin cannot action a "corporate email" for a doctor, and a
  // request that can only ever be rejected wastes the applicant's time.
  if (!acceptsDoc(professionKey, docType)) {
    const p = getProfession(professionKey)!;
    return NextResponse.json(
      { error: `${p.label} verification needs: ${p.proofHint}` },
      { status: 400 },
    );
  }

  const docReference = typeof body.docReference === 'string' ? body.docReference.trim().slice(0, 120) : null;
  const docUrl       = typeof body.docUrl === 'string' ? body.docUrl.trim().slice(0, 500) : null;
  const note         = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : null;

  // Some proof is required — a bare profession claim with nothing behind it
  // is exactly what this whole system exists to stop.
  if (!docReference && !docUrl) {
    return NextResponse.json(
      { error: 'Please provide a registration/membership number or upload a document' },
      { status: 400 },
    );
  }

  const db = serviceClient();
  const profile = await ensureProfile(db, session.user.email, session.user.name || null); // || not ?? — better-auth defaults name to '', not null
  if (profile.is_banned) {
    return NextResponse.json({ error: 'Account suspended' }, { status: 403 });
  }

  const { data, error } = await db
    .from('ir_verification_requests')
    .insert({
      user_id:        profile.id,
      profession_key: professionKey,
      doc_type:       docType,
      doc_reference:  docReference,
      doc_url:        docUrl,
      note,
    })
    .select(REQ_COLS)
    .single();

  if (error) {
    // ir_verification_one_pending_per_user (migration 015) — one in flight
    // at a time. Re-applying after a rejection is allowed and lands here
    // only if an earlier request is still pending.
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Your application is already under review.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, request: data }, { status: 201 });
}

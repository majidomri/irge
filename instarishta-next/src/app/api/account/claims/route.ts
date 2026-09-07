/**
 * GET  /api/account/claims        — this member's claims
 * POST /api/account/claims { profileNum }  — claim a listing as mine
 *
 * The listing catalogue is an external read-only feed with no owner field, so
 * ownership has to be asserted and then proven. The proof this accepts is a
 * verified phone number equal to the one the ad itself publishes: a member who
 * controls the contact point printed on the ad is the advertiser, or close
 * enough that a human reviewing it would agree. That case is approved on the
 * spot. Everything else is filed as pending for /nizam.
 *
 * Approving here rather than in a queue matters: the whole point of the claim
 * is to unlock the member's own audience numbers, and a feature that works
 * tomorrow does not retain anybody today.
 *
 * The database, not this route, is what guarantees one owner per listing —
 * a partial unique index over status='approved'. Two members racing on the
 * same ad end with one approval and one honest error, whichever order they
 * arrive in.
 */
import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { CLAIM_COLS, samePhone } from '@/lib/claims';
import { serviceClient, ensureProfile } from '@/lib/credits';
import { getProfiles } from '@/lib/data';

export const runtime = 'nodejs';

type FeedProfile = { id: number; title?: string; phone?: string; whatsapp?: string };

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = serviceClient();
  const profile = await ensureProfile(db, session.user.email, session.user.name || null);
  const { data, error } = await db
    .from('ir_profile_claims').select(CLAIM_COLS)
    .eq('user_id', profile.id).order('created_at', { ascending: false }).limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ claims: data ?? [] });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const profileNum = Number(body?.profileNum);
  if (!Number.isInteger(profileNum) || profileNum <= 0) {
    return NextResponse.json({ error: 'A listing number is required' }, { status: 400 });
  }

  // The listing has to exist in the feed. Claiming a number that is not
  // published would otherwise sit in the queue forever looking like real work.
  const profiles = (await getProfiles()) as FeedProfile[];
  const listing = profiles.find((p) => Number(p.id) === profileNum);
  if (!listing) {
    return NextResponse.json({ error: 'No listing with that number' }, { status: 404 });
  }

  const db = serviceClient();
  const profile = await ensureProfile(db, session.user.email, session.user.name || null);

  // Already spoken for? Say so plainly rather than queueing a claim that
  // cannot ever be approved.
  const { data: existingOwner } = await db
    .from('ir_profile_claims').select('user_id')
    .eq('profile_num', profileNum).eq('status', 'approved').maybeSingle();
  if (existingOwner && existingOwner.user_id !== profile.id) {
    return NextResponse.json(
      { error: 'This listing has already been claimed. Contact us if that is wrong.' },
      { status: 409 },
    );
  }

  const user = session.user as { phoneNumber?: string | null; phoneNumberVerified?: boolean | null };
  const verified = user.phoneNumberVerified === true ? (user.phoneNumber ?? null) : null;
  // Only a *verified* number can prove anything — an unverified one is a
  // string the member typed, and the whole check would be self-attested.
  const matches = Boolean(verified) &&
    (samePhone(verified, listing.phone) || samePhone(verified, listing.whatsapp));

  const row = {
    profile_num: profileNum,
    user_id: profile.id,
    email: profile.email,
    status: matches ? 'approved' : 'pending',
    proof: matches ? 'phone_match' : null,
    claimed_phone: verified,
    reviewed_by: matches ? 'auto:phone_match' : null,
    reviewed_at: matches ? new Date().toISOString() : null,
    reason: null,
  };

  // Upsert on the (profile_num, user_id) unique index, so re-asking after
  // verifying a phone upgrades the existing claim instead of failing.
  const { data, error } = await db
    .from('ir_profile_claims')
    .upsert(row, { onConflict: 'profile_num,user_id' })
    .select(CLAIM_COLS).single();

  if (error) {
    // The one-owner index is the other way this can fail, and it means somebody
    // else won the race between the check above and this write.
    const conflict = error.code === '23505';
    return NextResponse.json(
      { error: conflict ? 'This listing has just been claimed by someone else.' : error.message },
      { status: conflict ? 409 : 400 },
    );
  }

  return NextResponse.json({
    claim: data,
    approved: matches,
    message: matches
      ? 'Verified — this listing is now yours, and its stats are on your activity page.'
      : verified
        ? 'Submitted for review. The number on this ad does not match your verified number, so a person will check it.'
        : 'Submitted for review. Verify your mobile number to have matching claims approved instantly.',
  });
}

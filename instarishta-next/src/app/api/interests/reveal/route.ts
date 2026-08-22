/**
 * POST /api/interests/reveal  { interestId }
 *   200 → { ok:true, phone, creditsLeft, alreadyRevealed }
 *   402 → out of contact credits
 *   409 → the advertiser has not agreed to connect yet
 *   404 → not your interest
 *
 * THIS is where a contact credit is spent — not when the interest was sent.
 * The charge happens once; calling again after a refresh returns the same
 * number free (ir_reveal_interest_contact records revealed_at and short-circuits).
 *
 * Gated by a better-auth session. Node runtime.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { serviceClient, ensureProfile } from '@/lib/credits';
import { revealContact } from '@/lib/interests';

export const runtime = 'nodejs';

/**
 * The number handed back on reveal. The upstream feed carries this same relay
 * number on every profile, so it is sourced here rather than trusted from the
 * client — a client-supplied phone would let anyone write arbitrary text into
 * their own reveal record.
 */
const RELAY_PHONE = process.env.NEXT_PUBLIC_BUSINESS_WHATSAPP?.trim() || '+918886667121';

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const interestId = typeof body.interestId === 'string' ? body.interestId : null;
  if (!interestId) {
    return NextResponse.json({ error: 'Missing interestId' }, { status: 400 });
  }

  const db = serviceClient();
  // Applies any due monthly refill before we judge the balance.
  const profile = await ensureProfile(db, session.user.email, session.user.name || null); // || not ?? — better-auth defaults name to '', not null
  if (profile.is_banned) {
    return NextResponse.json({ error: 'Account suspended' }, { status: 403 });
  }

  const result = await revealContact(db, session.user.email, interestId, RELAY_PHONE);

  if (!result.ok) {
    const status =
      result.reason === 'no_credits'   ? 402 :
      result.reason === 'not_accepted' ? 409 : 404;
    return NextResponse.json({ ok: false, reason: result.reason }, { status });
  }

  return NextResponse.json({
    ok: true,
    phone: result.phone,
    creditsLeft: result.creditsLeft,
    alreadyRevealed: result.reason === 'already_revealed',
  });
}

/**
 * GET  /api/account/rcs-consent — has this member opted in?
 * POST /api/account/rcs-consent — set it.  body: { consent: boolean }
 *
 * Opting in requires a verified mobile, and records that number: consent is for
 * a number, not an account (migration 037).
 *
 * The member's own switch, and the ONLY thing that can move it. There is
 * deliberately no admin equivalent: a consent flag an operator can tick is not
 * consent, it is a checkbox, and under a regime where the penalty lands on the
 * sender the only version worth having is the one the member set themselves.
 *
 * The email comes from the session, never the body — same rule as
 * /api/account/contacts, and for the same reason.
 *
 * Node runtime (better-auth needs it).
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { serviceClient } from '@/lib/credits';
import { hasVerifiedPhone } from '@/lib/phone-gate';

export const runtime = 'nodejs';

/**
 * Where the opt-in was given.
 *
 * Stored alongside the flag because "they agreed" is not defensible without
 * "here, and at this time" — which is exactly what a DLT complaint asks for.
 */
const SOURCE = 'account_settings';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await serviceClient()
    .from('ir_user_profiles')
    .select('rcs_consent, rcs_consent_at, rcs_consent_phone')
    .eq('email', session.user.email.toLowerCase())
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const phone = session.user.phoneNumber ?? null;
  // Consent is for a number (migration 037). The trigger withdraws it when the
  // number changes, but a session can briefly carry a number the database has
  // already moved past — so never report "on" for a number it was not given for.
  const consent = Boolean(data?.rcs_consent) && data?.rcs_consent_phone === phone;

  return NextResponse.json({
    consent,
    since: consent ? data?.rcs_consent_at ?? null : null,
    phone,
    phoneVerified: hasVerifiedPhone(session.user),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (typeof body?.consent !== 'boolean') {
    return NextResponse.json({ error: 'consent must be true or false' }, { status: 400 });
  }

  const consent = body.consent as boolean;
  const phone   = session.user.phoneNumber ?? null;

  // Opting in with no verified number records a promise we cannot keep — no
  // alert can reach the member — and leaves consent with no number attached.
  // Withdrawal is always allowed.
  if (consent && (!phone || !hasVerifiedPhone(session.user))) {
    return NextResponse.json(
      { error: 'Verify your mobile number to turn on alerts.', code: 'phone_required' },
      { status: 409 },
    );
  }

  const { data, error } = await serviceClient()
    .from('ir_user_profiles')
    .update({
      rcs_consent:        consent,
      // Timestamp, source and number are cleared on withdrawal rather than
      // kept: they describe a live permission, and a stale "granted at" next to
      // consent=false reads as though it were still in force.
      rcs_consent_at:     consent ? new Date().toISOString() : null,
      rcs_consent_source: consent ? SOURCE : null,
      rcs_consent_phone:  consent ? phone : null,
    })
    .eq('email', session.user.email.toLowerCase())
    .select('email');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // An update that matched no row succeeds without saving anything. Answering
  // ok there would show the member a switch that is "on" with no consent behind
  // it — the worst possible state for this particular switch.
  if (!data?.length) {
    return NextResponse.json({ error: 'Your profile is not set up yet. Please reload and try again.' }, { status: 404 });
  }

  // Keep the messaging opt-out list in step with the member's own switch.
  // Turning it off blocks the number outright (so it is protected even from a
  // campaign that targets pasted numbers); turning it on lifts only blocks the
  // member placed — a STOP reply or this switch — never an admin's. Only a
  // verified number is touched; opting in already required one above.
  if (phone && hasVerifiedPhone(session.user)) {
    const db = serviceClient();
    if (consent) {
      await db.from('ir_msg_optouts').delete().eq('phone', phone).in('source', ['reply', 'member']);
    } else {
      await db.from('ir_msg_optouts').upsert(
        { phone, source: 'member', reason: 'Turned off in account settings' },
        { onConflict: 'phone', ignoreDuplicates: true },
      );
    }
  }

  return NextResponse.json({ ok: true, consent, phone: consent ? phone : null });
}

/**
 * GET  /api/account/rcs-consent — has this member opted in?
 * POST /api/account/rcs-consent — set it.  body: { consent: boolean }
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
    .select('rcs_consent, rcs_consent_at')
    .eq('email', session.user.email.toLowerCase())
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    consent: data?.rcs_consent ?? false,
    since:   data?.rcs_consent_at ?? null,
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

  const { error } = await serviceClient()
    .from('ir_user_profiles')
    .update({
      rcs_consent:    consent,
      // Timestamp and source are cleared on withdrawal rather than kept: they
      // describe a live permission, and a stale "granted at" next to
      // consent=false reads as though it were still in force.
      rcs_consent_at:     consent ? new Date().toISOString() : null,
      rcs_consent_source: consent ? SOURCE : null,
    })
    .eq('email', session.user.email.toLowerCase());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, consent });
}

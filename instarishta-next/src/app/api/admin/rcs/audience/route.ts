/**
 * GET /api/admin/rcs/audience — who can actually be messaged.
 *
 * A member is addressable only when BOTH halves are true, and they live in
 * different schemas:
 *
 *   • a VERIFIED phone number, in betterauth."user" — an unverified number is
 *     a string someone typed, and sending to it is sending to a stranger;
 *   • marketing CONSENT, in ir_user_profiles — set by the member in /account
 *     and by nothing else (see migration 035).
 *
 * betterauth is a private schema and is not exposed through PostgREST, so the
 * join runs through the ir_rcs_audience RPC rather than a client-side join.
 * That is the same bridge pattern the rest of the app uses to read auth data.
 *
 * Consent is reported per member rather than filtered out, because an admin
 * looking at "12 members, 3 addressable" learns something that "3 members"
 * hides — namely that the opt-in is where the audience is being lost.
 *
 * Admin-gated by withAdmin. Node runtime.
 */
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/admin-route';

export const runtime = 'nodejs';

interface AudienceRow {
  email:          string;
  name:           string | null;
  phone:          string | null;
  phone_verified: boolean;
  rcs_consent:    boolean;
  consent_at:     string | null;
  plan:           string | null;
}

export const GET = withAdmin(async (_req, { db }) => {
  const { data, error } = await db.rpc('ir_rcs_audience');

  if (error) {
    return NextResponse.json({ error: error.message, members: [] }, { status: 500 });
  }

  const members = (data ?? []) as AudienceRow[];

  // Only these can legitimately receive a promotional message. The UI selects
  // from this list and nothing else.
  const addressable = members.filter(m => m.phone_verified && m.rcs_consent && m.phone);

  return NextResponse.json({
    members,
    counts: {
      total:        members.length,
      withPhone:    members.filter(m => m.phone).length,
      verified:     members.filter(m => m.phone_verified).length,
      consented:    members.filter(m => m.rcs_consent).length,
      addressable:  addressable.length,
    },
    addressable: addressable.map(m => m.phone),
  });
});

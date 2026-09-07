/**
 * Listing ownership — matching a member to an ad in the partner feed.
 *
 * See supabase/migrations/031 for the table and why it exists. This module
 * holds the one piece of judgement: whether a claim proves itself.
 */
import 'server-only';

/**
 * Compare two phone numbers the way a person would.
 *
 * The feed publishes `+918886667121`; better-auth stores whatever the Firebase
 * flow verified, which may or may not carry the country code, and either side
 * may contain spaces or dashes. Comparing the last ten digits is what actually
 * identifies an Indian mobile — the 91 prefix is not part of the subscriber
 * number and its presence varies by how the number was typed.
 *
 * Ten, not "all digits": +918886667121 and 8886667121 are the same phone, and
 * a strict comparison would reject the member whose ad we are trying to match.
 */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const tail = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '').slice(-10);
  const x = tail(a);
  // A short or empty number must never match another short or empty one, or
  // two members with no phone on file would each "prove" the other's ad.
  return x.length === 10 && x === tail(b);
}

export type ClaimStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

export interface ProfileClaim {
  id: string;
  profile_num: number;
  user_id: string;
  email: string;
  status: ClaimStatus;
  proof: string | null;
  claimed_phone: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reason: string | null;
  created_at: string;
}

export const CLAIM_COLS =
  'id, profile_num, user_id, email, status, proof, claimed_phone, reviewed_by, reviewed_at, reason, created_at';

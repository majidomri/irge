/**
 * Interests — private lead signals, server-side only.
 *
 * An interest is NOT a public comment. Profiles belong to real, identifiable
 * people (frequently women, usually posted by their families), so the signal
 * goes privately to the team and is never rendered publicly.
 *
 * Two-sided flow:
 *   1. Sender picks a pre-made chip  → FREE, no contact credit
 *   2. Team relays to the advertiser and records the answer in /nizam
 *   3. If accepted, the sender may reveal contact → THIS costs one credit
 *
 * Sending is metered on a rolling 30-day window over ir_user_usage (the
 * mechanism already used for audio plays) plus an unadvertised daily burst cap.
 * See supabase/migrations/006_interests.sql and 007_interest_leads.sql.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export type InterestReason = 'ok' | 'duplicate' | 'monthly_limit' | 'daily_limit';
export type RevealReason   = 'ok' | 'already_revealed' | 'not_found' | 'not_accepted' | 'no_credits';

export type InterestStatus =
  | 'new' | 'seen' | 'forwarded' | 'rejected' | 'accepted' | 'declined' | 'connected';

export interface SendInterestInput {
  email:     string;
  userId:    string;
  name:      string | null;
  profileId: number;
  num:       number | null;
  title:     string;
  gender:    string | null;
  chip:      string;
  monthly:   number;
  daily:     number;
}

export interface SendInterestResult {
  ok:         boolean;
  reason:     InterestReason;
  usedMonth:  number;
  usedDay:    number;
  interestId: string | null;
}

export async function sendInterest(db: Db, input: SendInterestInput): Promise<SendInterestResult> {
  const { data, error } = await db
    .rpc('ir_send_interest', {
      p_email:          input.email,
      p_user_id:        input.userId,
      p_name:           input.name,
      p_profile_id:     input.profileId,
      p_profile_num:    input.num,
      p_profile_title:  input.title.slice(0, 300),
      p_profile_gender: input.gender,
      p_chip:           input.chip,
      p_monthly_limit:  input.monthly,
      p_daily_limit:    input.daily,
    })
    .single<{ ok: boolean; reason: InterestReason; used_month: number; used_day: number; interest_id: string | null }>();

  if (error || !data) {
    throw new Error(`sendInterest failed for ${input.email}: ${error?.message ?? 'no row returned'}`);
  }
  return {
    ok: data.ok, reason: data.reason,
    usedMonth: data.used_month, usedDay: data.used_day,
    interestId: data.interest_id,
  };
}

export interface RevealResult {
  ok:          boolean;
  reason:      RevealReason;
  phone:       string | null;
  creditsLeft: number;
}

/**
 * Spend one contact credit to reveal the advertiser's details.
 * Idempotent by design: a second call after a refresh returns the same number
 * without charging again (see ir_reveal_interest_contact).
 */
export async function revealContact(
  db: Db, email: string, interestId: string, phone: string,
): Promise<RevealResult> {
  const { data, error } = await db
    .rpc('ir_reveal_interest_contact', { p_email: email, p_interest_id: interestId, p_phone: phone })
    .single<{ ok: boolean; reason: RevealReason; phone: string | null; credits_left: number }>();

  if (error || !data) {
    throw new Error(`revealContact failed for ${email}: ${error?.message ?? 'no row returned'}`);
  }
  return { ok: data.ok, reason: data.reason, phone: data.phone, creditsLeft: data.credits_left };
}

/** Current rolling counts for one sender — for the "12 of 40 used" display. */
export async function interestUsage(db: Db, userId: string): Promise<{ usedMonth: number; usedDay: number }> {
  const { data } = await db
    .rpc('ir_interest_usage', { p_user_id: userId })
    .single<{ used_month: number; used_day: number }>();
  return { usedMonth: data?.used_month ?? 0, usedDay: data?.used_day ?? 0 };
}

export interface MyInterest {
  id:             string;
  profile_id:     number | null;
  profile_num:    number | null;
  profile_title:  string | null;
  profile_gender: string | null;
  chip:           string | null;
  status:         InterestStatus;
  revealed_at:    string | null;
  revealed_phone: string | null;
  created_at:     string;
}

/** Everything this user has sent — powers both the card state and /account. */
export async function myInterests(db: Db, email: string): Promise<MyInterest[]> {
  const { data } = await db
    .from('ir_interests')
    .select('id, profile_id, profile_num, profile_title, profile_gender, chip, status, revealed_at, revealed_phone, created_at')
    .eq('from_email', email)
    .order('created_at', { ascending: false })
    .limit(500);
  return (data ?? []) as MyInterest[];
}

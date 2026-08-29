/**
 * Credits / usage system — better-auth edition.
 *
 * Restores the model removed in commit 775b179, re-keyed to better-auth users
 * and accessed SERVER-SIDE ONLY via the service-role client (better-auth users
 * have no Supabase JWT, so the old auth.uid() RLS path can't be used). Every
 * caller must first resolve the user from a better-auth session.
 *
 *   contact → a balance on ir_user_profiles (matched by email), in two parts:
 *             contact_credits (the monthly cycle balance, RESET each cycle) and
 *             bonus_credits (purchased top-ups, persistent). Cycle first.
 *   audio   → rolling 1h window in ir_user_usage (30/hr)
 *   view    → unlimited (kept for parity; never blocks)
 *
 * Subscription resets live in the DB, not here: ir_sync_profile() ensures the
 * row, expires a finished term, and applies any due monthly refill in one
 * atomic call. See supabase/migrations/005_subscription_plans.sql.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { FREE_CREDITS, entitlementsFor } from '@/lib/plans';

/**
 * Audio is metered per DAY and the allowance comes from the user's plan —
 * free accounts get a tight, actually-felt limit; members are unlimited.
 *
 * It used to be a flat 30/hour for everyone, which meant "Unlimited audio
 * biodata" was sold on /pricing and never enforced anywhere. Limits now resolve
 * through entitlementsFor() so the advertised number and the enforced number
 * cannot drift apart again.
 */
export const USAGE_LIMITS = {
  contact: { free: FREE_CREDITS, label: 'profile contacts', kind: 'balance'   as const },
  audio:   { free: -1, label: 'audio plays',   kind: 'rolling'   as const, windowMs: 86_400_000 },
  view:    { free: -1, label: 'profile views', kind: 'unlimited' as const, windowMs: 3_600_000 },
} as const;

export type UsageFeature = keyof typeof USAGE_LIMITS;

/** Daily audio allowance for a plan. -1 = unlimited. */
export function audioLimitFor(plan: string | null | undefined): number {
  return entitlementsFor(plan).audioPerDay;
}

export interface ProfileState {
  id:               string;          // ir_user_profiles.id (uuid) — used as the Supabase JWT `sub`
  email:            string;
  full_name:        string | null;
  credits:          number;          // contact_credits — the cycle balance
  bonus_credits:    number;          // purchased top-ups; survive resets and expiry
  total_credits:    number;          // credits + bonus_credits — what the user can actually spend
  plan:             string;
  plan_expires_at:  string | null;
  plan_started_at:  string | null;
  monthly_credits:  number;          // per-cycle allowance (0 when not subscribed)
  credits_reset_at: string | null;   // when the cycle balance next refills
  is_banned:        boolean;
  /** Profile creation. The grandfather fallback for pre-term purchasers — see phone-gate.ts. */
  created_at:       string | null;
}

export interface UsageSummary extends ProfileState {
  audio: { remaining: number; limit: number };
  view:  { remaining: number; limit: number };  // remaining = Infinity when unlimited
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export function serviceClient(): Db {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * Guarantee an ir_user_profiles row for this email, apply any due subscription
 * reset/expiry, and return the resulting state. Matched by email (the bridge
 * between betterauth.user and ir_user_profiles).
 *
 * All of it happens inside ir_sync_profile() so the row is created, expired and
 * refilled atomically — and so a failure is an actual error rather than a silent
 * fallback. The previous version inserted without an `id` (a NOT NULL column
 * with no default at the time), discarded the error, and returned a synthetic
 * unsaved profile — which made consume() update zero rows while still reporting
 * success, i.e. unlimited free unlocks. Migration 005 fixes the schema; throwing
 * here makes sure a regression can never be silent again.
 */
export async function ensureProfile(db: Db, email: string, fullName: string | null): Promise<ProfileState> {
  const { data, error } = await db
    .rpc('ir_sync_profile', { p_email: email, p_full_name: fullName })
    .single();

  if (error || !data) {
    throw new Error(`ensureProfile failed for ${email}: ${error?.message ?? 'no row returned'}`);
  }
  return toProfile(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toProfile(row: any): ProfileState {
  const credits = row.contact_credits ?? 0;
  const bonus   = row.bonus_credits   ?? 0;
  return {
    id:               row.id,
    email:            row.email,
    full_name:        row.full_name ?? null,
    credits,
    bonus_credits:    bonus,
    total_credits:    credits + bonus,
    plan:             row.plan ?? 'none',
    plan_expires_at:  row.plan_expires_at  ?? null,
    plan_started_at:  row.plan_started_at  ?? null,
    monthly_credits:  row.monthly_credits  ?? 0,
    credits_reset_at: row.credits_reset_at ?? null,
    is_banned:        row.is_banned ?? false,
    created_at:       row.created_at ?? null,
  };
}

/** Count rolling-window usage rows within the feature's window. */
async function rollingUsed(db: Db, userId: string, feature: 'audio' | 'view'): Promise<number> {
  const cutoff = new Date(Date.now() - USAGE_LIMITS[feature].windowMs).toISOString();
  const { count } = await db
    .from('ir_user_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('feature', feature)
    .gte('used_at', cutoff);
  return count ?? 0;
}

/**
 * Full snapshot for the account page. ensureProfile() applies any due monthly
 * refill first, so simply loading /account is enough to see a reset land.
 */
export async function getUsageSummary(db: Db, userId: string, email: string, fullName: string | null): Promise<UsageSummary> {
  const profile   = await ensureProfile(db, email, fullName);
  const audioCap  = audioLimitFor(profile.plan);
  // Unlimited plans never need the count — skip the query entirely.
  const audioUsed = audioCap < 0 ? 0 : await rollingUsed(db, userId, 'audio');
  return {
    ...profile,
    audio: {
      remaining: audioCap < 0 ? Infinity : Math.max(0, audioCap - audioUsed),
      limit:     audioCap,
    },
    view: { remaining: Infinity, limit: -1 },
  };
}

export interface ConsumeResult { allowed: boolean; remaining: number; feature: UsageFeature; }

/**
 * Attempt to consume one unit of a feature. Returns whether it was allowed and
 * the remaining count afterwards. Atomic-enough for our scale (single-decrement
 * with a guard); not a hot path.
 */
export async function consume(db: Db, userId: string, email: string, feature: UsageFeature): Promise<ConsumeResult> {
  if (feature === 'view') {
    // Unlimited — log for analytics, never block.
    await db.from('ir_user_usage').insert({ user_id: userId, feature: 'view' });
    return { allowed: true, remaining: Infinity, feature };
  }

  if (feature === 'audio') {
    // Allowance is plan-derived: members are unlimited, free accounts are not.
    const profile = await ensureProfile(db, email, null);
    const cap     = audioLimitFor(profile.plan);

    if (cap < 0) {
      await db.from('ir_user_usage').insert({ user_id: userId, feature: 'audio' });
      return { allowed: true, remaining: Infinity, feature };
    }

    const used      = await rollingUsed(db, userId, 'audio');
    const remaining = cap - used;
    if (remaining <= 0) return { allowed: false, remaining: 0, feature };
    await db.from('ir_user_usage').insert({ user_id: userId, feature: 'audio' });
    return { allowed: true, remaining: remaining - 1, feature };
  }

  // contact: sync first (a due refill must land before we judge the balance),
  // then spend atomically — cycle credits before purchased top-ups.
  await ensureProfile(db, email, null);

  const { data, error } = await db
    .rpc('ir_spend_contact_credit', { p_email: email })
    .single<{ allowed: boolean; cycle_left: number; bonus_left: number }>();

  if (error || !data) {
    throw new Error(`consume(contact) failed for ${email}: ${error?.message ?? 'no row returned'}`);
  }
  return {
    allowed:   data.allowed,
    remaining: data.cycle_left + data.bonus_left,
    feature,
  };
}

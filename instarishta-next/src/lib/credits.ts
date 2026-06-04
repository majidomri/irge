/**
 * Credits / usage system — better-auth edition.
 *
 * Restores the model removed in commit 775b179, re-keyed to better-auth users
 * and accessed SERVER-SIDE ONLY via the service-role client (better-auth users
 * have no Supabase JWT, so the old auth.uid() RLS path can't be used). Every
 * caller must first resolve the user from a better-auth session.
 *
 *   contact → a balance on ir_user_profiles.contact_credits (matched by email)
 *   audio   → rolling 1h window in ir_user_usage (30/hr)
 *   view    → unlimited (kept for parity; never blocks)
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const USAGE_LIMITS = {
  contact: { free: 20, label: 'profile contacts', kind: 'balance'  as const },
  audio:   { free: 30, label: 'audio plays',      kind: 'rolling'  as const, windowMs: 3_600_000 },
  view:    { free: -1, label: 'profile views',    kind: 'unlimited' as const, windowMs: 3_600_000 },
} as const;

export type UsageFeature = keyof typeof USAGE_LIMITS;

export interface ProfileState {
  id:              string;          // ir_user_profiles.id (uuid) — used as the Supabase JWT `sub`
  email:           string;
  full_name:       string | null;
  credits:         number;          // contact_credits
  plan:            string;
  plan_expires_at: string | null;
  is_banned:       boolean;
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
 * Guarantee an ir_user_profiles row for this email and return its state.
 * Matched by email (the bridge between betterauth.user and ir_user_profiles).
 * New rows get the 20 welcome credits; existing balances are preserved.
 */
export async function ensureProfile(db: Db, email: string, fullName: string | null): Promise<ProfileState> {
  const cols = 'id, email, full_name, contact_credits, plan, plan_expires_at, is_banned';
  const { data: existing } = await db
    .from('ir_user_profiles')
    .select(cols)
    .eq('email', email)
    .maybeSingle();

  if (existing) {
    // Backfill full_name if we now have one and the row didn't.
    if (fullName && !existing.full_name) {
      await db.from('ir_user_profiles').update({ full_name: fullName }).eq('email', email);
      existing.full_name = fullName;
    }
    return toProfile(existing);
  }

  const insertRow = {
    email,
    full_name: fullName,
    contact_credits: USAGE_LIMITS.contact.free,
    plan: 'none',
  };
  const { data: created } = await db
    .from('ir_user_profiles')
    .insert(insertRow)
    .select(cols)
    .single();

  return toProfile(created ?? { id: '', email, full_name: fullName, contact_credits: USAGE_LIMITS.contact.free, plan: 'none', plan_expires_at: null, is_banned: false });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toProfile(row: any): ProfileState {
  return {
    id:              row.id,
    email:           row.email,
    full_name:       row.full_name ?? null,
    credits:         row.contact_credits ?? 0,
    plan:            row.plan ?? 'none',
    plan_expires_at: row.plan_expires_at ?? null,
    is_banned:       row.is_banned ?? false,
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

/** Full snapshot for the account page. */
export async function getUsageSummary(db: Db, userId: string, email: string, fullName: string | null): Promise<UsageSummary> {
  const profile = await ensureProfile(db, email, fullName);
  const audioUsed = await rollingUsed(db, userId, 'audio');
  return {
    ...profile,
    audio: { remaining: Math.max(0, USAGE_LIMITS.audio.free - audioUsed), limit: USAGE_LIMITS.audio.free },
    view:  { remaining: Infinity, limit: -1 },
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
    const used = await rollingUsed(db, userId, 'audio');
    const remaining = USAGE_LIMITS.audio.free - used;
    if (remaining <= 0) return { allowed: false, remaining: 0, feature };
    await db.from('ir_user_usage').insert({ user_id: userId, feature: 'audio' });
    return { allowed: true, remaining: remaining - 1, feature };
  }

  // contact: decrement the balance with a >0 guard.
  const profile = await ensureProfile(db, email, null);
  if (profile.credits <= 0) return { allowed: false, remaining: 0, feature };
  const next = profile.credits - 1;
  await db.from('ir_user_profiles').update({ contact_credits: next }).eq('email', email);
  return { allowed: true, remaining: next, feature };
}

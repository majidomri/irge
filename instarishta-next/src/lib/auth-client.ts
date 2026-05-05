import { createBrowserClient } from '@supabase/ssr';

const SUPABASE_URL  = 'https://cxgxyqxeakjrghfzkuko.supabase.co';
const SUPABASE_ANON = 'sb_publishable_C2qwOBB0NvHL0KRGwpXBQg_UGZFoCis';

// Browser-side Supabase client with full auth support (PKCE flow, cookie storage)
export const createAuthClient = () =>
  createBrowserClient(SUPABASE_URL, SUPABASE_ANON);

// Singleton for client components
let _client: ReturnType<typeof createAuthClient> | null = null;
export const getAuthClient = () => {
  if (!_client) _client = createAuthClient();
  return _client;
};

// ── Limits ────────────────────────────────────────────────────────────────────
export const USAGE_LIMITS = {
  contact: { anon: 3,  free: 20, label: 'profile contacts',  windowMs: 3_600_000 },
  audio:   { anon: 5,  free: 30, label: 'audio plays',       windowMs: 3_600_000 },
  view:    { anon: 10, free: -1, label: 'profile views',     windowMs: 3_600_000 }, // -1 = unlimited
} as const;

export type UsageFeature = keyof typeof USAGE_LIMITS;

// ── Anonymous (localStorage) usage ───────────────────────────────────────────
const LS_KEY = (f: UsageFeature) => `ir_anon_${f}`;

export function anonGetUsage(feature: UsageFeature): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LS_KEY(feature));
    const arr: unknown = raw ? JSON.parse(raw) : [];
    const cutoff = Date.now() - USAGE_LIMITS[feature].windowMs;
    return Array.isArray(arr) ? (arr as number[]).filter(t => t > cutoff) : [];
  } catch { return []; }
}

export function anonRecordUsage(feature: UsageFeature) {
  const arr = anonGetUsage(feature);
  arr.push(Date.now());
  try { localStorage.setItem(LS_KEY(feature), JSON.stringify(arr)); } catch {}
}

export function anonRemaining(feature: UsageFeature): number {
  const limit = USAGE_LIMITS[feature].anon;
  if (limit < 0) return Infinity;
  return Math.max(0, limit - anonGetUsage(feature).length);
}

// ── Authenticated user DB usage ───────────────────────────────────────────────
export async function dbRecordUsage(feature: UsageFeature, userId: string) {
  const client = getAuthClient();
  await client.from('ir_user_usage').insert({ user_id: userId, feature });
}

export async function dbGetRemaining(feature: UsageFeature, userId: string): Promise<number> {
  const client = getAuthClient();
  const limit = USAGE_LIMITS[feature].free;
  if (limit < 0) return Infinity;
  const cutoff = new Date(Date.now() - USAGE_LIMITS[feature].windowMs).toISOString();
  const { count } = await client
    .from('ir_user_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('feature', feature)
    .gte('used_at', cutoff);
  return Math.max(0, limit - (count ?? 0));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function resetLabel(feature: UsageFeature): string {
  const arr = anonGetUsage(feature);
  if (!arr.length) return '';
  const resetMs = Math.min(...arr) + USAGE_LIMITS[feature].windowMs - Date.now();
  if (resetMs <= 0) return '';
  const m = Math.ceil(resetMs / 60_000);
  return m >= 60 ? `${Math.ceil(m / 60)}h` : `${m}m`;
}

/**
 * Browser-side Supabase client — data access only, no auth.
 *
 * Replaces the previous getAuthClient() singleton from lib/auth-client.ts.
 * Used by client components that need to query/mutate public-readable tables
 * (profiles, channels, posts, stories, featured, share-events) without
 * any user session.
 *
 * Pinned to globalThis so it survives Next.js Fast Refresh — without this,
 * HMR creates multiple GoTrueClient instances in dev and Supabase logs a
 * warning about it.
 */
import { createBrowserClient } from '@supabase/ssr';

const SUPABASE_URL  = 'https://cxgxyqxeakjrghfzkuko.supabase.co';
const SUPABASE_ANON = 'sb_publishable_C2qwOBB0NvHL0KRGwpXBQg_UGZFoCis';

type Client = ReturnType<typeof createBrowserClient>;
const GLOBAL_KEY = '__ir_db_client__';
type GlobalWithClient = typeof globalThis & { [GLOBAL_KEY]?: Client };

export const getDb = (): Client => {
  const g = globalThis as GlobalWithClient;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = createBrowserClient(SUPABASE_URL, SUPABASE_ANON);
  return g[GLOBAL_KEY]!;
};

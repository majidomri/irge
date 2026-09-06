/**
 * Slug → entity resolution for /p/[slug] and /s/[slug].
 *
 * Every share URL starts with the same lookup: which entity does this nano id
 * point at? That question was being asked up to four times per request —
 * generateMetadata asked, the page asked again, and then ProfileView or
 * PostView asked a third time with a narrower filter — each one a separate
 * round trip to Supabase, on the critical path before anything could render.
 *
 * React's cache() dedupes within a single request, so the lookup happens once
 * however many callers want the answer.
 */
import { cache } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * One client per server instance rather than one per call. createClient does
 * real work — it builds the auth, realtime and postgrest sub-clients — and
 * none of that needs redoing for every lookup.
 */
export function serverDb(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return client;
}

export type ResolvedSlug = {
  entity_id: string;
  entity_type: string;
  views: number | null;
  shares: number | null;
};

/** The entity behind a nano id, or null if there isn't one. */
export const resolveSlug = cache(async (slug: string): Promise<ResolvedSlug | null> => {
  const { data } = await serverDb()
    .from('ir_nano_ids')
    .select('entity_id, entity_type, views, shares')
    .eq('slug', slug)
    .maybeSingle();

  return (data as ResolvedSlug | null) ?? null;
});

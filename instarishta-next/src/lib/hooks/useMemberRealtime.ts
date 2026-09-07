'use client';
/**
 * Live updates for a member's own data, over the session-fabric bridge.
 *
 * Same mechanism as useRealtimeProfile — mint a Supabase JWT for the
 * better-auth user, open a client as that user, subscribe — but across the
 * several tables /account/stats reads instead of one row.
 *
 * The subscription carries a signal, not data: every handler calls the same
 * `onChange`, and the page refetches /api/account/stats. That is deliberate.
 * Realtime hands you one changed row, and this page shows derived totals,
 * per-source splits and a 30-day series; patching those from a single row
 * would drift from what a reload shows, which is the worst kind of wrong.
 *
 * Refetches are coalesced, because a burst of impressions on a claimed listing
 * is one interesting event to a reader and a load test to the server.
 *
 * Every table here is RLS-scoped to the member (migration 031) and Realtime
 * refuses to deliver a row the subscriber could not select, so the filters
 * below are an optimisation — the security is in the policy, not in them.
 *
 * Degrades to nothing when the bridge is off (no SUPABASE_JWT_SECRET → the
 * token endpoint answers 204): `live` stays false and the caller keeps its
 * focus+interval polling.
 */
import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import { useSession } from '@/lib/auth-client';

const SUPABASE_URL = 'https://cxgxyqxeakjrghfzkuko.supabase.co';
const SUPABASE_ANON = 'sb_publishable_C2qwOBB0NvHL0KRGwpXBQg_UGZFoCis';
const REFRESH_MS = 50 * 60 * 1000;
/** Long enough to swallow a scroll-burst, short enough to feel immediate. */
const COALESCE_MS = 1200;

interface TokenResp { token: string; profileId: string; email: string }

async function fetchToken(): Promise<TokenResp | null> {
  try {
    const r = await fetch('/api/auth/supabase-token');
    if (r.status !== 200) return null;   // 204 = bridge off, 401 = signed out
    return (await r.json()) as TokenResp;
  } catch { return null; }
}

export function useMemberRealtime(onChange: () => void): { live: boolean } {
  const { data: session } = useSession();
  const user = session?.user;
  const [live, setLive] = useState(false);

  const cbRef = useRef(onChange);
  useEffect(() => { cbRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let client: SupabaseClient | null = null;
    let token: string | null = null;
    let refresh: ReturnType<typeof setInterval> | null = null;
    let coalesce: ReturnType<typeof setTimeout> | null = null;

    const ping = () => {
      if (coalesce) return;
      coalesce = setTimeout(() => { coalesce = null; cbRef.current(); }, COALESCE_MS);
    };

    void (async () => {
      const data = await fetchToken();
      if (!data?.token || cancelled) return;
      token = data.token;

      // Imported only here: the SDK is 222 KB, and a signed-in member who
      // never opens this page should not pay for it.
      const { createClient } = await import('@supabase/supabase-js');
      if (cancelled) return;

      client = createClient(SUPABASE_URL, SUPABASE_ANON, {
        accessToken: async () => token ?? '',
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const uid = data.profileId;
      const channel = client.channel(`member:${uid}`);
      const watch = (table: string, filter?: string) => {
        channel.on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, ping);
      };

      watch('ir_interests', `from_email=eq.${data.email}`);
      watch('ir_comments', `user_id=eq.${uid}`);
      watch('ir_user_usage', `user_id=eq.${uid}`);
      watch('ir_notifications', `user_id=eq.${uid}`);
      watch('ir_story_views', `viewer_id=eq.${uid}`);
      watch('ir_profile_claims', `user_id=eq.${uid}`);
      watch('ir_user_profiles', `id=eq.${uid}`);
      // No filter: which listings are the member's is decided by the RLS
      // policy over ir_profile_claims, not by anything expressible here.
      watch('ir_profile_events');

      channel.subscribe();
      setLive(true);

      // Unmount can land after the cancelled check above but before this line,
      // by which time the cleanup has already run and removed nothing.
      if (cancelled) { client.removeAllChannels(); return; }

      refresh = setInterval(async () => {
        const next = await fetchToken();
        if (next?.token && client) { token = next.token; client.realtime.setAuth(next.token); }
      }, REFRESH_MS);
    })();

    return () => {
      cancelled = true;
      if (refresh) clearInterval(refresh);
      if (coalesce) clearTimeout(coalesce);
      if (client) client.removeAllChannels();
    };
  }, [user]);

  return { live };
}

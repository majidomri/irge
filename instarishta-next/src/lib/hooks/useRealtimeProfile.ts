'use client';
/**
 * True real-time profile (credits/plan) via the session-fabric JWT bridge.
 *
 * Fetches a Supabase token for the better-auth user (/api/auth/supabase-token),
 * opens a Supabase client authed as that user, and subscribes to UPDATEs on
 * their own ir_user_profiles row (RLS `auth.uid() = id` already permits this).
 * `onChange` fires sub-second whenever credits/plan change — from the user's own
 * spend on another device, or an admin edit.
 *
 * Degrades gracefully: if the bridge is off (endpoint 204 — no SUPABASE_JWT_SECRET)
 * `enabled` stays false and callers keep their polling fallback.
 */
import { useEffect, useRef, useState } from 'react';
// Type-only. The SDK itself is imported below, inside the effect: it is 222 KB
// of realtime and auth code, and it was landing in the first load of every
// route that renders this hook — including /profiles, where most visitors
// are signed out and never reach the code that needs it.
import type { SupabaseClient } from '@supabase/supabase-js';
import { useSession } from '@/lib/auth-client';

const SUPABASE_URL  = 'https://cxgxyqxeakjrghfzkuko.supabase.co';
const SUPABASE_ANON = 'sb_publishable_C2qwOBB0NvHL0KRGwpXBQg_UGZFoCis';
const REFRESH_MS    = 50 * 60 * 1000; // re-mint before the 1h token expires

interface TokenResp { token: string; profileId: string; email: string; }

async function fetchToken(): Promise<TokenResp | null> {
  try {
    const r = await fetch('/api/auth/supabase-token');
    if (r.status !== 200) return null;        // 204 = bridge off, 401 = anon
    return (await r.json()) as TokenResp;
  } catch { return null; }
}

export function useRealtimeProfile(onChange: (credits: number, plan: string) => void): { enabled: boolean } {
  const { data: session } = useSession();
  const user = session?.user;
  const [enabled, setEnabled] = useState(false);

  const cbRef = useRef(onChange);
  useEffect(() => { cbRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let client: SupabaseClient | null = null;
    let token: string | null = null;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;

    (async () => {
      const data = await fetchToken();
      if (!data?.token || cancelled) return;
      token = data.token;

      // Fetched only now: past the signed-in check and past a successful
      // token mint, so the download happens for people who will use it.
      const { createClient } = await import('@supabase/supabase-js');
      if (cancelled) return;

      client = createClient(SUPABASE_URL, SUPABASE_ANON, {
        accessToken: async () => token ?? '',          // third-party auth: our minted JWT
        auth: { persistSession: false, autoRefreshToken: false },
      });
      setEnabled(true);

      client
        .channel(`profile:${data.profileId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'ir_user_profiles', filter: `id=eq.${data.profileId}` },
          (payload) => {
            const row = payload.new as { contact_credits?: number; plan?: string };
            cbRef.current(row.contact_credits ?? 0, row.plan ?? 'none');
          },
        )
        .subscribe();

      // Re-mint the token before it expires and hand it to Realtime.
      refreshTimer = setInterval(async () => {
        const next = await fetchToken();
        if (next?.token && client) { token = next.token; client.realtime.setAuth(next.token); }
      }, REFRESH_MS);
    })();

    return () => {
      cancelled = true;
      if (refreshTimer) clearInterval(refreshTimer);
      if (client) client.removeAllChannels();
    };
  }, [user]);

  return { enabled };
}

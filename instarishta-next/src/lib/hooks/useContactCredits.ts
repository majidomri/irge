'use client';
/**
 * Contact-credit gating hook (better-auth edition).
 *
 * Replaces the removed `useUsageLimit('contact')`. Reads the signed-in user's
 * remaining contact credits from /api/account/profile and spends one via
 * /api/account/consume. Anonymous users have `isAnon = true` and no credits —
 * the caller routes them to the sign-in modal.
 */
import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/lib/auth-client';
import { useLiveRefresh } from '@/lib/hooks/useLiveRefresh';
import { useRealtimeProfile } from '@/lib/hooks/useRealtimeProfile';

export interface ContactCredits {
  isAnon:    boolean;
  email:     string;
  remaining: number;
  canUse:    boolean;     // signed in AND has credits
  loading:   boolean;
  consume:   () => Promise<boolean>;
  refresh:   () => void;
}

export function useContactCredits(): ContactCredits {
  const { data: session, isPending } = useSession();
  const user = session?.user;
  const isAnon = !isPending && !user;

  const [remaining, setRemaining] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // Only ever setState inside the async callback — never synchronously in the
  // effect path (keeps it clear of react-hooks/set-state-in-effect).
  const refresh = useCallback(() => {
    if (!user) return;
    fetch('/api/account/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { setRemaining(typeof d?.credits === 'number' ? d.credits : 0); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [user]);

  useEffect(() => { if (user) refresh(); }, [user, refresh]);

  // True real-time via the session-fabric bridge (sub-second). When the bridge
  // is off this is a no-op and the poll below covers it.
  const { enabled: live } = useRealtimeProfile(useCallback((credits: number) => setRemaining(credits), []));

  // Fallback near-real-time: focus + interval poll. Skipped once realtime is live.
  useLiveRefresh(refresh, !!user && !live);

  const consume = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/account/consume', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ feature: 'contact' }),
      });
      if (res.ok) {
        const d = await res.json().catch(() => null);
        if (d && typeof d.remaining === 'number') setRemaining(d.remaining);
        return true;
      }
      if (res.status === 402) setRemaining(0);   // out of credits
      return false;                              // 401 (anon) / 402 / error
    } catch {
      return false;
    }
  }, []);

  return {
    isAnon,
    email:     user?.email ?? '',
    remaining,
    canUse:    !isAnon && remaining > 0,
    loading:   isPending || (!!user && !loaded),
    consume,
    refresh,
  };
}

'use client';
/**
 * Contact-credit gating hook (better-auth edition).
 *
 * Replaces the removed `useUsageLimit('contact')`. Reads the signed-in user's
 * remaining contact credits from /api/account/profile and spends one via
 * /api/account/consume. Anonymous users have `isAnon = true` and no credits —
 * the caller routes them to the sign-in modal.
 *
 * `consume()` returns a REASON rather than a boolean: a paid member with an
 * unverified mobile is refused for a completely different cause than one who has
 * run out, and sending them to the upgrade modal would be a dead end — they
 * already paid. See src/lib/phone-gate.ts.
 */
import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/lib/auth-client';
import { useLiveRefresh } from '@/lib/hooks/useLiveRefresh';
import { useRealtimeProfile } from '@/lib/hooks/useRealtimeProfile';

/**
 * Why a spend was refused.
 *   'ok'             — charged, go ahead
 *   'phone_required' — paid member, mobile not verified: show the linking form
 *   'no_credits'     — out of balance: show the upgrade path
 *   'error'          — network / unexpected; treated like no_credits by callers
 */
export type ConsumeOutcome = 'ok' | 'phone_required' | 'no_credits' | 'error';

export interface ContactCredits {
  isAnon:    boolean;
  email:     string;
  remaining: number;
  canUse:    boolean;     // signed in AND has credits
  loading:   boolean;
  /** True when a paid member still has to verify their mobile. */
  phoneLocked: boolean;
  consume:   () => Promise<ConsumeOutcome>;
  refresh:   () => void;
}

export function useContactCredits(): ContactCredits {
  const { data: session, isPending } = useSession();
  const user = session?.user;
  const isAnon = !isPending && !user;

  const [remaining, setRemaining] = useState(0);
  const [loaded, setLoaded] = useState(false);
  // Mirrors profile.phone.locked, so the deck can show the gate BEFORE the user
  // spends a tap finding out. Also set defensively from a 403 on consume().
  const [phoneLocked, setPhoneLocked] = useState(false);

  // Only ever setState inside the async callback — never synchronously in the
  // effect path (keeps it clear of react-hooks/set-state-in-effect).
  const refresh = useCallback(() => {
    if (!user) return;
    fetch('/api/account/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        // `total_credits`, not `credits`. The latter is only the monthly cycle
        // balance; purchased top-ups live in `bonus_credits` and survive resets
        // and expiry. Reading the cycle alone showed 0 to a member holding 25
        // bought credits -- and because `canUse` gates on this number, it also
        // refused to let them spend what they had paid for. The spend path
        // already returns cycle + bonus (see the consume branch below), so only
        // the initial load was wrong.
        setRemaining(
          typeof d?.total_credits === 'number' ? d.total_credits
          : typeof d?.credits === 'number' ? d.credits
          : 0,
        );
        setPhoneLocked(d?.phone?.locked === true);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [user]);

  useEffect(() => { if (user) refresh(); }, [user, refresh]);

  // True real-time via the session-fabric bridge (sub-second). When the bridge
  // is off this is a no-op and the poll below covers it.
  const { enabled: live } = useRealtimeProfile(useCallback((credits: number) => setRemaining(credits), []));

  // Fallback near-real-time: focus + interval poll. Skipped once realtime is live.
  useLiveRefresh(refresh, !!user && !live);

  const consume = useCallback(async (): Promise<ConsumeOutcome> => {
    try {
      const res = await fetch('/api/account/consume', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ feature: 'contact' }),
      });
      if (res.ok) {
        const d = await res.json().catch(() => null);
        if (d && typeof d.remaining === 'number') setRemaining(d.remaining);
        setPhoneLocked(false);
        return 'ok';
      }
      if (res.status === 403) {
        const d = await res.json().catch(() => null);
        if (d?.code === 'phone_verification_required') {
          setPhoneLocked(true);
          return 'phone_required';
        }
        return 'error';                          // banned, or some other 403
      }
      if (res.status === 402) { setRemaining(0); return 'no_credits'; }
      return 'error';                            // 401 (anon) / unexpected
    } catch {
      return 'error';
    }
  }, []);

  return {
    isAnon,
    email:     user?.email ?? '',
    remaining,
    // Locked credits are not usable credits — say so, so the deck's contact
    // button reflects reality instead of promising a spend that will 403.
    canUse:    !isAnon && remaining > 0 && !phoneLocked,
    loading:   isPending || (!!user && !loaded),
    phoneLocked,
    consume,
    refresh,
  };
}

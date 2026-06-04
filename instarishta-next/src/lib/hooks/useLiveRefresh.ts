'use client';
/**
 * Near-real-time refresh helper.
 *
 * Calls `cb` whenever the tab regains focus / becomes visible, and on a steady
 * interval while the tab is visible. This is how credits stay current across
 * user ↔ DB ↔ admin without a Supabase JWT: any change made elsewhere (a spend
 * on another device, an admin top-up) is picked up within `intervalMs`, and
 * instantly when the user returns to the tab.
 *
 * (True push — sub-second — needs the better-auth→Supabase session bridge so
 * Realtime/RLS can authorize the user; see docs/AUTH_SETUP.md.)
 */
import { useEffect, useRef } from 'react';

export function useLiveRefresh(cb: () => void, enabled = true, intervalMs = 15_000) {
  const cbRef = useRef(cb);
  // Keep the latest callback without re-subscribing listeners (assign in an
  // effect, not during render — refs must not be mutated while rendering).
  useEffect(() => { cbRef.current = cb; }, [cb]);

  useEffect(() => {
    if (!enabled) return;
    const fire = () => { if (!document.hidden) cbRef.current(); };
    const onVisible = () => { if (!document.hidden) cbRef.current(); };

    window.addEventListener('focus', fire);
    document.addEventListener('visibilitychange', onVisible);
    const id = window.setInterval(fire, intervalMs);

    return () => {
      window.removeEventListener('focus', fire);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(id);
    };
  }, [enabled, intervalMs]);
}

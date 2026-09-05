'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { authClient, useSession } from '@/lib/auth-client';

/**
 * Google One Tap, prompted once for signed-out visitors.
 *
 * This is a convenience, not a gate. Every existing way in still works
 * untouched -- "Continue with Google", the magic link, the phone flow -- and
 * One Tap is only the shortest of them for someone already signed in to
 * Google. If it never shows, nothing is lost.
 *
 * Which is why the interesting part is where it stays quiet:
 *
 *   - while the session is still loading, so it cannot flash at someone who
 *     turns out to be signed in already;
 *   - on the admin panel, on a payment page and inside the auth pages
 *     themselves, where an unexpected Google card over the screen is at best
 *     a distraction and at worst covers a form mid-payment;
 *   - after Google's own exponential cool-down, which it applies when the
 *     prompt has been dismissed with the X. That is Google's rule, not ours,
 *     and the right response is to accept it silently: the sign-in buttons
 *     are still there.
 *
 * It also fires once per mount rather than per render -- `prompt()` on every
 * navigation would be the same nag, and a ref is enough because a remount only
 * happens on a full reload.
 */

/** Routes that must never be interrupted by a floating Google card. */
const QUIET_PREFIXES = ['/nizam', '/pay', '/login', '/signin', '/sign-in', '/register'];

export function GoogleOneTap() {
  const { data: session, isPending } = useSession();
  const pathname = usePathname();
  const prompted = useRef(false);

  useEffect(() => {
    if (prompted.current) return;
    if (isPending) return;                       // don't prompt before we know
    if (session?.user) return;                   // already signed in
    if (QUIET_PREFIXES.some((p) => pathname?.startsWith(p))) return;

    // The plugin is only registered when NEXT_PUBLIC_GOOGLE_CLIENT_ID is set;
    // without it there is no `oneTap` action to call.
    const client = authClient as typeof authClient & {
      oneTap?: (opts?: Record<string, unknown>) => Promise<void>;
    };
    if (typeof client.oneTap !== 'function') return;

    prompted.current = true;

    /**
     * Off the critical path, always.
     *
     * Lighthouse on the live feed: Google's gsi/client is 74 KB of script,
     * and the page's LCP is already 85% "load delay" -- the browser waiting
     * to discover the first image. A sign-in convenience has no business
     * competing for the main thread while that is happening, so it waits for
     * the browser to be idle, with a timeout so it still runs on a page that
     * never goes idle.
     */
    const start = () => void client.oneTap!({
      // Where to land after a successful sign-in: back where they were, so
      // signing in never costs someone their place in the feed.
      callbackURL: pathname || '/',
      /**
       * Called when Google declines to show the prompt -- no Google session,
       * a browser that blocks it, or the cool-down after a dismissal. There
       * is deliberately no fallback UI raised here: the page already carries
       * a sign-in button, and popping something else up the moment Google
       * declines is precisely the nagging One Tap is supposed to replace.
       */
      onPromptNotification: () => {},
      fetchOptions: {
        onError: () => {
          // A failed exchange must not break the page a visitor was reading.
          // They can still use any of the normal sign-in paths.
        },
      },
    }).catch(() => {});

    /**
     * `requestIdleCallback` is typed as always present but is not (Safari
     * only shipped it in 2023), so the capability is tested with `typeof`
     * rather than truthiness -- which TS flags as always-true against its own
     * lib types.
     */
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (h: number) => void;
    };
    const idle = typeof w.requestIdleCallback === 'function';
    const id = idle
      ? w.requestIdleCallback!(start, { timeout: 4000 })
      : window.setTimeout(start, 2500);

    return () => {
      // Cancel with the same mechanism that scheduled it, or navigating away
      // mid-wait leaves a prompt queued for a page that is gone.
      if (idle) w.cancelIdleCallback?.(id);
      else window.clearTimeout(id);
    };
  }, [session, isPending, pathname]);

  return null;
}

'use client';
/**
 * "Verify your mobile" prompt for a signed-in member who has not linked one yet.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * One person should be one account. Before this, a member who signed up with
 * Google and later tapped "Continue with mobile number" while signed out got a
 * SECOND, empty account — and because that account then owned their number, the
 * correct linking path was closed to them forever (see absorbEmptyPhoneAccount
 * in src/lib/auth.ts, which now cleans that up after the fact).
 *
 * Absorbing repairs the damage; this prevents it. Asking for the number right
 * after a Google signup means the two identities are joined before the member
 * ever meets the phone sign-in button, so the collision never happens.
 *
 * ── Why a banner and not a blocking step ─────────────────────────────────────
 * Verification is only *required* to spend purchased credits (src/lib/phone-gate.ts).
 * Making it a wall at signup would cost us browsers who have not decided to buy
 * yet — the exact people the free tier is meant to attract. So it nags, visibly
 * and repeatedly, but it never blocks.
 *
 * Dismissal is per-tab-session on purpose: sessionStorage, not localStorage. We
 * genuinely want this done, so "not now" means "not now", not "never".
 */
import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import { phoneSignInEnabled } from '@/lib/firebase-phone';

const DISMISS_KEY = 'ir_phone_nudge_dismissed';

/**
 * sessionStorage read as an external store rather than mirrored into state.
 *
 * It IS external state — it outlives this component and can change from
 * anywhere — so useSyncExternalStore is the honest model. It also sidesteps the
 * two traps of the useEffect+useState version: no synchronous setState in an
 * effect (which this project lints against), and no hydration mismatch, because
 * the server snapshot is declared separately.
 */
const listeners = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function getSnapshot(): boolean {
  // Blocked storage (private mode) reads as "not dismissed" — showing the
  // prompt is the safe failure for something we want people to act on.
  try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}

/** Hidden during SSR: the server cannot know, and a banner that pops in is
 *  better than one that flashes out. React re-renders after hydration. */
function getServerSnapshot(): boolean {
  return true;
}

function dismissNudge(): void {
  try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* nothing to do */ }
  listeners.forEach((fn) => fn());
}

export default function PhoneNudge() {
  const { data: session, isPending } = useSession();
  const path = usePathname();
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Nothing to offer without the Firebase env, and nothing to ask of someone
  // who is signed out or already verified.
  if (!phoneSignInEnabled) return null;
  if (isPending || !session?.user) return null;
  if (session.user.phoneNumberVerified) return null;
  if (dismissed) return null;
  // /account already shows the real form — a banner pointing at the thing
  // directly below it would be noise.
  if (path.startsWith('/account')) return null;

  return (
    <div
      className="w-full px-4 py-2.5 flex items-center justify-center gap-3 text-[13px]"
      style={{ background: 'rgba(0,168,107,0.12)', borderBottom: '1px solid rgba(0,168,107,0.22)' }}
      role="status"
    >
      <span aria-hidden="true">📱</span>
      <span style={{ color: 'rgba(255,255,255,0.8)' }} className="text-center">
        Add your mobile number so families can reach you about your rishta.
      </span>
      <Link
        href="/account"
        className="font-bold rounded-full px-3.5 py-1.5 no-underline shrink-0"
        style={{ background: '#00A86B', color: '#fff' }}
      >
        Verify
      </Link>
      <button
        onClick={dismissNudge}
        aria-label="Dismiss"
        className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
        style={{ color: 'rgba(255,255,255,0.45)' }}
      >
        ×
      </button>
    </div>
  );
}

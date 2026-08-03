'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import ShinyText from '@/components/ui/ShinyText';
import { useSession } from '@/lib/auth-client';
import AuthModal from '@/components/AuthModal';

const DESKTOP_LINKS = [
  { label: 'How It Works', href: '/#how-it-works' },
  { label: 'Browse',       href: '/profiles' },
  { label: 'Channels',     href: '/channels' },
  { label: 'Pricing',      href: '/pricing' },
  { label: 'Post Profile', href: '/biodata' },
];

/**
 * A same-origin path, or nothing.
 *
 * `next` arrives from the query string and both branches of the effect below
 * navigate to it, so an unvalidated value is an open redirect:
 * `/?signin=1&next=https://evil.tld` would carry the user off-site from a link
 * that looks like ours. `//host` is rejected too — it is an absolute URL
 * wearing the costume of a path.
 */
function safeNext(raw: string | null): string | undefined {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return undefined;
  return raw;
}

/**
 * Follow a given `next` at most once in a short window.
 *
 * Sending a signed-in user onward is only safe if the destination agrees that
 * they are signed in. If it doesn't — a protected page whose own session check
 * fails where ours succeeds — then honouring `next` unconditionally ping-pongs
 * the browser between the two forever. Remembering the last target and refusing
 * to chase it twice turns that infinite loop into a single failed attempt.
 *
 * A real second visit within ten seconds is indistinguishable from a loop, and
 * staying put is by far the better of the two ways to be wrong.
 */
const NEXT_GUARD_KEY = 'ir:last-auth-next';
const NEXT_GUARD_MS  = 10_000;

function shouldFollow(next: string): boolean {
  try {
    const raw = sessionStorage.getItem(NEXT_GUARD_KEY);
    if (raw) {
      const sep = raw.lastIndexOf('|');
      const target = raw.slice(0, sep);
      const at     = Number(raw.slice(sep + 1));
      if (target === next && Date.now() - at < NEXT_GUARD_MS) return false;
    }
    sessionStorage.setItem(NEXT_GUARD_KEY, `${next}|${Date.now()}`);
  } catch {
    // Storage blocked (private mode, embedded webview). Proceed unguarded —
    // the worst case is the pre-existing behaviour.
  }
  return true;
}

const LogoNode = () => (
  <Link href="/" className="text-[1.25rem] font-extrabold tracking-[-0.02em] no-underline select-none" style={{ lineHeight: 1 }}>
    <ShinyText text="InstaRishta" color="#00A86B" shineColor="#ffffff" speed={3} spread={100} />
  </Link>
);

export default function Navbar() {
  const path = usePathname();
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const user = session?.user;
  const [showAuth, setShowAuth] = useState(false);
  const [authNext, setAuthNext] = useState<string | undefined>(undefined);
  const [authError, setAuthError] = useState<string | undefined>(undefined);
  const isHome = path === '/';
  const [scrolled, setScrolled] = useState(!isHome);

  // Handle an auth-gated redirect landing here with ?signin=1 (set by
  // middleware, /nizam, /pay/[id], and the OAuth errorCallbackURL). `next`
  // carries where to return to; `error` is an OAuth-failure code to surface.
  // Read from window (not useSearchParams) so static pages don't bail out of
  // prerendering. Params are stripped afterwards so a refresh is clean.
  //
  // Two things this has to get right, both of which it previously got wrong:
  //
  //   • Waiting for the session. Bailing on `user` alone meant deciding during
  //     the pending window, when `user` is still undefined for someone who IS
  //     signed in — so they got the sign-in modal flashed at them, and the
  //     effect's early return on the next render left it open.
  //
  //   • Honouring `next` when already signed in. The old `if (user) return`
  //     dropped it silently: a signed-in member bounced here from a protected
  //     page was stranded on whatever page this navbar happened to be on, with
  //     ?signin=1 still in the URL. Nothing was broken enough to show an error,
  //     it just quietly failed to take them where they were going.
  useEffect(() => {
    if (isPending) return;                    // session unknown — deciding now guesses wrong
    const params = new URLSearchParams(window.location.search);
    if (params.get('signin') !== '1') return;

    const next = safeNext(params.get('next'));

    // Already signed in: whatever redirected us here has nothing left to ask.
    // Send them on to `next` rather than leaving them where they landed.
    if (user) {
      // shouldFollow refuses a target we just came from, so a destination that
      // disagrees about our session costs one hop instead of looping forever.
      router.replace(next && shouldFollow(next) ? next : path);
      return;
    }

    // Deferred via queueMicrotask to avoid a synchronous setState cascade.
    queueMicrotask(() => {
      setAuthNext(next);
      setAuthError(params.get('error') ?? undefined);
      setShowAuth(true);
    });
    params.delete('signin');
    params.delete('next');
    params.delete('error');
    params.delete('error_description');
    const qs = params.toString();
    router.replace(path + (qs ? `?${qs}` : ''));
  }, [user, isPending, path, router]);

  useEffect(() => {
    if (!isHome) { setScrolled(true); return; }
    const handler = () => setScrolled(window.scrollY > 40);
    handler();
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, [isHome]);

  const navBg     = scrolled ? 'rgba(10,18,15,0.97)' : 'rgba(10,18,15,0.72)';
  const navBorder = scrolled ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.05)';

  return (
    <>
      {/* Desktop: full-width edge-to-edge nav */}
      <header
        className="hidden md:block sticky top-0 z-50"
        style={{
          background: navBg,
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderBottom: `1px solid ${navBorder}`,
          transition: 'background 0.3s ease, border-color 0.3s ease',
        }}
      >
        <div className="max-w-[1280px] mx-auto px-8 flex items-center h-[76px] gap-6">

          {/* Logo — fixed width left column */}
          <div className="flex-shrink-0 w-[176px]">
            <LogoNode />
          </div>

          {/* Centered nav links */}
          <ul className="flex flex-1 items-center justify-center gap-7 list-none m-0 p-0">
            {DESKTOP_LINKS.map(link => (
              <li key={link.href} className="group relative">
                <Link
                  href={link.href}
                  className="text-white/60 hover:text-white text-[0.875rem] font-medium no-underline transition-colors duration-200"
                >
                  {link.label}
                </Link>
                <span className="absolute -bottom-[3px] left-0 h-px w-0 rounded-full bg-white/55 transition-[width] duration-[220ms] ease-out group-hover:w-full" />
              </li>
            ))}
          </ul>

          {/* Right CTAs — fixed width right column */}
          <div className="flex items-center gap-3 w-[176px] justify-end flex-shrink-0">
            <div className="w-px h-[18px] bg-white/15 flex-shrink-0" />
            {user ? (
              <Link
                href="/account"
                className="text-white/65 text-[0.875rem] font-medium hover:text-white transition-colors duration-200 px-2 no-underline"
                title={user.email ?? 'Account'}
              >
                Account
              </Link>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                className="text-white/65 text-[0.875rem] font-medium hover:text-white transition-colors duration-200 px-2 bg-transparent border-0 cursor-pointer"
              >
                Sign in
              </button>
            )}
            <Link
              href="/profiles"
              className="inline-flex items-center gap-1.5 text-[0.875rem] font-semibold no-underline px-5 py-[9px] rounded-full bg-white text-[#0d1a14] hover:bg-white/90 transition-all duration-200"
            >
              Browse
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

        </div>
      </header>

      {/* Mobile: minimal sticky top bar (MobileDock handles navigation) */}
      <nav
        className="md:hidden sticky top-0 z-50 border-b"
        style={{
          background: navBg,
          backdropFilter: scrolled ? 'blur(20px)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(20px)' : 'none',
          borderColor: navBorder,
          transition: 'background 0.3s ease, border-color 0.3s ease',
        }}
      >
        <div className="flex items-center justify-between px-5 h-14">
          <LogoNode />
          {user ? (
            <Link
              href="/account"
              aria-label="Account"
              className="w-8 h-8 flex items-center justify-center text-xs font-semibold rounded-full no-underline overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.10)', color: '#fff' }}
            >
              {user.image
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={user.image} alt="" className="w-full h-full object-cover" />
                : (user.name?.[0]?.toUpperCase() ?? user.email?.[0]?.toUpperCase() ?? '?')}
            </Link>
          ) : (
            <button
              onClick={() => setShowAuth(true)}
              className="text-xs font-semibold rounded-full px-3 py-1.5 border-0 cursor-pointer"
              style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}
            >
              Sign in
            </button>
          )}
        </div>
      </nav>

      {showAuth && (
        <AuthModal
          redirectTo={authNext}
          initialError={authError}
          onClose={() => setShowAuth(false)}
          onSuccess={() => setShowAuth(false)}
        />
      )}
    </>
  );
}

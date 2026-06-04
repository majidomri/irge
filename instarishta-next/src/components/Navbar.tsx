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

const LogoNode = () => (
  <Link href="/" className="text-[1.25rem] font-extrabold tracking-[-0.02em] no-underline select-none" style={{ lineHeight: 1 }}>
    <ShinyText text="InstaRishta" color="#00A86B" shineColor="#ffffff" speed={3} spread={100} />
  </Link>
);

export default function Navbar() {
  const path = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user;
  const [showAuth, setShowAuth] = useState(false);
  const [authNext, setAuthNext] = useState<string | undefined>(undefined);
  const [authError, setAuthError] = useState<string | undefined>(undefined);
  const isHome = path === '/';
  const [scrolled, setScrolled] = useState(!isHome);

  // Open the sign-in modal automatically when an auth-gated redirect lands here
  // with ?signin=1 (set by middleware, /nizam, and the OAuth errorCallbackURL).
  // `next` carries where to return after sign-in; `error` is an OAuth-failure
  // code to surface. Read from window (not useSearchParams) so static pages
  // don't bail out of prerendering. Strip the params afterwards so a refresh is
  // clean. Deferred via queueMicrotask to avoid a synchronous setState cascade.
  useEffect(() => {
    if (user) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('signin') !== '1') return;
    queueMicrotask(() => {
      setAuthNext(params.get('next') ?? undefined);
      setAuthError(params.get('error') ?? undefined);
      setShowAuth(true);
    });
    params.delete('signin');
    params.delete('next');
    params.delete('error');
    params.delete('error_description');
    const qs = params.toString();
    router.replace(path + (qs ? `?${qs}` : ''));
  }, [user, path, router]);

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

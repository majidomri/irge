'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import ShinyText from '@/components/ui/ShinyText';
import CardNav from '@/components/ui/CardNav';
import { useAuth } from '@/contexts/AuthContext';
import AuthModal from '@/components/AuthModal';

const NAV_ITEMS = [
  {
    label: 'Browse',
    bgColor: '#1a3028',
    textColor: '#fff',
    links: [
      { label: 'All Profiles',   href: '/profiles',           ariaLabel: 'All Profiles' },
      { label: 'Groom Profiles', href: '/profiles?gender=male',   ariaLabel: 'Groom Profiles' },
      { label: 'Bride Profiles', href: '/profiles?gender=female', ariaLabel: 'Bride Profiles' },
    ],
  },
  {
    label: 'Community',
    bgColor: '#243d35',
    textColor: '#fff',
    links: [
      { label: 'Channels',     href: '/channels', ariaLabel: 'Community Channels' },
      { label: 'Post Biodata', href: '/biodata',  ariaLabel: 'Post Biodata' },
    ],
  },
  {
    label: 'About',
    bgColor: '#1a3028',
    textColor: '#fff',
    links: [
      { label: 'Disclaimer', href: '/disclaimer', ariaLabel: 'Disclaimer' },
      { label: 'Terms',      href: '/toc',        ariaLabel: 'Terms of Use' },
    ],
  },
];

const LogoNode = () => (
  <Link href="/" className="text-[1.25rem] font-extrabold tracking-[-0.02em] no-underline select-none" style={{ lineHeight: 1 }}>
    <ShinyText text="InstaRishta" color="#00A86B" shineColor="#ffffff" speed={3} spread={100} />
  </Link>
);

export default function Navbar() {
  const path = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <>
      {/* Desktop: floating CardNav */}
      <div className="hidden md:block sticky top-0 z-50" style={{ height: 76 }}>
        <div className="relative w-full h-full">
          <CardNav
            logoNode={<LogoNode />}
            items={NAV_ITEMS}
            baseColor="rgba(20,50,40,0.97)"
            menuColor="rgba(255,255,255,0.85)"
            buttonBgColor="#00754A"
            buttonTextColor="#fff"
            ctaLabel={user ? (user.email?.split('@')[0] ?? 'Account') : 'Sign In'}
            ctaHref={user ? '/account' : undefined}
            onCtaClick={!user ? () => setShowAuthModal(true) : undefined}
          />
        </div>
      </div>

      {/* Mobile: minimal sticky top bar (Dock handles navigation) */}
      <nav
        className="md:hidden sticky top-0 z-50 border-b"
        style={{
          background: 'rgba(20,50,40,0.97)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderColor: 'rgba(255,255,255,0.10)',
        }}
      >
        <div className="flex items-center justify-between px-5 h-14">
          <LogoNode />
          {user ? (
            <button
              onClick={() => router.push('/account')}
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: '#00754A', color: '#fff' }}
            >
              {user.email?.[0]?.toUpperCase() ?? '?'}
            </button>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className="text-xs font-semibold rounded-full px-3 py-1.5"
              style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}
            >
              Sign In
            </button>
          )}
        </div>
      </nav>

      {showAuthModal && (
        <AuthModal feature="view" onClose={() => setShowAuthModal(false)} onSuccess={() => setShowAuthModal(false)} />
      )}
    </>
  );
}

'use client';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? '#00A86B' : 'none'} stroke={active ? '#00A86B' : 'rgba(255,255,255,0.55)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/>
      <path d="M9 21V12h6v9"/>
    </svg>
  );
}

function ProfilesIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#00A86B' : 'rgba(255,255,255,0.55)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  );
}

function ChannelsIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd"
        d="M12 4.5C7.85786 4.5 4.5 7.85786 4.5 12C4.5 14.3287 5.56045 16.4092 7.22758 17.786L7.5 18.0109V19.5H12C16.1421 19.5 19.5 16.1421 19.5 12C19.5 7.85786 16.1421 4.5 12 4.5ZM3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21H6V18.7083C4.15984 17.0613 3 14.6658 3 12Z"
        fill={active ? '#00A86B' : 'rgba(255,255,255,0.55)'}/>
    </svg>
  );
}

function ContactedIcon({ active }: { active: boolean }) {
  const c = active ? '#00A86B' : 'rgba(255,255,255,0.55)';
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.63 19.79 19.79 0 01.22 4.05 2 2 0 012.2 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 9.91a16 16 0 006.28 6.28l1.48-1.48a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
      {active && <path d="M16 2l2 2 4-4" strokeWidth="2"/>}
    </svg>
  );
}

function AccountIcon({ active, initial }: { active: boolean; initial?: string }) {
  if (initial) {
    return (
      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
        style={{ background: active ? '#00A86B' : 'rgba(255,255,255,0.15)', color: '#fff', border: active ? '2px solid #00A86B' : '2px solid rgba(255,255,255,0.3)' }}>
        {initial.toUpperCase()}
      </div>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#00A86B' : 'rgba(255,255,255,0.55)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  );
}

type TabItem = {
  key: string;
  icon: React.ReactNode;
  label: string;
  href: string;
  match: (p: string) => boolean;
};

export default function MobileDock() {
  const router = useRouter();
  const path   = usePathname();
  const { user } = useAuth();

  const accountTab: TabItem = user
    ? { key: 'account', icon: <AccountIcon active={path.startsWith('/account')} initial={user.email?.[0]} />, label: 'Account', href: '/account', match: p => p.startsWith('/account') }
    : { key: 'biodata', icon: <AccountIcon active={path.startsWith('/biodata')} />, label: 'Biodata', href: '/biodata', match: p => p.startsWith('/biodata') };

  const tabs: TabItem[] = [
    { key: 'home',      icon: <HomeIcon      active={path === '/'} />,                      label: 'Home',      href: '/',          match: p => p === '/' },
    { key: 'profiles',  icon: <ProfilesIcon  active={path.startsWith('/profiles')} />,      label: 'Profiles',  href: '/profiles',  match: p => p.startsWith('/profiles') },
    { key: 'channels',  icon: <ChannelsIcon  active={path.startsWith('/channels')} />,      label: 'Channels',  href: '/channels',  match: p => p.startsWith('/channels') },
    { key: 'contacted', icon: <ContactedIcon active={path.startsWith('/contacted')} />,     label: 'Contacted', href: '/contacted', match: p => p.startsWith('/contacted') },
    accountTab,
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
      style={{
        background: 'rgba(10, 20, 15, 0.97)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      } as React.CSSProperties}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="flex items-stretch">
        {tabs.map(tab => {
          const isActive = tab.match(path);
          return (
            <button
              key={tab.key}
              onClick={() => router.push(tab.href)}
              className="flex-1 flex flex-col items-center justify-center gap-[3px] py-2.5 border-0 bg-transparent cursor-pointer relative"
              aria-current={isActive ? 'page' : undefined}
              aria-label={tab.label}
            >
              {/* Active indicator dot */}
              {isActive && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-b-full"
                  style={{ background: '#00A86B' }}
                />
              )}
              {tab.icon}
              <span
                className="text-[10px] font-semibold leading-none tracking-wide"
                style={{ color: isActive ? '#00A86B' : 'rgba(255,255,255,0.45)' }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

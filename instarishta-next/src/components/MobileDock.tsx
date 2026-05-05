'use client';
import { useRouter, usePathname } from 'next/navigation';
import Dock from '@/components/ui/Dock';
import { useAuth } from '@/contexts/AuthContext';

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={active ? '#00A86B' : 'none'} stroke={active ? '#00A86B' : 'rgba(255,255,255,0.7)'} strokeWidth="2">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/>
      <path d="M9 21V12h6v9"/>
    </svg>
  );
}

function ProfilesIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? '#00A86B' : 'rgba(255,255,255,0.7)'} strokeWidth="2">
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  );
}

function ChannelsIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 4.5C7.85786 4.5 4.5 7.85786 4.5 12C4.5 14.3287 5.56045 16.4092 7.22758 17.786L7.5 18.0109V19.5H12C16.1421 19.5 19.5 16.1421 19.5 12C19.5 7.85786 16.1421 4.5 12 4.5ZM3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21H6V18.7083C4.15984 17.0613 3 14.6658 3 12Z" fill={active ? '#00A86B' : 'rgba(255,255,255,0.7)'}/>
    </svg>
  );
}

function BiodataIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? '#00A86B' : 'rgba(255,255,255,0.7)'} strokeWidth="2">
      <rect x="4" y="2" width="16" height="20" rx="2"/>
      <path d="M8 7h8M8 11h8M8 15h5"/>
    </svg>
  );
}

function AccountIcon({ active, initial }: { active: boolean; initial?: string }) {
  if (initial) {
    return (
      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
        style={{ background: active ? '#00A86B' : 'rgba(0,168,107,0.4)', color: '#fff' }}>
        {initial.toUpperCase()}
      </div>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? '#00A86B' : 'rgba(255,255,255,0.7)'} strokeWidth="2">
      <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  );
}

export default function MobileDock() {
  const router = useRouter();
  const path = usePathname();
  const { user } = useAuth();

  const lastItem = user
    ? { icon: <AccountIcon active={path.startsWith('/account')} initial={user.email?.[0]} />, label: 'Account', onClick: () => router.push('/account') }
    : { icon: <BiodataIcon active={path.startsWith('/biodata')} />, label: 'Biodata', onClick: () => router.push('/biodata') };

  const items = [
    {
      icon: <HomeIcon active={path === '/'} />,
      label: 'Home',
      onClick: () => router.push('/'),
    },
    {
      icon: <ProfilesIcon active={path.startsWith('/profiles')} />,
      label: 'Profiles',
      onClick: () => router.push('/profiles'),
    },
    {
      icon: <ChannelsIcon active={path.startsWith('/channels')} />,
      label: 'Channels',
      onClick: () => router.push('/channels'),
    },
    lastItem,
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden" style={{ height: 76 }}>
      <Dock
        items={items}
        panelHeight={60}
        baseItemSize={42}
        magnification={52}
      />
    </div>
  );
}

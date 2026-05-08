import { Suspense } from 'react';
import ProfilesClient from './ProfilesClient';
import type { Profile } from './ProfilesClient';

export const metadata = {
  title: 'Browse Profiles – InstaRishta Muslim Matrimony',
  description:
    'Browse 500+ verified Muslim rishta profiles. Filter by gender, education, marital status. Contact via WhatsApp.',
};

// ISR: revalidate cached Worker response every 30 min; on-demand via POST /api/revalidate
// Suspense boundary in ProfilesPage delivers the same streaming UX as PPR:
// skeleton renders instantly, ProfilesFeed resolves from ISR cache behind it.
export const revalidate = 1800;

const WORKER_URL = 'https://instarishta-profile-relay.instarishtalead.workers.dev/api/profiles';

async function fetchProfiles(): Promise<Profile[]> {
  try {
    const res = await fetch(WORKER_URL, { next: { revalidate: 1800 } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as Profile[]) : [];
  } catch {
    return [];
  }
}

// Dynamic leaf — fetches profiles and hands to client component
async function ProfilesFeed() {
  const initialProfiles = await fetchProfiles();
  return <ProfilesClient initialProfiles={initialProfiles} />;
}

// Skeleton rendered as the PPR static prerender while ProfilesFeed resolves
function ProfilesSkeleton() {
  return (
    <div style={{ background: '#FFFFFF', minHeight: '100vh' }}>
      {/* Hero shell — matches ProfilesClient hero exactly */}
      <div style={{ background: '#1E3932', color: '#fff' }} className="px-4 sm:px-6 pt-4 pb-4">
        <div className="max-w-7xl mx-auto">
          <p className="text-xs font-bold uppercase tracking-[0.08em] mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Browse</p>
          <div className="h-8 w-56 rounded-lg mb-4 animate-pulse" style={{ background: 'rgba(255,255,255,0.12)' }} />
          <div className="hidden md:flex gap-3 flex-wrap items-center mb-3">
            <div className="h-10 flex-1 min-w-55 rounded-full animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <div className="h-10 w-32 rounded-full animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <div className="h-10 w-32 rounded-full animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }} />
          </div>
          <div className="hidden md:flex gap-2 justify-center">
            {['All', 'Groom', 'Bride'].map(l => (
              <div key={l} className="rounded-full px-5 py-1.5 text-xs font-semibold border animate-pulse"
                style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.15)', color: 'transparent' }}>{l}</div>
            ))}
          </div>
        </div>
      </div>

      {/* Card grid skeleton */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-[20px] overflow-hidden animate-pulse"
              style={{ background: '#fff', border: '1.5px solid #F0ECE8', boxShadow: '0 4px 24px rgba(0,0,0,0.07)', height: 280 }}>
              <div className="flex items-center gap-3 px-4 pt-4 pb-3" style={{ borderBottom: '1px solid #F0ECE8' }}>
                <div className="w-11 h-11 rounded-full" style={{ background: '#F0ECE8' }} />
                <div className="flex-1"><div className="h-2.5 w-24 rounded mb-2" style={{ background: '#F0ECE8' }} /><div className="h-2 w-16 rounded" style={{ background: '#F0ECE8' }} /></div>
              </div>
              <div className="px-4 py-3.5 space-y-2">
                <div className="h-3 w-3/4 rounded" style={{ background: '#F0ECE8' }} />
                <div className="h-2.5 w-full rounded" style={{ background: '#F0ECE8' }} />
                <div className="h-2.5 w-5/6 rounded" style={{ background: '#F0ECE8' }} />
                <div className="h-2.5 w-4/6 rounded" style={{ background: '#F0ECE8' }} />
              </div>
            </div>
          ))}
        </div>
        {/* Mobile skeleton */}
        <div className="md:hidden space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-[20px] h-64 animate-pulse"
              style={{ background: '#F3F0EE', border: '1.5px solid #F0ECE8' }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ProfilesPage() {
  return (
    <Suspense fallback={<ProfilesSkeleton />}>
      <ProfilesFeed />
    </Suspense>
  );
}

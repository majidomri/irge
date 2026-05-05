'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useUsageLimit } from '@/hooks/useUsageLimit';
import GradientText from '@/components/ui/GradientText';
import { USAGE_LIMITS } from '@/lib/auth-client';

function UsageStat({ label, remaining, limit, icon }: {
  label: string; remaining: number; limit: number; icon: string;
}) {
  const pct = limit > 0 ? Math.round((remaining / limit) * 100) : 100;
  const low = pct < 30;
  return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="text-sm font-semibold text-white">{label}</span>
        </div>
        <span className="text-xs font-bold" style={{ color: low ? '#FF6B6B' : '#00A86B' }}>
          {remaining === 9999 ? '∞' : `${remaining}/${limit}`}
        </span>
      </div>
      {limit > 0 && remaining !== 9999 && (
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
          <div className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: low ? '#FF6B6B' : '#00A86B' }} />
        </div>
      )}
      <p className="text-[10px] mt-1.5" style={{ color: 'rgba(255,255,255,0.35)' }}>resets every hour</p>
    </div>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const contactUsage = useUsageLimit('contact');
  const audioUsage   = useUsageLimit('audio');
  const viewUsage    = useUsageLimit('view');

  useEffect(() => {
    if (!loading && !user) router.replace('/');
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a1a14' }}>
        <span className="w-8 h-8 rounded-full border-2 border-green-500 border-t-transparent animate-spin block" />
      </div>
    );
  }

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  return (
    <div className="min-h-screen px-5 py-8" style={{ background: '#0a1a14' }}>
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-extrabold">
            <GradientText colors={['#00C87A', '#ffffff', '#00A86B', '#ffffff']} animationSpeed={5}>
              My Account
            </GradientText>
          </h1>
          <button
            onClick={handleSignOut}
            className="text-xs font-semibold rounded-full px-4 py-2"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}
          >
            Sign out
          </button>
        </div>

        {/* User info */}
        <div className="flex items-center gap-4 mb-8 rounded-2xl p-4"
          style={{ background: 'rgba(0,168,107,0.1)', border: '1px solid rgba(0,168,107,0.2)' }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold shrink-0"
            style={{ background: '#00754A', color: '#fff' }}>
            {user.email?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div>
            <p className="text-sm font-bold text-white">{user.user_metadata?.full_name ?? user.email}</p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>{user.email}</p>
            <span className="inline-block mt-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
              style={{ background: 'rgba(0,168,107,0.2)', color: '#00C87A' }}>Free account</span>
          </div>
        </div>

        {/* Usage stats */}
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.08em] mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Hourly usage
          </p>
          <div className="flex flex-col gap-3">
            <UsageStat
              icon="💍" label="Profile contacts"
              remaining={contactUsage.remaining}
              limit={USAGE_LIMITS.contact.free}
            />
            <UsageStat
              icon="🎙️" label="Audio plays"
              remaining={audioUsage.remaining}
              limit={USAGE_LIMITS.audio.free}
            />
            <UsageStat
              icon="📋" label="Profile views"
              remaining={viewUsage.remaining}
              limit={-1}
            />
          </div>
        </div>

        {/* Reset note */}
        <p className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.25)' }}>
          Limits reset every hour · Free forever · No credit card
        </p>
      </div>
    </div>
  );
}

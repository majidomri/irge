'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession, signOut } from '@/lib/auth-client';
import { useLiveRefresh } from '@/lib/hooks/useLiveRefresh';
import { useRealtimeProfile } from '@/lib/hooks/useRealtimeProfile';
import GradientText from '@/components/ui/GradientText';

interface UsageSummary {
  email: string;
  full_name: string | null;
  credits: number;
  plan: string;
  plan_expires_at: string | null;
  is_banned: boolean;
  audio: { remaining: number; limit: number };
  view: { remaining: number | null; limit: number };
}

function UsageStat({ label, remaining, limit, icon }: {
  label: string; remaining: number | null; limit: number; icon: string;
}) {
  const unlimited = limit < 0 || remaining === null;
  const pct = !unlimited && limit > 0 ? Math.round(((remaining as number) / limit) * 100) : 100;
  const low = !unlimited && pct < 30;
  return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="text-sm font-semibold text-white">{label}</span>
        </div>
        <span className="text-xs font-bold" style={{ color: low ? '#FF6B6B' : '#00A86B' }}>
          {unlimited ? '∞' : `${remaining}/${limit}`}
        </span>
      </div>
      {!unlimited && limit > 0 && (
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
          <div className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: low ? '#FF6B6B' : '#00A86B' }} />
        </div>
      )}
    </div>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const user = session?.user;
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  // Bounce anonymous visitors to the sign-in modal, returning here after.
  useEffect(() => {
    if (!isPending && !user) router.replace('/?signin=1&next=%2Faccount');
  }, [isPending, user, router]);

  // Load profile + usage. Re-run on focus / every 15s so credits + plan reflect
  // DB and admin changes in near-real-time (see useLiveRefresh).
  const loadSummary = useCallback(() => {
    fetch('/api/account/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setSummary(d); setLoadingData(false); })
      .catch(() => setLoadingData(false));
  }, []);

  useEffect(() => { if (user) loadSummary(); }, [user, loadSummary]);

  // True real-time credits/plan via the session-fabric bridge (sub-second).
  const { enabled: live } = useRealtimeProfile(
    useCallback((credits: number, plan: string) =>
      setSummary((s) => (s ? { ...s, credits, plan } : s)), []),
  );
  // Poll fallback only when realtime isn't available.
  useLiveRefresh(loadSummary, !!user && !live);

  if (isPending || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a1a14' }}>
        <span className="w-8 h-8 rounded-full border-2 border-green-500 border-t-transparent animate-spin block" />
      </div>
    );
  }

  const planLabel = summary && summary.plan !== 'none' ? summary.plan : 'Free account';
  const displayName = summary?.full_name ?? user.name ?? user.email;

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
            onClick={async () => { await signOut(); router.push('/'); }}
            className="text-xs font-semibold rounded-full px-4 py-2"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}
          >
            Sign out
          </button>
        </div>

        {/* User info */}
        <div className="flex items-center gap-4 mb-8 rounded-2xl p-4"
          style={{ background: 'rgba(0,168,107,0.1)', border: '1px solid rgba(0,168,107,0.2)' }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold shrink-0 overflow-hidden"
            style={{ background: '#00754A', color: '#fff' }}>
            {user.image
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={user.image} alt="" className="w-full h-full object-cover" />
              : (displayName?.[0]?.toUpperCase() ?? '?')}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">{displayName}</p>
            <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.45)' }}>{user.email}</p>
            <span className="inline-block mt-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
              style={{ background: 'rgba(0,168,107,0.2)', color: '#00C87A' }}>{planLabel}</span>
          </div>
        </div>

        {/* Credits + usage */}
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.08em] mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Credits &amp; usage
          </p>
          {loadingData ? (
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[68px] rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
              ))}
            </div>
          ) : summary ? (
            <div className="flex flex-col gap-3">
              <UsageStat icon="💍" label="Profile contacts" remaining={summary.credits} limit={20} />
              <UsageStat icon="🎙️" label="Audio plays (per hour)" remaining={summary.audio.remaining} limit={summary.audio.limit} />
              <UsageStat icon="📋" label="Profile views" remaining={summary.view.remaining} limit={summary.view.limit} />
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Could not load usage.</p>
          )}
        </div>

        {/* Plans */}
        <Link
          href="/pricing"
          className="w-full flex items-center justify-between rounded-2xl px-4 py-3.5 mb-4 transition-all hover:bg-white/[0.08] no-underline"
          style={{ background: 'rgba(0,168,107,0.1)', border: '1px solid rgba(0,168,107,0.2)' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">✨</span>
            <div className="text-left">
              <p className="text-sm font-semibold text-white">View Plans &amp; Pricing</p>
              <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Upgrade for more contacts &amp; features</p>
            </div>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>›</span>
        </Link>

        {/* Security */}
        <p className="text-xs font-bold uppercase tracking-[0.08em] mb-3 mt-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Security
        </p>
        <button
          onClick={() => router.push('/account/devices')}
          className="w-full flex items-center justify-between rounded-2xl px-4 py-3.5 mb-6 transition-all hover:bg-white/[0.08]"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">🖥️</span>
            <div className="text-left">
              <p className="text-sm font-semibold text-white">Where you&apos;re signed in</p>
              <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Manage devices and active sessions</p>
            </div>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>›</span>
        </button>

        <p className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.25)' }}>
          Audio limits reset every hour · Family-first matchmaking
        </p>
      </div>
    </div>
  );
}

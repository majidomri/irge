'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import GradientText from '@/components/ui/GradientText';

interface SessionRow {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  current: boolean;
}

// Naive UA → label parser — good enough for "iPhone · Safari" hints without ua-parser-js.
function deviceLabel(ua: string | null): { device: string; browser: string; emoji: string } {
  if (!ua) return { device: 'Unknown device', browser: '', emoji: '🖥️' };
  let device = 'Computer', emoji = '💻';
  if (/iPad/i.test(ua))                     { device = 'iPad';            emoji = '📱'; }
  else if (/iPhone/i.test(ua))              { device = 'iPhone';          emoji = '📱'; }
  else if (/Android.*Tablet/i.test(ua))     { device = 'Android tablet';  emoji = '📱'; }
  else if (/Android/i.test(ua))             { device = 'Android';         emoji = '📱'; }
  else if (/Macintosh|Mac OS X/i.test(ua))  { device = 'Mac';             emoji = '💻'; }
  else if (/Windows/i.test(ua))             { device = 'Windows';         emoji = '🖥️'; }
  else if (/Linux/i.test(ua))               { device = 'Linux';           emoji = '🖥️'; }

  let browser = 'Browser';
  if (/Edg/i.test(ua))          browser = 'Edge';
  else if (/Chrome/i.test(ua))  browser = 'Chrome';
  else if (/Firefox/i.test(ua)) browser = 'Firefox';
  else if (/Safari/i.test(ua))  browser = 'Safari';
  return { device, browser, emoji };
}

export default function DevicesPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const user = session?.user;
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isPending && !user) router.replace('/?signin=1&next=%2Faccount%2Fdevices');
  }, [isPending, user, router]);

  const load = useCallback(() => {
    fetch('/api/account/sessions')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSessions(d?.sessions ?? []))
      .catch(() => setSessions([]));
  }, []);

  useEffect(() => { if (user) load(); }, [user, load]);

  const signOutOthers = async () => {
    setBusy(true);
    try {
      await fetch('/api/account/sessions', { method: 'DELETE' });
      load();
    } finally {
      setBusy(false);
    }
  };

  if (isPending || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a1a14' }}>
        <span className="w-8 h-8 rounded-full border-2 border-green-500 border-t-transparent animate-spin block" />
      </div>
    );
  }

  const others = (sessions ?? []).filter((s) => !s.current).length;

  return (
    <div className="min-h-screen px-5 py-8" style={{ background: '#0a1a14' }}>
      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => router.push('/account')} aria-label="Back"
            className="w-9 h-9 rounded-full flex items-center justify-center text-lg"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>‹</button>
          <h1 className="text-2xl font-extrabold">
            <GradientText colors={['#00C87A', '#ffffff', '#00A86B', '#ffffff']} animationSpeed={5}>
              Where you&apos;re signed in
            </GradientText>
          </h1>
        </div>

        {sessions === null ? (
          <div className="flex flex-col gap-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-[72px] rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>No active sessions found.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {sessions.map((s) => {
              const { device, browser, emoji } = deviceLabel(s.userAgent);
              return (
                <div key={s.id} className="rounded-2xl px-4 py-3.5 flex items-center gap-3"
                  style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${s.current ? 'rgba(0,168,107,0.35)' : 'rgba(255,255,255,0.08)'}` }}>
                  <span className="text-xl">{emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">
                      {device}{browser ? ` · ${browser}` : ''}
                      {s.current && <span className="ml-2 text-[10px] font-bold uppercase" style={{ color: '#00C87A' }}>This device</span>}
                    </p>
                    <p className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {s.ipAddress ?? 'Unknown IP'} · since {new Date(s.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {others > 0 && (
          <button
            onClick={signOutOthers}
            disabled={busy}
            className="w-full mt-6 rounded-full py-3 text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: 'rgba(255,107,107,0.15)', color: '#FF6B6B', border: '1px solid rgba(255,107,107,0.3)' }}
          >
            {busy ? 'Signing out…' : `Sign out ${others} other device${others > 1 ? 's' : ''}`}
          </button>
        )}
      </div>
    </div>
  );
}

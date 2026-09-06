'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession, signOut } from '@/lib/auth-client';
import { useLiveRefresh } from '@/lib/hooks/useLiveRefresh';
import { useRealtimeProfile } from '@/lib/hooks/useRealtimeProfile';
import GradientText from '@/components/ui/GradientText';
import { planLabel, TOPUP, TOPUP_BONUS_CREDITS } from '@/lib/plans';
import MyInterests from './_components/MyInterests';
import ProfessionVerification from './_components/ProfessionVerification';
import PhoneLink from '@/components/PhoneLink';

interface UsageSummary {
  email: string;
  full_name: string | null;
  credits: number;              // cycle balance
  bonus_credits: number;        // persistent top-ups
  total_credits: number;
  plan: string;
  plan_expires_at: string | null;
  monthly_credits: number;      // 0 when not subscribed
  credits_reset_at: string | null;
  is_banned: boolean;
  audio: { remaining: number | null; limit: number };
  view: { remaining: number | null; limit: number };
  /** Absent until /api/account/profile has answered. See src/lib/phone-gate.ts. */
  phone?: {
    number:   string | null;
    verified: boolean;
    required: boolean;   // this account has paid, so a number is expected
    locked:   boolean;   // required && !verified — credits cannot be spent yet
  };
  /** Whether a credit refill is on offer right now. See src/lib/topup.ts. */
  topup?: {
    eligible: boolean;
    reason:   string | null;
    message:  string;
    price:    number;
    credits:  number;
  };
}

function UsageStat({ label, remaining, limit, icon, note }: {
  label: string; remaining: number | null; limit: number; icon: string; note?: string;
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
          {unlimited ? '∞' : limit === 0 ? String(remaining) : `${remaining}/${limit}`}
        </span>
      </div>
      {!unlimited && limit > 0 && (
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
          <div className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(100, pct)}%`, background: low ? '#FF6B6B' : '#00A86B' }} />
        </div>
      )}
      {note && (
        <p className="text-[11px] mt-2" style={{ color: 'rgba(255,255,255,0.42)' }}>{note}</p>
      )}
    </div>
  );
}

/**
 * The credit refill, offered only where it is actually valid: an active
 * subscriber whose balance has reached zero (src/lib/topup.ts). It is not a
 * third plan and is not sold on /pricing — this is its point of sale.
 */
function RefillCard({ price, credits }: { price: number; credits: number }) {
  const router = useRouter();
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState('');

  async function startRefill() {
    setBusy(true); setError('');
    try {
      const res  = await fetch('/api/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: TOPUP.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.order) {
        // A 409 here means the balance moved under us (a refill landed, or the
        // term lapsed) — the message from the server is the accurate one.
        setError(json.error ?? 'Could not start checkout. Please try again.');
        setBusy(false);
        return;
      }
      router.push(`/pay/${json.order.id}`);
    } catch {
      setError('Network error. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 rounded-2xl p-4"
      style={{ background: 'rgba(0,168,107,0.10)', border: '1px solid rgba(0,168,107,0.22)' }}>
      <p className="text-sm font-semibold text-white">You are out of contact credits</p>
      <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
        Refill {credits} credits ({credits - TOPUP_BONUS_CREDITS} + {TOPUP_BONUS_CREDITS} bonus) without
        restarting your term. They never reset and never expire.
      </p>
      {error && <p className="text-xs mt-2" style={{ color: '#FF8080' }}>{error}</p>}
      <button
        onClick={startRefill} disabled={busy}
        className="mt-3 w-full rounded-full py-3 font-bold text-sm transition-all hover:opacity-90 disabled:opacity-40"
        style={{ background: 'linear-gradient(135deg, #00A86B, #006241)', color: '#fff' }}
      >
        {busy ? 'Opening checkout…' : `Refill ${credits} credits · ₹${price.toLocaleString('en-IN')}`}
      </button>
    </div>
  );
}

/** "refills in 9 days" / "refills tomorrow" / "refills today". */
function refillNote(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return 'Refills shortly';
  if (days === 1) return 'Refills tomorrow';
  return `Refills in ${days} days`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
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

  const planName    = planLabel(summary?.plan);
  const subscribed  = !!summary && summary.monthly_credits > 0;
  // || not ?? — better-auth defaults name to '' (not null), which ??
  // would let win over the next fallback, producing a blank display name.
  const displayName = summary?.full_name || user.name || user.email;

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
              ? <img src={user.image} alt="" className="w-full h-full object-cover" decoding="async" />
              : (displayName?.[0]?.toUpperCase() ?? '?')}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">{displayName}</p>
            <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.45)' }}>{user.email}</p>
            <span className="inline-block mt-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
              style={{ background: 'rgba(0,168,107,0.2)', color: '#00C87A' }}>{planName}</span>
            {subscribed && summary?.plan_expires_at && (
              <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Expires {fmtDate(summary.plan_expires_at)}
              </p>
            )}
          </div>
        </div>

        {/* Mobile number. Above the credits when they are locked behind it,
            because the locked balance is the thing the member came to look at. */}
        {summary?.phone && (
          <PhoneLink
            current={summary.phone.number}
            verified={summary.phone.verified}
            locked={summary.phone.locked}
            onLinked={loadSummary}
          />
        )}

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
              <UsageStat
                icon={summary.phone?.locked ? '🔒' : '💍'}
                label={subscribed ? 'Contacts this month' : 'Profile contacts'}
                remaining={summary.credits}
                // Free accounts have no contact allowance since migration 023,
                // so there is no denominator to show. A legacy balance from
                // before that change still renders as a plain number.
                limit={subscribed ? summary.monthly_credits : 0}
                note={
                  summary.phone?.locked
                    ? 'Locked — verify your mobile above to spend these'
                    : subscribed
                      ? refillNote(summary.credits_reset_at)
                      : summary.credits > 0
                        ? 'Welcome credits — these do not refill'
                        : 'Contact details unlock with Rishta 6 or Rishta 12'
                }
              />
              {summary.bonus_credits > 0 && (
                <UsageStat
                  icon="✨" label="Top-up credits" remaining={summary.bonus_credits} limit={-1}
                  note="Permanent — never reset, never expire"
                />
              )}
              <UsageStat
                icon="🎙️"
                label={summary.audio.limit < 0 ? 'Audio biodata' : 'Audio plays (per day)'}
                remaining={summary.audio.remaining}
                limit={summary.audio.limit}
                note={summary.audio.limit < 0 ? 'Unlimited on your plan' : 'Resets daily · unlimited on any plan'}
              />
              <UsageStat icon="📋" label="Profile views" remaining={summary.view.remaining} limit={summary.view.limit} />
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Could not load usage.</p>
          )}
        </div>

        {summary?.topup?.eligible && <RefillCard price={summary.topup.price} credits={summary.topup.credits} />}

        {/* Profession verification — the badge, or the way to earn it */}
        <div className="mb-4">
          <ProfessionVerification />
        </div>

        {/* Interests / leads */}
        <MyInterests enabled={!!user} onCreditsChanged={loadSummary} />

        {/* Plans */}
        <Link
          href="/pricing"
          className="w-full flex items-center justify-between rounded-2xl px-4 py-3.5 mb-4 transition-all hover:bg-white/[0.08] no-underline"
          style={{ background: 'rgba(0,168,107,0.1)', border: '1px solid rgba(0,168,107,0.2)' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">✨</span>
            <div className="text-left">
              <p className="text-sm font-semibold text-white">
                {subscribed ? 'Renew or upgrade' : 'View Plans & Pricing'}
              </p>
              <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {subscribed ? 'Extend your term or top up credits' : 'Get fresh contact credits every month'}
              </p>
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
          {subscribed
            ? 'Contact credits refill monthly · unused credits do not carry over'
            : 'Audio limits reset every hour · Family-first matchmaking'}
        </p>
      </div>
    </div>
  );
}

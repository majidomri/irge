'use client';
/**
 * Checkout UI. Three screens in one component, chosen by order.status:
 *
 *   created              → pay: amount, QR, app buttons, then "I've paid"
 *   pending_verification → live: credits are already active, verification pending
 *   confirmed/rejected/expired → settled: the final word
 *
 * The one thing this page must get across, and repeats in three places, is that
 * the paise are not decoration. A member who rounds ₹2,199.37 down to ₹2,199 has
 * made a payment nobody can trace back to them — the suffix is the only thing
 * tying their money to their account (see 008 §0). Everything else here is
 * ordinary checkout furniture.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  UPI_APPS, UPI_VPA, describeOrder, formatAmount, paiseSuffix,
  secondsLeft, formatCountdown, upiLink, isSettled, type Order,
} from '@/lib/orders';

const INK    = '#141413';
const SLATE  = '#696969';
const WHISPER = '#A0A0A0';
const BRAND  = '#006241';
const DARK   = '#1E3932';
const MINT   = '#EEF6F0';
const LINE   = '#F0ECE8';
const FIELD  = '#F3F0EE';
const ALERT  = '#CF4500';

interface GrantedProfile {
  plan: string;
  contact_credits: number;
  bonus_credits: number | null;
}

export default function PayClient({ order: initial, qrSvg }: { order: Order; qrSvg: string }) {
  const router = useRouter();
  const [order,   setOrder]   = useState(initial);
  const [left,    setLeft]    = useState(() => secondsLeft(initial.expires_at));
  const [step,    setStep]    = useState<'pay' | 'confirm'>('pay');
  const [utr,     setUtr]     = useState('');
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [granted, setGranted] = useState<GrantedProfile | null>(null);
  const [copied,  setCopied]  = useState<'amount' | 'vpa' | null>(null);

  const info    = describeOrder(order.plan_id);
  const amount  = formatAmount(order.amount_paise);
  const suffix  = paiseSuffix(order.amount_paise);
  const rupees  = amount.slice(0, amount.lastIndexOf('.'));
  const live    = order.status === 'pending_verification';
  const settled = isSettled(order.status);
  const expired = order.status === 'created' && left === 0;

  // ── Countdown ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (order.status !== 'created') return;
    const t = setInterval(() => setLeft(secondsLeft(order.expires_at)), 1000);
    return () => clearInterval(t);
  }, [order.status, order.expires_at]);

  // ── Poll for the admin's decision ──────────────────────────────────────────
  // Only while pending: a settled order never changes again, and an unpaid one
  // has nothing to wait for. Backs off to 20s because the human on the other end
  // is reading a bank ledger, not clicking within milliseconds.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/orders/${order.id}`, { cache: 'no-store' });
        if (!res.ok) return;
        const { order: fresh } = await res.json() as { order: Order };
        if (fresh && fresh.status !== order.status) setOrder(fresh);
      } catch { /* transient — the next tick retries */ }
    }, 20_000);
    return () => clearInterval(t);
  }, [live, order.id, order.status]);

  const copy = useCallback((what: 'amount' | 'vpa', value: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    }).catch(() => { /* clipboard blocked — the value is on screen anyway */ });
  }, []);

  async function claim() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/claim`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ utr: utr.trim() || undefined }),
      });
      const json = await res.json() as { order?: Order; profile?: GrantedProfile; error?: string };
      if (!res.ok) {
        if (json.order) setOrder(json.order);
        setError(json.error ?? 'Could not confirm this payment.');
        return;
      }
      if (json.order)   setOrder(json.order);
      if (json.profile) setGranted(json.profile);
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  // ══ Settled ════════════════════════════════════════════════════════════════
  if (settled) {
    const ok = order.status === 'confirmed';
    return (
      <Shell>
        <div className="px-6 py-12 text-center">
          <div className="text-5xl mb-4">{ok ? '✅' : order.status === 'rejected' ? '⚠️' : '⌛'}</div>
          <h1 className="text-xl font-extrabold mb-2" style={{ color: INK }}>
            {ok ? 'Payment confirmed'
               : order.status === 'rejected' ? 'Payment could not be verified'
               : 'This order expired'}
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: SLATE }}>
            {ok
              ? `Your ${info.label} is active. Thank you.`
              : order.status === 'rejected'
                ? `We could not find ₹${amount} in our account, so the credits were removed. If you did pay, reply to your payment confirmation with the UTR and we will sort it out.`
                : 'Nobody paid this order in time and the amount was released. Start a new one whenever you are ready.'}
          </p>
          <button onClick={() => router.push('/profiles')}
            className="mt-8 rounded-full px-8 py-3 text-sm font-bold"
            style={{ background: BRAND, color: '#fff' }}>
            Back to profiles
          </button>
        </div>
      </Shell>
    );
  }

  // ══ Claimed — credits are live ═════════════════════════════════════════════
  if (live) {
    return (
      <Shell>
        <div className="px-6 py-10 text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-xl font-extrabold mb-1" style={{ color: INK }}>Your credits are live</h1>
          <p className="text-sm mb-6" style={{ color: SLATE }}>
            {info.label} is active on your account right now — no waiting.
          </p>

          {granted && (
            <div className="rounded-2xl px-5 py-4 mb-6 text-left" style={{ background: MINT, border: `1.5px solid ${BRAND}22` }}>
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em] mb-2" style={{ color: BRAND }}>
                Now on your account
              </p>
              <p className="text-sm font-bold" style={{ color: INK }}>
                {granted.contact_credits} contact credits
                {(granted.bonus_credits ?? 0) > 0 && ` + ${granted.bonus_credits} top-up`}
              </p>
            </div>
          )}

          <div className="rounded-2xl px-5 py-4 mb-6 text-left" style={{ background: '#FAFAF9', border: `1.5px solid ${LINE}` }}>
            <p className="text-xs leading-relaxed" style={{ color: SLATE }}>
              We are matching <b style={{ color: INK }}>₹{amount}</b> against our account — usually within
              a few hours. You do not need to wait or do anything else. If the payment
              never arrives, the credits are removed and we will email you.
            </p>
          </div>

          <button onClick={() => router.push('/profiles')}
            className="w-full rounded-full py-3.5 text-sm font-bold"
            style={{ background: BRAND, color: '#fff' }}>
            Start browsing profiles
          </button>
          <p className="mt-3 text-[10px]" style={{ color: '#B0A8A0' }}>
            Order <span className="font-mono">{order.id}</span> · all payments are final, no refunds
          </p>
        </div>
      </Shell>
    );
  }

  // ══ Expired before payment ═════════════════════════════════════════════════
  if (expired) {
    return (
      <Shell>
        <div className="px-6 py-12 text-center">
          <div className="text-5xl mb-4">⌛</div>
          <h1 className="text-xl font-extrabold mb-2" style={{ color: INK }}>This amount was released</h1>
          <p className="text-sm leading-relaxed" style={{ color: SLATE }}>
            Each order reserves a unique amount for 60 minutes so we can identify your
            payment. This one has lapsed — start a fresh order and you will get a new
            amount to pay.
          </p>
          <button onClick={() => router.push('/pricing')}
            className="mt-8 rounded-full px-8 py-3 text-sm font-bold"
            style={{ background: BRAND, color: '#fff' }}>
            Start a new order
          </button>
        </div>
      </Shell>
    );
  }

  // ══ Pay ════════════════════════════════════════════════════════════════════
  return (
    <Shell countdown={formatCountdown(left)} urgent={left < 300}>
      <div className="px-5 pt-6 pb-8 flex flex-col gap-5">

        {/* Amount — the whole page hangs off getting this typed correctly. */}
        <div className="text-center">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em] mb-2" style={{ color: WHISPER }}>
            Pay exactly
          </p>
          <p className="font-extrabold leading-none" style={{ color: INK, fontSize: '2.75rem' }}>
            ₹{rupees}<span style={{ color: BRAND }}>.{suffix}</span>
          </p>
          <button type="button" onClick={() => copy('amount', (order.amount_paise / 100).toFixed(2))}
            className="mt-3 text-xs font-bold px-4 py-1.5 rounded-full"
            style={{ background: copied === 'amount' ? BRAND : FIELD, color: copied === 'amount' ? '#fff' : INK }}>
            {copied === 'amount' ? 'Copied!' : 'Copy amount'}
          </button>
        </div>

        <div className="rounded-2xl px-4 py-3" style={{ background: MINT, border: `1.5px solid ${BRAND}22` }}>
          <p className="text-xs leading-relaxed" style={{ color: DARK }}>
            {/* {' '} is load-bearing: JSX drops the space after an interpolation that
                ends a line, which rendered this as "a rounded ₹2,199means". */}
            <b>The .{suffix} matters.</b> Those paise are how we recognise your payment
            without you sending us a screenshot. Paying a rounded ₹{rupees}{' '}
            means we cannot tell it apart from anyone else&apos;s.
          </p>
        </div>

        {/* Order summary */}
        <div className="rounded-2xl overflow-hidden" style={{ border: `1.5px solid ${LINE}` }}>
          <div className="px-4 py-3 flex items-start justify-between gap-3" style={{ background: '#FAFAF9' }}>
            <div className="min-w-0">
              <p className="text-sm font-bold" style={{ color: INK }}>{info.label}</p>
              <p className="text-[11px] mt-0.5" style={{ color: SLATE }}>{info.detail}</p>
            </div>
            <span className="text-sm font-extrabold shrink-0" style={{ color: INK }}>₹{amount}</span>
          </div>
        </div>

        {/* Pay-from-this-phone buttons first on mobile, QR first on desktop. */}
        <div className="flex flex-col-reverse sm:flex-col gap-5">

          {/* QR */}
          <div className="rounded-2xl px-4 py-4 flex flex-col items-center" style={{ border: `1.5px solid ${LINE}` }}>
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em] mb-3" style={{ color: WHISPER }}>
              Scan with any UPI app
            </p>
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${LINE}` }}
              dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <div className="flex items-center gap-2 rounded-xl px-3 py-2 mt-3 w-full" style={{ background: FIELD }}>
              <span className="flex-1 text-xs font-mono font-semibold truncate" style={{ color: INK }}>{UPI_VPA}</span>
              <button type="button" onClick={() => copy('vpa', UPI_VPA)}
                className="text-[11px] font-bold px-3 py-1 rounded-full shrink-0"
                style={{ background: copied === 'vpa' ? BRAND : DARK, color: '#fff' }}>
                {copied === 'vpa' ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* App intents */}
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em] mb-2" style={{ color: WHISPER }}>
              Or pay from this phone
            </p>
            <div className="grid grid-cols-2 gap-2">
              {UPI_APPS.map(app => (
                <a key={app.id} href={upiLink(order, app.id)}
                  className="flex items-center justify-center rounded-xl py-3 text-xs font-bold"
                  style={{ background: app.brand, color: '#fff', textDecoration: 'none' }}>
                  {app.name}
                </a>
              ))}
            </div>
          </div>
        </div>

        <div style={{ height: 1, background: LINE }} />

        {/* Claim */}
        {step === 'pay' ? (
          <>
            <button onClick={() => setStep('confirm')}
              className="w-full rounded-full py-3.5 text-sm font-bold"
              style={{ background: BRAND, color: '#fff' }}>
              I&apos;ve paid — activate my credits
            </button>
            <p className="text-center text-[11px]" style={{ color: WHISPER }}>
              Credits go live immediately. We verify the payment afterwards.
            </p>
          </>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em] mb-1.5" style={{ color: WHISPER }}>
                UTR / reference number <span style={{ color: '#C7C0B8' }}>— optional</span>
              </p>
              <input type="text" value={utr} onChange={e => setUtr(e.target.value)}
                placeholder="e.g. 425012345678"
                className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                style={{ background: FIELD, color: INK, border: '1.5px solid #E8E4E0' }} />
              <p className="mt-1.5 text-[11px]" style={{ color: WHISPER }}>
                Skip it if you cannot find it — the ₹{amount} amount already identifies your payment.
              </p>
            </div>

            {error && (
              <p className="text-xs font-semibold text-center" style={{ color: ALERT }}>{error}</p>
            )}

            <button onClick={claim} disabled={busy}
              className="w-full rounded-full py-3.5 text-sm font-bold"
              style={{ background: BRAND, color: '#fff', opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Activating…' : `Confirm I paid ₹${amount}`}
            </button>

            <p className="text-center text-[11px] leading-relaxed" style={{ color: WHISPER }}>
              Only confirm if the payment actually went through. Claims we cannot match
              against our account are reversed and the account is suspended.
            </p>

            <button onClick={() => { setStep('pay'); setError(null); }}
              className="text-xs font-semibold" style={{ color: SLATE }}>
              ← Back
            </button>
          </div>
        )}
      </div>
    </Shell>
  );
}

/** Page chrome — a narrow, self-contained frame, deliberately without site nav. */
function Shell({ children, countdown, urgent }: {
  children: React.ReactNode; countdown?: string; urgent?: boolean;
}) {
  return (
    <main className="min-h-screen flex items-start justify-center px-4 py-6 sm:py-12" style={{ background: FIELD }}>
      <section className="w-full sm:max-w-md rounded-3xl overflow-hidden"
        style={{ background: '#fff', boxShadow: 'rgba(0,0,0,0.08) 0px 24px 48px 0px' }}>

        <header className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${LINE}` }}>
          <div className="flex items-center gap-2">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={BRAND} strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="text-sm font-extrabold" style={{ color: INK }}>InstaRishta</span>
          </div>
          {countdown && (
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full font-mono"
              style={{ background: urgent ? '#FDF0E9' : FIELD, color: urgent ? ALERT : SLATE }}>
              {countdown}
            </span>
          )}
        </header>

        {children}
      </section>
    </main>
  );
}

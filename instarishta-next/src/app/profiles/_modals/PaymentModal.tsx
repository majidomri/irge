'use client';
/**
 * Out-of-credits modal. Picks a plan, opens a checkout.
 *
 * It used to be the whole payment flow: QR, VPA, a required UTR box and a
 * screenshot upload, all posted to Telegram for an admin to action by hand
 * hours later. All of that moved to /pay/[id], where the amount is reserved
 * server-side and credits activate on the spot — so what is left here is a
 * plan picker and a redirect. Nothing is collected from the user in this modal.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  PLANS, TOPUP, TOPUP_BONUS_CREDITS, TOPUP_TOTAL_CREDITS, totalCredits, pricePerCredit,
} from '@/lib/plans';
import type { OrderPlanId } from '@/lib/orders';

/** The two terms. Always offered — they are the only cold-start products. */
const PLAN_OPTIONS = PLANS.map(p => ({
  id:       p.id as OrderPlanId,
  label:    p.name,
  price:    p.price,
  headline: `${p.monthlyCredits} credits / month · ${p.months} months`,
  sub:      `${totalCredits(p)} total · ₹${pricePerCredit(p).toFixed(2)} per credit`,
}));

/**
 * The refill. Appended ONLY for an active subscriber whose balance is zero —
 * see src/lib/topup.ts for why it is not a third plan. POST /api/orders refuses
 * it otherwise, so this is presentation, not enforcement.
 */
const REFILL_OPTION = {
  id:       TOPUP.id as OrderPlanId,
  label:    TOPUP.name,
  price:    TOPUP.price,
  headline: `${TOPUP_TOTAL_CREDITS} credits — ${TOPUP.credits} + ${TOPUP_BONUS_CREDITS} bonus`,
  sub:      'Never expire · tops you up without restarting your term',
};

export default function PaymentModal({ userEmail, onClose }: { userEmail: string; onClose: () => void }) {
  const router = useRouter();
  const [plan,  setPlan]  = useState<OrderPlanId>(PLAN_OPTIONS[0].id);
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The modal opens precisely when someone has run out, which is exactly the
  // condition a refill is for — so ask, rather than assuming either way.
  const [refillOffered, setRefillOffered] = useState(false);

  useEffect(() => {
    let live = true;
    fetch('/api/account/profile')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (live) setRefillOffered(d?.topup?.eligible === true); })
      .catch(() => { /* leave the refill hidden — the plans still work */ });
    return () => { live = false; };
  }, []);

  const options  = refillOffered ? [...PLAN_OPTIONS, REFILL_OPTION] : PLAN_OPTIONS;
  const selected = options.find(p => p.id === plan) ?? PLAN_OPTIONS[0];

  async function startCheckout() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/orders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ plan }),
      });
      const json = await res.json() as { order?: { id: string }; error?: string };
      if (!res.ok || !json.order) {
        setError(json.error ?? 'Could not start checkout. Please try again.');
        setBusy(false);
        return;
      }
      // Deliberately not awaited-then-closed: the modal stays up under the
      // navigation so there is no blank flash between tap and checkout.
      router.push(`/pay/${json.order.id}`);
    } catch {
      setError('Network error. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-200 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <section className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden" style={{ background: '#fff', zIndex: 1, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>

        <div className="px-5 pt-5 pb-4 flex items-start justify-between shrink-0" style={{ borderBottom: '1px solid #F0ECE8' }}>
          <div className="min-w-0">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em]" style={{ color: '#696969' }}>Out of credits</p>
            <h2 className="text-[1.15rem] font-extrabold mt-0.5" style={{ color: '#141413' }}>Get more credits</h2>
            <p className="text-xs mt-1" style={{ color: '#696969' }}>Pay by UPI · credits activate instantly</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold shrink-0 ml-3" style={{ background: '#F3F0EE', color: '#141413' }}>×</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-4 flex flex-col gap-5">

            <div>
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em] mb-2" style={{ color: '#A0A0A0' }}>Choose a plan</p>
              <div className="flex flex-col gap-2">
                {options.map(p => (
                  <button type="button" key={p.id} onClick={() => setPlan(p.id)}
                    className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3 border-2 text-left transition-all"
                    style={{
                      borderColor: plan === p.id ? '#006241' : '#E8E4E0',
                      background:  plan === p.id ? '#EEF6F0' : '#FAFAF9',
                    }}>
                    <div className="min-w-0">
                      <span className="text-sm font-bold block" style={{ color: plan === p.id ? '#006241' : '#141413' }}>{p.label}</span>
                      <span className="text-[11px] block mt-0.5" style={{ color: '#141413' }}>{p.headline}</span>
                      <span className="text-[10px] block" style={{ color: '#696969' }}>{p.sub}</span>
                    </div>
                    <span className="text-base font-extrabold shrink-0" style={{ color: plan === p.id ? '#006241' : '#141413' }}>
                      ₹{p.price.toLocaleString('en-IN')}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-xs font-semibold text-center" style={{ color: '#CF4500' }}>{error}</p>
            )}

            <button onClick={startCheckout} disabled={busy}
              className="w-full rounded-full py-3.5 text-sm font-bold"
              style={{ background: '#006241', color: '#fff', opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Opening checkout…' : `Continue · ₹${selected.price.toLocaleString('en-IN')}`}
            </button>

            <p className="text-center text-[10px] leading-relaxed" style={{ color: '#B0A8A0' }}>
              {userEmail && <>Buying for <span style={{ color: '#696969' }}>{userEmail}</span><br /></>}
              All payments are final — no refunds once a plan is activated.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

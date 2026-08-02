'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  PLANS, TOPUP, FREE_CREDITS, FREE_INTERESTS, FREE_ENTITLEMENTS,
  entitlementsFor, fmtAllowance, totalCredits, pricePerCredit,
} from '@/lib/plans';
import type { OrderPlanId } from '@/lib/orders';

/**
 * Two terms, not four packages. Cards deliberately lead with TOTAL CREDITS and
 * COST PER CREDIT and never show an effective-monthly figure: at ₹2,199/6mo vs
 * ₹4,499/12mo the monthly maths (₹366 vs ₹375) argues *against* the annual
 * plan, while per-credit (₹12.22 vs ₹9.37) and volume (180 vs 480) argue for it.
 */

const TIER_STYLE: Record<string, { color: string; accent: string; bg: string; ring: string }> = {
  ir6: {
    color:  '#7B8FA1',
    accent: '#C0CDD8',
    bg:     'linear-gradient(135deg, #f0f4f8 0%, #e8edf2 100%)',
    ring:   'rgba(123,143,161,0.3)',
  },
  ir12: {
    color:  '#006241',
    accent: '#00A86B',
    bg:     'linear-gradient(135deg, #f0fdf8 0%, #d1fae5 100%)',
    ring:   'rgba(0,98,65,0.35)',
  },
};

/**
 * Generated from the shared entitlement map rather than hand-written, so the
 * table can never advertise a number the server does not actually enforce.
 */
const TIERS = [FREE_ENTITLEMENTS, ...PLANS.map(p => entitlementsFor(p.id))];

const COMPARE_ROWS: { feature: string; cells: (string | boolean)[] }[] = [
  { feature: 'Contact unlocks',
    cells: TIERS.map(t => (t.refillsMonthly ? `${t.contactPerCycle} / month` : `${t.welcomeCredits} once`)) },
  { feature: 'Total over the term',
    cells: TIERS.map(t => (t.refillsMonthly ? String(t.contactPerCycle * t.termMonths) : String(t.welcomeCredits))) },
  { feature: 'Cost per unlock',
    cells: TIERS.map(t => (t.refillsMonthly ? `₹${(t.price / (t.contactPerCycle * t.termMonths)).toFixed(2)}` : '—')) },
  { feature: 'Credits refill monthly',      cells: TIERS.map(t => t.refillsMonthly) },
  { feature: 'Interests (free to send)',    cells: TIERS.map(t => `${t.interestsPerMonth} / month`) },
  { feature: 'Profile views',               cells: TIERS.map(t => fmtAllowance(t.profileViews)) },
  { feature: 'Audio biodata',               cells: TIERS.map(t => fmtAllowance(t.audioPerDay, '/ day')) },
  { feature: 'Verified badge',              cells: TIERS.map(t => t.verifiedBadge) },
  { feature: 'Priority listing',            cells: TIERS.map(t => t.priorityListing) },
  { feature: 'Support',                     cells: TIERS.map(t => t.support) },
  { feature: 'Validity',
    cells: TIERS.map(t => (t.termMonths ? `${t.termMonths} months` : 'Forever')) },
];

const FAQS = [
  {
    q: 'What does "credits refill monthly" mean?',
    a: 'Your contact unlocks reset to the full monthly amount on the same date every month, for as long as your plan is active. On Rishta 12 that is 40 fresh unlocks each month — 480 across the year.',
  },
  {
    q: 'Do unused credits carry over to the next month?',
    a: 'No. Each month starts fresh at your full allowance, and anything unused that month is not carried forward. This keeps the plans affordable — you are paying for steady monthly access, not a stockpile.',
  },
  {
    q: 'Which plan is better value?',
    a: 'Rishta 12. You get 480 unlocks instead of 180, and each unlock costs ₹9.37 instead of ₹12.22 — about 23% cheaper per contact. Rishta 6 is the lighter commitment if you are just starting out.',
  },
  {
    q: 'Does the plan renew automatically?',
    a: 'No. There is no auto-debit and no standing mandate on your card or UPI — nothing is ever charged without you initiating it. When your term ends, your credits simply stop refilling and you can choose to purchase again.',
  },
  {
    q: 'What is a "contact unlock"?',
    a: 'When you find a profile you are interested in, one unlock reveals their full contact details — phone, WhatsApp, or family representative. Once unlocked, that contact stays visible to you permanently, even after your plan ends.',
  },
  {
    q: 'What is an "interest" and does it cost a credit?',
    a: `Sending an interest is completely free — it uses no contact credit. You tap the heart, pick one of our ready-made messages (no typing), and we pass it privately to the family. It is never posted publicly on the profile. Free accounts get ${FREE_INTERESTS} interests a month, Rishta 6 gets 40, and Rishta 12 gets 60.`,
  },
  {
    q: 'When exactly is a contact credit used?',
    a: 'Only when a family says they want to connect. We tell them about your interest; if they agree, the lead turns green in "My interests" on your account and you can reveal their contact details for one credit. If they decline or never respond, you are not charged anything at all. Revealing the same contact again later is free — you are only ever charged once per profile.',
  },
  {
    q: 'Why can I only choose from set messages?',
    a: 'Because your message reaches a real family, often about their daughter. Ready-made phrases keep every approach respectful, work equally well in Urdu and English, and mean no one can be sent anything inappropriate. It also gets you a faster answer, since families can read and reply at a glance.',
  },
  {
    q: 'Why are interests limited at all?',
    a: 'To keep them meaningful. If anyone could send unlimited interests, families would be flooded and every interest would be ignored. A limited number means that when a family receives one, they know it was a considered choice — which is exactly why they respond to them.',
  },
  {
    q: 'What if I run out before the month is up?',
    a: `You can buy a top-up of ${TOPUP.credits} extra credits for ₹${TOPUP.price} at any time. Top-up credits are permanent — they never reset and they stay with you even after your plan expires.`,
  },
  {
    q: 'How do I pay?',
    a: 'UPI — Google Pay, PhonePe, BHIM or Paytm. Pick a plan and we show you a checkout page with a QR code and an exact amount. Pay it, tap "I\'ve paid", and your credits go live immediately — no waiting, and nothing to send us. Pay the exact amount shown, paise included: those last two digits are how we recognise your payment.',
  },
  {
    q: 'Can I get a refund?',
    a: 'No. All payments are final and non-refundable. Given the nature of the service — contact details are revealed immediately and cannot be returned once seen — we do not offer refunds under any circumstances. Please choose your plan carefully before paying.',
  },
  {
    q: 'Does one plan cover my whole family?',
    a: "Each plan covers one candidate's search. Families managing proposals for more than one candidate need a separate plan for each.",
  },
];

function Check({ yes }: { yes: boolean }) {
  return yes
    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#00A86B" fillOpacity="0.12"/><path d="M7 12.5l3.5 3.5L17 9" stroke="#006241" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="rgba(0,0,0,0.04)"/><path d="M9 9l6 6M15 9l-6 6" stroke="rgba(0,0,0,0.25)" strokeWidth="1.8" strokeLinecap="round"/></svg>;
}

export default function PricingPage() {
  const router = useRouter();
  const [openFaq,  setOpenFaq]  = useState<number | null>(null);
  const [busy,     setBusy]     = useState<OrderPlanId | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);

  /**
   * Reserve an amount and hand off to /pay/[id].
   *
   * Anonymous visitors are the common case on this page, so a 401 is not an
   * error to show — it means "sign in first", and we bounce them through auth
   * with ?next set so they land back here and can pick up where they left off.
   */
  async function startCheckout(plan: OrderPlanId) {
    setBusy(plan);
    setBuyError(null);
    try {
      const res = await fetch('/api/orders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ plan }),
      });
      if (res.status === 401) {
        router.push(`/?signin=1&next=${encodeURIComponent('/pricing')}`);
        return;
      }
      const json = await res.json() as { order?: { id: string }; error?: string };
      if (!res.ok || !json.order) {
        setBuyError(json.error ?? 'Could not start checkout. Please try again.');
        setBusy(null);
        return;
      }
      router.push(`/pay/${json.order.id}`);   // busy stays set under the navigation
    } catch {
      setBuyError('Network error. Check your connection and try again.');
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen" style={{ background: '#F3F0EE', fontFamily: 'Inter, sans-serif' }}>

      {/* Hero */}
      <section className="pt-16 pb-12 px-4 text-center" style={{ background: 'linear-gradient(160deg, #1E3932 0%, #006241 60%, #00754A 100%)' }}>
        <div className="inline-flex items-center gap-2 text-[0.75rem] font-semibold tracking-widest uppercase text-[rgba(255,255,255,0.6)] mb-4">
          <span className="w-8 h-px bg-[rgba(255,255,255,0.3)]" />
          Membership Plans
          <span className="w-8 h-px bg-[rgba(255,255,255,0.3)]" />
        </div>
        <h1 className="text-[2rem] md:text-[2.8rem] font-bold text-white leading-[1.15] mb-3 max-w-2xl mx-auto">
          Fresh credits.<br />
          <span style={{ color: '#00C87A' }}>Every single month.</span>
        </h1>
        <p className="text-[rgba(255,255,255,0.72)] text-[1rem] max-w-xl mx-auto mb-8 leading-relaxed">
          One membership, refilled monthly for the whole term. No tiers to compare, no auto-renewal, no surprises.
        </p>
        <div className="flex flex-wrap justify-center gap-6 text-white">
          {[['🔄', 'Monthly refill'], ['🔒', 'Verified Profiles'], ['🚫', 'No auto-debit'], ['🌙', 'Islamic Values']].map(([icon, label]) => (
            <div key={label as string} className="flex items-center gap-1.5 text-[0.82rem] text-[rgba(255,255,255,0.8)]">
              <span>{icon}</span><span>{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Plans */}
      <section className="px-4 py-12 max-w-3xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {PLANS.map(plan => {
            const s = TIER_STYLE[plan.id];
            return (
              <div
                key={plan.id}
                className="relative rounded-2xl overflow-hidden flex flex-col"
                style={{
                  background: s.bg,
                  boxShadow: plan.popular
                    ? `0 0 0 2.5px ${s.accent}, 0 16px 48px -12px ${s.ring}`
                    : `0 4px 24px -8px ${s.ring}`,
                }}
              >
                <div className="absolute top-4 right-4 text-[0.65rem] font-bold tracking-wider uppercase px-2.5 py-1 rounded-full"
                  style={{ background: s.color, color: '#fff' }}>
                  {plan.badge}
                </div>

                <div className="p-6 pb-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm" style={{ background: s.color }}>
                      {plan.months}
                    </div>
                    <span className="font-bold text-[1rem]" style={{ color: s.color }}>{plan.name}</span>
                  </div>

                  <div className="mb-1">
                    <span className="text-[0.78rem] text-[rgba(0,0,0,0.45)] font-medium">₹</span>
                    <span className="text-[2.2rem] font-bold text-[rgba(0,0,0,0.87)] leading-none">{plan.price.toLocaleString('en-IN')}</span>
                  </div>
                  <p className="text-[0.75rem] text-[rgba(0,0,0,0.5)] mb-1">
                    for {plan.months} months — paid once
                  </p>
                  <p className="text-[0.8rem] font-semibold mb-5" style={{ color: s.color }}>
                    {totalCredits(plan)} unlocks · ₹{pricePerCredit(plan).toFixed(2)} each
                  </p>

                  <div className="space-y-2.5 mb-6">
                    {plan.features.map(f => (
                      <div key={f} className="flex items-start gap-2.5 text-[0.82rem] text-[rgba(0,0,0,0.78)]">
                        <span className="shrink-0 mt-0.5"><Check yes /></span>
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-auto px-6 pb-6">
                  <button
                    type="button"
                    onClick={() => startCheckout(plan.id)}
                    disabled={busy !== null}
                    className="w-full block text-center py-2.5 rounded-full font-bold text-[0.88rem] transition-all active:scale-95 no-underline"
                    style={{
                      background: plan.popular ? s.color : 'transparent',
                      color:      plan.popular ? '#fff' : s.color,
                      border:     `2px solid ${s.color}`,
                      opacity:    busy !== null && busy !== plan.id ? 0.5 : 1,
                      cursor:     busy !== null ? 'wait' : 'pointer',
                    }}
                  >
                    {busy === plan.id ? 'Opening checkout…' : `Choose ${plan.name}`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3"
          style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.07)' }}>
          <div>
            <p className="font-bold text-[0.88rem] text-[rgba(0,0,0,0.87)]">Ran out before the month is up?</p>
            <p className="text-[0.78rem] text-[rgba(0,0,0,0.52)]">
              {TOPUP.credits} extra credits, one time — they never reset and never expire.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[1.1rem] font-extrabold" style={{ color: '#006241' }}>₹{TOPUP.price}</span>
            <button
              type="button"
              onClick={() => startCheckout(TOPUP.id)}
              disabled={busy !== null}
              className="px-5 py-2 rounded-full font-bold text-[0.82rem] transition-all active:scale-95"
              style={{
                background: '#006241', color: '#fff',
                opacity: busy !== null && busy !== TOPUP.id ? 0.5 : 1,
                cursor:  busy !== null ? 'wait' : 'pointer',
              }}
            >
              {busy === TOPUP.id ? 'Opening…' : 'Get top-up'}
            </button>
          </div>
        </div>

        {buyError && (
          <p className="text-center text-[0.8rem] font-semibold mt-4" style={{ color: '#CF4500' }}>{buyError}</p>
        )}

        <p className="text-center text-[0.75rem] text-[rgba(0,0,0,0.42)] mt-6">
          All prices inclusive of GST · Credits activate the moment you confirm payment<br />
          No auto-renewal · All payments are final and non-refundable
        </p>
      </section>

      {/* Comparison */}
      <section className="px-4 pb-16 max-w-3xl mx-auto">
        <h2 className="text-[1.5rem] font-bold text-[rgba(0,0,0,0.87)] mb-2 text-center">Compare</h2>
        <p className="text-center text-[0.85rem] text-[rgba(0,0,0,0.5)] mb-8">Free browsing always stays free</p>

        <div className="rounded-2xl overflow-x-auto border border-[rgba(0,0,0,0.07)]" style={{ background: '#fff' }}>
          <div className="min-w-[520px]">
            <div className="grid grid-cols-4 bg-[#1E3932] text-white text-[0.78rem] font-semibold">
              <div className="p-4 text-[rgba(255,255,255,0.6)]">Feature</div>
              <div className="p-4 text-center text-[rgba(255,255,255,0.6)]">Free</div>
              {PLANS.map(p => (
                <div key={p.id} className="p-4 text-center" style={{ color: TIER_STYLE[p.id].accent }}>{p.name}</div>
              ))}
            </div>

            {COMPARE_ROWS.map((row, i) => (
              <div key={row.feature} className="grid grid-cols-4 text-[0.8rem] border-t border-[rgba(0,0,0,0.05)]"
                style={{ background: i % 2 === 0 ? '#fff' : '#fafaf9' }}>
                <div className="p-3.5 px-4 font-medium text-[rgba(0,0,0,0.72)]">{row.feature}</div>
                {row.cells.map((val, j) => (
                  <div key={j} className="p-3.5 flex items-center justify-center">
                    {typeof val === 'boolean'
                      ? <Check yes={val} />
                      : <span className="text-[0.78rem] font-semibold text-[#006241] text-center">{val}</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Payment methods */}
      <section className="px-4 pb-16 max-w-3xl mx-auto text-center">
        <h2 className="text-[1.2rem] font-bold text-[rgba(0,0,0,0.87)] mb-2">How to Pay</h2>
        <p className="text-[0.85rem] text-[rgba(0,0,0,0.52)] mb-8">Three taps, and your credits are live</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: '🛒', title: '1. Pick a plan',    desc: 'We reserve an exact amount just for you' },
            { icon: '📱', title: '2. Pay via UPI',    desc: 'Scan the QR or open PhonePe, GPay or Paytm' },
            { icon: '⚡', title: '3. Tap "I\'ve paid"', desc: 'Credits activate instantly — nothing to send us' },
          ].map(m => (
            <div key={m.title} className="rounded-xl p-5 border border-[rgba(0,0,0,0.07)] text-left" style={{ background: '#fff' }}>
              <div className="text-2xl mb-2">{m.icon}</div>
              <div className="font-bold text-[0.88rem] text-[rgba(0,0,0,0.87)] mb-1">{m.title}</div>
              <div className="text-[0.75rem] text-[rgba(0,0,0,0.52)]">{m.desc}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 p-4 rounded-xl border border-[rgba(0,168,107,0.2)] text-[0.8rem] text-[rgba(0,0,0,0.6)] leading-relaxed" style={{ background: 'rgba(0,168,107,0.04)' }}>
          <strong className="text-[#006241]">Need help choosing?</strong> WhatsApp us at{' '}
          <a href="https://wa.me/918886667121" className="text-[#006241] font-semibold underline">+91 888 666 7121</a>{' '}
          and our team will guide you before you pay.
        </div>
      </section>

      {/* FAQ */}
      <section className="px-4 pb-20 max-w-2xl mx-auto">
        <h2 className="text-[1.3rem] font-bold text-[rgba(0,0,0,0.87)] mb-6 text-center">Frequently Asked Questions</h2>
        <div className="space-y-2">
          {FAQS.map((faq, i) => (
            <div key={i} className="rounded-xl border border-[rgba(0,0,0,0.07)] overflow-hidden" style={{ background: '#fff' }}>
              <button
                className="w-full text-left px-5 py-4 flex items-center justify-between gap-3 font-medium text-[0.88rem] text-[rgba(0,0,0,0.87)]"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                <span>{faq.q}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                  className="shrink-0 transition-transform duration-200"
                  style={{ transform: openFaq === i ? 'rotate(180deg)' : 'none', opacity: 0.45 }}>
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </button>
              {openFaq === i && (
                <div className="px-5 pb-4 text-[0.83rem] text-[rgba(0,0,0,0.6)] leading-relaxed border-t border-[rgba(0,0,0,0.05)]">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="px-4 pb-24 text-center">
        <div className="max-w-xl mx-auto rounded-2xl p-10" style={{ background: 'linear-gradient(135deg, #1E3932 0%, #006241 100%)' }}>
          <div className="text-3xl mb-3">🌙</div>
          <h3 className="text-[1.4rem] font-bold text-white mb-2">Ready to find your match?</h3>
          <p className="text-[rgba(255,255,255,0.7)] text-[0.88rem] mb-6">
            Start with {FREE_CREDITS} free unlocks — no payment needed to look around.
          </p>
          <Link
            href="/profiles"
            className="inline-flex items-center gap-2 px-7 py-3 rounded-full font-bold text-[0.88rem] text-[#006241] bg-white transition-all active:scale-95 no-underline"
          >
            Browse Profiles First
          </Link>
        </div>
      </section>
    </main>
  );
}

'use client';
import { useState } from 'react';
import Link from 'next/link';

const PLANS = [
  {
    id: 'silver',
    name: 'Silver',
    badge: 'Starter · One Time',
    price: 499,
    period: 30,
    color: '#7B8FA1',
    accent: '#C0CDD8',
    bg: 'linear-gradient(135deg, #f0f4f8 0%, #e8edf2 100%)',
    ring: 'rgba(123,143,161,0.3)',
    features: [
      { label: '50 Contact Unlocks', icon: '📇' },
      { label: 'Verified Profile Badge', icon: '✅' },
      { label: 'Standard Listing', icon: '📋' },
      { label: 'Smart Search Filters', icon: '🔍' },
      { label: 'Email Support', icon: '📧' },
      { label: 'Profile Views: up to 200', icon: '👁️' },
    ],
    cta: 'Get Started',
    popular: false,
  },
  {
    id: 'gold',
    name: 'Gold',
    badge: 'Popular',
    price: 1999,
    period: 60,
    color: '#C8960C',
    accent: '#F0C040',
    bg: 'linear-gradient(135deg, #fffbef 0%, #fdf3ce 100%)',
    ring: 'rgba(200,150,12,0.35)',
    features: [
      { label: '200 Contact Unlocks', icon: '📇' },
      { label: 'Verified Badge + Highlight', icon: '✅' },
      { label: 'Priority Listing', icon: '⬆️' },
      { label: 'Audio Biodata Showcase', icon: '🎙️' },
      { label: 'WhatsApp Support', icon: '💬' },
      { label: 'Profile Views: up to 600', icon: '👁️' },
    ],
    cta: 'Choose Gold',
    popular: true,
  },
  {
    id: 'diamond',
    name: 'Diamond',
    badge: 'Best Value',
    price: 4999,
    period: 150,
    color: '#2563EB',
    accent: '#60A5FA',
    bg: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
    ring: 'rgba(37,99,235,0.3)',
    features: [
      { label: '500 Contact Unlocks', icon: '📇' },
      { label: 'Featured Placement', icon: '⭐' },
      { label: 'Dedicated Rishta Counselor', icon: '🤝' },
      { label: 'Audio + Video Biodata', icon: '🎬' },
      { label: 'Priority WhatsApp Support', icon: '💬' },
      { label: 'Profile Views: up to 1,200', icon: '👁️' },
    ],
    cta: 'Choose Diamond',
    popular: false,
  },
  {
    id: 'platinum',
    name: 'Platinum',
    badge: 'Premium',
    price: 11000,
    period: 365,
    color: '#006241',
    accent: '#00A86B',
    bg: 'linear-gradient(135deg, #f0fdf8 0%, #d1fae5 100%)',
    ring: 'rgba(0,98,65,0.35)',
    features: [
      { label: 'Unlimited Contact Unlocks', icon: '♾️' },
      { label: 'Top Featured Banner', icon: '🏆' },
      { label: 'Personal Account Manager', icon: '👤' },
      { label: 'Audio + Video Showcase (×8)', icon: '🎬' },
      { label: 'VIP WhatsApp Hotline', icon: '📱' },
      { label: 'Profile Views: Unlimited', icon: '👁️' },
    ],
    cta: 'Go Platinum',
    popular: false,
  },
];

const COMPARE_ROWS = [
  { feature: 'Contact Unlocks',       silver: '50',        gold: '200',       diamond: '500',      platinum: 'Unlimited' },
  { feature: 'Profile Views',         silver: '200',       gold: '600',       diamond: '1,200',    platinum: 'Unlimited' },
  { feature: 'Verified Badge',        silver: true,        gold: true,        diamond: true,       platinum: true },
  { feature: 'Priority Listing',      silver: false,       gold: true,        diamond: true,       platinum: true },
  { feature: 'Featured Placement',    silver: false,       gold: false,       diamond: true,       platinum: true },
  { feature: 'Top Banner Promotion',  silver: false,       gold: false,       diamond: false,      platinum: true },
  { feature: 'Audio Biodata',         silver: false,       gold: true,        diamond: true,       platinum: true },
  { feature: 'Video Biodata',         silver: false,       gold: false,       diamond: true,       platinum: true },
  { feature: 'Rishta Counselor',      silver: false,       gold: false,       diamond: true,       platinum: true },
  { feature: 'Account Manager',       silver: false,       gold: false,       diamond: false,      platinum: true },
  { feature: 'Support Channel',       silver: 'Email',     gold: 'WhatsApp',  diamond: 'Priority WA', platinum: 'VIP Hotline' },
  { feature: 'Validity',              silver: '30 days',   gold: '60 days',   diamond: '150 days', platinum: '365 days' },
];

const FAQS = [
  {
    q: 'Can I upgrade my plan later?',
    a: 'Yes — except for Silver. Silver is a one-time starter plan and cannot be renewed after it expires. To continue, you must choose Gold, Diamond, or Platinum. For all other plans, upgrading to a higher tier is available at any time.',
  },
  {
    q: 'What is a "Contact Unlock"?',
    a: 'When you find a profile you are interested in, one Contact Unlock reveals their full contact details — phone, WhatsApp, or representative. The unlock is permanent and does not expire.',
  },
  {
    q: 'How do I pay?',
    a: 'We accept UPI (Google Pay, PhonePe, BHIM), Debit/Credit cards, and Net Banking. All transactions are secured via Razorpay.',
  },
  {
    q: 'Is my personal data safe?',
    a: 'Your data is encrypted and never shared with third parties. Contact details are only revealed to users who unlock them — no mass broadcast.',
  },
  {
    q: 'What is the refund policy?',
    a: 'Plans are non-refundable once activated. However, if you face a technical issue or billing error, contact us within 7 days and we will resolve it.',
  },
  {
    q: 'Does the plan cover one person or the whole family?',
    a: "Each plan is for one candidate's profile. Families managing multiple profiles need separate plans for each candidate.",
  },
];

function Check({ yes, text }: { yes?: boolean | string; text?: string }) {
  if (typeof yes === 'string' || typeof text === 'string') {
    const val = (yes as string) || text || '';
    return <span className="text-[0.78rem] font-semibold text-[#006241]">{val}</span>;
  }
  if (yes) {
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#00A86B" fillOpacity="0.12"/><path d="M7 12.5l3.5 3.5L17 9" stroke="#006241" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  }
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="rgba(0,0,0,0.04)"/><path d="M9 9l6 6M15 9l-6 6" stroke="rgba(0,0,0,0.25)" strokeWidth="1.8" strokeLinecap="round"/></svg>;
}

export default function PricingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

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
          Invest in Your Rishta.<br />
          <span style={{ color: '#00C87A' }}>Find the Right Match.</span>
        </h1>
        <p className="text-[rgba(255,255,255,0.72)] text-[1rem] max-w-xl mx-auto mb-8 leading-relaxed">
          Every plan is paid — because serious proposals deserve a serious platform. Choose the tier that fits your timeline and goals.
        </p>
        <div className="flex flex-wrap justify-center gap-6 text-white">
          {[['🔒', 'Verified Profiles'], ['⚡', 'Instant Unlocks'], ['🤝', 'Family-First Contact'], ['🌙', 'Islamic Values']].map(([icon, label]) => (
            <div key={label as string} className="flex items-center gap-1.5 text-[0.82rem] text-[rgba(255,255,255,0.8)]">
              <span>{icon}</span><span>{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Plans Grid */}
      <section className="px-4 py-12 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {PLANS.map(plan => (
            <div
              key={plan.id}
              className="relative rounded-2xl overflow-hidden flex flex-col"
              style={{
                background: plan.bg,
                boxShadow: plan.popular
                  ? `0 0 0 2.5px ${plan.accent}, 0 16px 48px -12px ${plan.ring}`
                  : `0 4px 24px -8px ${plan.ring}`,
              }}
            >
              {plan.badge && (
                <div
                  className="absolute top-4 right-4 text-[0.65rem] font-bold tracking-wider uppercase px-2.5 py-1 rounded-full"
                  style={{ background: plan.color, color: '#fff' }}
                >
                  {plan.badge}
                </div>
              )}

              <div className="p-6 pb-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm" style={{ background: plan.color }}>
                    {plan.name[0]}
                  </div>
                  <span className="font-bold text-[1rem]" style={{ color: plan.color }}>{plan.name}</span>
                </div>

                <div className="mb-1">
                  <span className="text-[0.78rem] text-[rgba(0,0,0,0.45)] font-medium">₹</span>
                  <span className="text-[2.2rem] font-bold text-[rgba(0,0,0,0.87)] leading-none">{plan.price.toLocaleString('en-IN')}</span>
                </div>
                <p className="text-[0.75rem] text-[rgba(0,0,0,0.5)] mb-5">for {plan.period} days</p>

                <div className="space-y-2.5 mb-6">
                  {plan.features.map(f => (
                    <div key={f.label} className="flex items-center gap-2.5 text-[0.82rem] text-[rgba(0,0,0,0.78)]">
                      <span className="text-base leading-none w-5 shrink-0 text-center">{f.icon}</span>
                      <span>{f.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-auto px-6 pb-6">
                <button
                  className="w-full py-2.5 rounded-full font-bold text-[0.88rem] transition-all active:scale-95"
                  style={{
                    background: plan.popular ? plan.color : 'transparent',
                    color: plan.popular ? '#fff' : plan.color,
                    border: `2px solid ${plan.color}`,
                  }}
                  onClick={() => alert('Payments coming soon — contact us on WhatsApp to activate your plan.')}
                >
                  {plan.cta}
                </button>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-[0.75rem] text-[rgba(0,0,0,0.42)] mt-6">
          All prices are inclusive of GST. Plans activate within 30 minutes of payment confirmation.
        </p>
      </section>

      {/* Comparison Table */}
      <section className="px-4 pb-16 max-w-5xl mx-auto">
        <h2 className="text-[1.5rem] font-bold text-[rgba(0,0,0,0.87)] mb-2 text-center">Compare Plans</h2>
        <p className="text-center text-[0.85rem] text-[rgba(0,0,0,0.5)] mb-8">See exactly what each plan includes</p>

        <div className="rounded-2xl overflow-hidden border border-[rgba(0,0,0,0.07)]" style={{ background: '#fff' }}>
          {/* Header */}
          <div className="grid grid-cols-5 bg-[#1E3932] text-white text-[0.78rem] font-semibold">
            <div className="p-4 text-[rgba(255,255,255,0.6)]">Feature</div>
            {PLANS.map(p => (
              <div key={p.id} className="p-4 text-center" style={{ color: p.accent }}>{p.name}</div>
            ))}
          </div>

          {COMPARE_ROWS.map((row, i) => (
            <div
              key={row.feature}
              className="grid grid-cols-5 text-[0.8rem] border-t border-[rgba(0,0,0,0.05)]"
              style={{ background: i % 2 === 0 ? '#fff' : '#fafaf9' }}
            >
              <div className="p-3.5 px-4 font-medium text-[rgba(0,0,0,0.72)]">{row.feature}</div>
              {(['silver', 'gold', 'diamond', 'platinum'] as const).map(tier => {
                const val = row[tier];
                return (
                  <div key={tier} className="p-3.5 flex items-center justify-center">
                    {typeof val === 'boolean'
                      ? <Check yes={val} />
                      : <span className="text-[0.78rem] font-semibold text-[#006241] text-center">{val}</span>
                    }
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      {/* Payment Methods */}
      <section className="px-4 pb-16 max-w-3xl mx-auto text-center">
        <h2 className="text-[1.2rem] font-bold text-[rgba(0,0,0,0.87)] mb-2">How to Pay</h2>
        <p className="text-[0.85rem] text-[rgba(0,0,0,0.52)] mb-8">Choose any plan above and complete payment securely</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: '📱', title: 'UPI / QR Code', desc: 'Google Pay · PhonePe · BHIM · Paytm' },
            { icon: '💳', title: 'Card Payment', desc: 'All Debit & Credit cards accepted' },
            { icon: '🏦', title: 'Net Banking', desc: 'All major Indian banks supported' },
          ].map(m => (
            <div
              key={m.title}
              className="rounded-xl p-5 border border-[rgba(0,0,0,0.07)] text-left"
              style={{ background: '#fff' }}
            >
              <div className="text-2xl mb-2">{m.icon}</div>
              <div className="font-bold text-[0.88rem] text-[rgba(0,0,0,0.87)] mb-1">{m.title}</div>
              <div className="text-[0.75rem] text-[rgba(0,0,0,0.52)]">{m.desc}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 p-4 rounded-xl border border-[rgba(0,168,107,0.2)] text-[0.8rem] text-[rgba(0,0,0,0.6)] leading-relaxed" style={{ background: 'rgba(0,168,107,0.04)' }}>
          <strong className="text-[#006241]">Need help choosing?</strong> WhatsApp us at{' '}
          <a href="https://wa.me/919100000000" className="text-[#006241] font-semibold underline">+91 910-000-0000</a>{' '}
          and our team will guide you to the right plan based on your requirements.
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
                <svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                  className="shrink-0 transition-transform duration-200"
                  style={{ transform: openFaq === i ? 'rotate(180deg)' : 'none', opacity: 0.45 }}
                >
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
        <div
          className="max-w-xl mx-auto rounded-2xl p-10"
          style={{ background: 'linear-gradient(135deg, #1E3932 0%, #006241 100%)' }}
        >
          <div className="text-3xl mb-3">🌙</div>
          <h3 className="text-[1.4rem] font-bold text-white mb-2">Ready to find your match?</h3>
          <p className="text-[rgba(255,255,255,0.7)] text-[0.88rem] mb-6">
            Join thousands of families who found their rishta through InstaRishta.
          </p>
          <Link
            href="/profiles"
            className="inline-flex items-center gap-2 px-7 py-3 rounded-full font-bold text-[0.88rem] text-[#006241] bg-white transition-all active:scale-95"
          >
            Browse Profiles First
          </Link>
        </div>
      </section>
    </main>
  );
}

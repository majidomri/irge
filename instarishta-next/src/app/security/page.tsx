import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Security & Safety — InstaRishta',
  description: 'How InstaRishta protects your privacy, data, and safety on our Muslim matrimonial platform.',
};

const SAFETY_ITEMS = [
  { icon: '🔍', title: 'Profile Verification', desc: 'All profiles are manually reviewed before being published. Community-vouching and moderation reduce fake accounts to near zero. Verified badges indicate profiles that have passed additional checks.' },
  { icon: '🛡️', title: 'Data Protection', desc: 'We do not sell or share your personal data with advertisers. Profile contact details are shared only for direct matrimonial connection. All data is encrypted in transit (HTTPS/TLS) and at rest.' },
  { icon: '👨‍👩‍👧', title: 'Family-First Contact', desc: 'Contact information flows to families, not individuals. This reduces harassment risk, aligns with Islamic principles of Wali involvement, and keeps every interaction halal and family-approved.' },
  { icon: '🚫', title: 'Zero Spam Tolerance', desc: 'Automated spam detection and manual moderation remove irrelevant or abusive profiles within 24 hours of reporting. Repeat offenders are permanently banned.' },
  { icon: '🔐', title: 'Secure Infrastructure', desc: 'Hosted on enterprise-grade infrastructure — Cloudflare for DDoS protection and CDN, Supabase for encrypted database hosting. Regular security audits are performed.' },
  { icon: '📣', title: 'Report & Block', desc: 'Users can report suspicious profiles, fake accounts, or inappropriate behaviour directly. Our moderation team reviews all reports within 48 hours and takes immediate action.' },
  { icon: '🔑', title: 'No Password Required', desc: 'InstaRishta uses passwordless authentication (magic links and Google One Tap) — eliminating the risk of password theft or credential stuffing attacks.' },
  { icon: '👶', title: 'Minor Protection', desc: 'InstaRishta is strictly 18+. Any profile showing indicators of minor submission is immediately rejected and reported. See our full Child Safety Policy.' },
];

const LEGAL_LINKS = [
  { label: 'Privacy Policy', href: '/privacy', desc: 'How we collect, use, and protect your personal data. Includes Google data usage disclosure.', icon: '🔒' },
  { label: 'Terms of Service', href: '/toc', desc: 'Rules governing use of the InstaRishta platform, eligibility, and user conduct.', icon: '📋' },
  { label: 'Refund Policy', href: '/refund-policy', desc: 'Cancellation and refund terms for any paid premium services.', icon: '💳' },
  { label: 'Child Safety Policy', href: '/child-safety', desc: 'Our zero-tolerance policy for minors and how to report safety concerns.', icon: '🛡️' },
  { label: 'Disclaimer', href: '/disclaimer', desc: 'User agreement, platform disclaimer, and end-user consent terms.', icon: '📄' },
];

export default function SecurityPage() {
  return (
    <div style={{ background: '#f2f0eb' }} className="min-h-screen px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="text-sm font-semibold no-underline mb-8 inline-block" style={{ color: '#00754A' }}>
          ← Back to Home
        </Link>

        <div className="bg-white rounded-[16px] p-10 md:p-14 mb-6" style={{ boxShadow: '0px 4px 24px rgba(0,0,0,0.08)' }}>
          <h1 className="text-3xl font-extrabold tracking-[-0.02em] mb-2" style={{ color: '#141413' }}>Security &amp; Safety</h1>
          <p className="text-base" style={{ color: '#696969' }}>
            InstaRishta is built with your safety as the first priority. Here&apos;s how we protect you, your family, and your data.
          </p>
        </div>

        {/* Safety features grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {SAFETY_ITEMS.map((item) => (
            <div key={item.title} className="bg-white rounded-[12px] p-7" style={{ boxShadow: '0px 2px 12px rgba(0,0,0,0.06)' }}>
              <span className="text-2xl mb-4 block">{item.icon}</span>
              <h2 className="text-sm font-bold mb-2" style={{ color: '#141413' }}>{item.title}</h2>
              <p className="text-sm leading-relaxed" style={{ color: '#696969' }}>{item.desc}</p>
            </div>
          ))}
        </div>

        {/* Legal documents */}
        <div className="bg-white rounded-[16px] p-8 mb-6" style={{ boxShadow: '0px 4px 24px rgba(0,0,0,0.08)' }}>
          <h2 className="text-base font-bold mb-1" style={{ color: '#141413' }}>Legal Documents</h2>
          <p className="text-sm mb-6" style={{ color: '#696969' }}>All platform policies, user rights, and legal terms in one place.</p>
          <div className="flex flex-col gap-3">
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-4 rounded-[10px] p-5 no-underline transition-all hover:-translate-y-[1px] hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)]"
                style={{ border: '1px solid #edebe9', background: '#fafaf9' }}
              >
                <span className="text-xl flex-shrink-0">{link.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold mb-0.5" style={{ color: '#141413' }}>{link.label}</p>
                  <p className="text-xs leading-relaxed" style={{ color: '#696969' }}>{link.desc}</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#696969" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        </div>

        {/* Report CTA */}
        <div className="rounded-[12px] p-8 text-center" style={{ background: '#1E3932', color: '#fff' }}>
          <h2 className="text-xl font-bold mb-3">Report a Safety Issue</h2>
          <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.65)' }}>
            If you encounter a fake profile, suspicious behaviour, or a child safety concern, contact our safety team immediately. We respond within 48 hours for standard reports and 2 hours for child safety issues.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <a href="mailto:safety@instarishta.me" className="btn-ghost inline-flex items-center gap-2">
              🚨 safety@instarishta.me
            </a>
            <a href="https://wa.me/918886667121" target="_blank" rel="noopener noreferrer" className="btn-ghost inline-flex items-center gap-2">
              💬 WhatsApp
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

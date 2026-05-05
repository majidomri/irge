import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy — InstaRishta',
  description: 'Learn how InstaRishta collects, uses, and protects your personal data.',
};

const SECTIONS = [
  {
    id: '1',
    title: 'Who We Are',
    body: `InstaRishta ("we," "our," or "us") is a Muslim matrimonial and matchmaking platform operated from Hyderabad, India. We connect serious Muslim men, women, and families seeking halal marriage proposals through a safe, family-first digital platform. Our website is https://www.instarishta.me and you can contact us at privacy@instarishta.me.`,
  },
  {
    id: '2',
    title: 'What This Policy Covers',
    body: `This Privacy Policy explains how InstaRishta collects, uses, stores, and shares your personal information when you use our website, services, or any features we offer. It also explains your rights over your data. By using InstaRishta, you agree to the practices described in this policy. If you do not agree, please do not use our services.`,
  },
  {
    id: '3',
    title: 'Information We Collect',
    items: [
      {
        subtitle: 'Information you provide directly',
        text: 'When you create an account or submit a profile, we collect your name, email address, phone number, gender, age, city, educational qualification, occupation, sect/maslak preference, and any biodata details you choose to share. You may also optionally provide a photo.',
      },
      {
        subtitle: 'Information from Google Sign-In',
        text: 'If you choose to sign in using your Google account, we receive your name, email address, and profile photo from Google. We use this only to create and manage your InstaRishta account. We do not access your Gmail, Google Contacts, Google Drive, or any other Google services. We do not use your Google data for advertising.',
      },
      {
        subtitle: 'Usage and technical data',
        text: 'We automatically collect information about how you use InstaRishta, including pages visited, features used, filters applied, and time spent. We also collect device type, browser type, operating system, IP address, and approximate location (city/region level) derived from your IP address.',
      },
      {
        subtitle: 'Communication data',
        text: 'If you contact us via email, WhatsApp, or our support channels, we retain those communications to resolve your query and improve our service.',
      },
    ],
  },
  {
    id: '4',
    title: 'Why We Collect Your Data (Legal Bases)',
    items: [
      { subtitle: 'Service delivery', text: 'To create and manage your account, display your profile to other users, and enable matrimonial introductions — our core service.' },
      { subtitle: 'Legitimate interest', text: 'To detect fraud, prevent fake profiles, improve our platform, and ensure platform security.' },
      { subtitle: 'Legal compliance', text: 'To comply with applicable Indian laws including the Information Technology Act 2000, and any court orders or regulatory obligations.' },
      { subtitle: 'Consent', text: 'For sending promotional emails or notifications — only where you have explicitly opted in. You can withdraw consent at any time.' },
    ],
  },
  {
    id: '5',
    title: 'How We Use Your Information',
    list: [
      'Create and maintain your InstaRishta account',
      'Display your profile to other verified users for matrimonial purposes',
      'Send you service emails (sign-in links, account notices)',
      'Respond to your support queries',
      'Detect and prevent spam, fake profiles, and abuse',
      'Improve our platform features and user experience',
      'Comply with legal obligations and enforce our Terms of Service',
      'Send promotional communications — only with your explicit consent',
    ],
  },
  {
    id: '6',
    title: 'Sharing Your Information',
    body: `We do not sell, rent, or trade your personal information to any third party for commercial purposes. We share your data only in the following limited circumstances:`,
    items: [
      { subtitle: 'Other InstaRishta members', text: 'Your profile (name, age, location, biodata details) is visible to other registered users for matrimonial purposes. Contact details are shared only when you explicitly choose to make them available.' },
      { subtitle: 'Service providers', text: 'We use Supabase (database and authentication hosting) and Cloudflare (CDN and security). These providers process your data only on our behalf under strict data processing agreements.' },
      { subtitle: 'Legal requirements', text: 'We may disclose your information if required by law, court order, or government authority, or to protect the rights, property, or safety of InstaRishta or others.' },
      { subtitle: 'Business transfers', text: 'In the event of a merger, acquisition, or sale of assets, your data may be transferred to the new operator, who will be bound by this Privacy Policy.' },
    ],
  },
  {
    id: '7',
    title: 'Data Retention',
    body: `We retain your personal data for as long as your account is active or as needed to provide our services. If you delete your account, we will permanently delete your profile and personal data within 30 days, except where we are required to retain it by law or for legitimate business purposes (e.g., fraud prevention records retained for up to 2 years). Anonymised, aggregated data may be retained indefinitely for analytics.`,
  },
  {
    id: '8',
    title: 'Data Security',
    body: `We implement appropriate technical and organisational measures to protect your personal information against unauthorised access, alteration, disclosure, or destruction. These include encrypted connections (HTTPS/TLS), secure database access controls, and regular security reviews. However, no method of transmission over the internet is 100% secure and we cannot guarantee absolute security.`,
  },
  {
    id: '9',
    title: 'Cookies and Tracking',
    body: `InstaRishta uses essential cookies to maintain your login session and remember your preferences. We do not use advertising cookies or third-party tracking pixels. We do not serve targeted advertising on our platform. Your browser settings can be used to control or delete cookies, though this may affect platform functionality.`,
  },
  {
    id: '10',
    title: 'Your Rights',
    body: `Regardless of where you are located, you have the following rights over your personal data:`,
    list: [
      'Access — request a copy of all personal data we hold about you',
      'Correction — request correction of inaccurate or incomplete data',
      'Deletion — request deletion of your account and personal data',
      'Portability — receive your data in a structured, machine-readable format',
      'Objection — object to processing based on legitimate interests',
      'Withdraw consent — withdraw consent for marketing communications at any time',
    ],
    footer: 'To exercise any of these rights, contact us at privacy@instarishta.me. We will respond within 30 days. Account deletion can also be initiated by contacting us directly.',
  },
  {
    id: '11',
    title: 'Google User Data — Specific Disclosure',
    body: `InstaRishta uses Google Sign-In (OAuth 2.0). When you sign in with Google, we receive your name, email address, and profile picture. This information is used solely to: (1) create and identify your InstaRishta account, (2) display your name within the platform, and (3) send you service notifications. We do not access any other Google account data. We do not share your Google account data with third parties. We do not use your Google data for advertising or profiling. You can revoke InstaRishta's access to your Google account at any time via https://myaccount.google.com/permissions.`,
  },
  {
    id: '12',
    title: 'Children\'s Privacy',
    body: `InstaRishta is strictly for users aged 18 and above. We do not knowingly collect personal information from anyone under the age of 18. If we learn that a minor has provided personal data, we will immediately delete that account and all associated data. If you believe a minor is using our platform, please report it to safety@instarishta.me.`,
  },
  {
    id: '13',
    title: 'International Data Transfers',
    body: `InstaRishta is based in India. Our servers are hosted by Supabase, which may store data in regions including the United States or European Union. By using InstaRishta, you consent to your data being transferred to and processed in these regions. We ensure such transfers comply with applicable laws.`,
  },
  {
    id: '14',
    title: 'Changes to This Policy',
    body: `We may update this Privacy Policy from time to time. We will notify you of significant changes by posting a notice on our website or sending an email to your registered address. The "Last updated" date at the top of this page will always reflect the most recent revision. Continued use of InstaRishta after changes constitutes acceptance.`,
  },
  {
    id: '15',
    title: 'Contact Us',
    body: `For privacy-related queries, requests, or complaints:\n\nEmail: privacy@instarishta.me\nWhatsApp: +91 888 666 7121\nAddress: InstaRishta, Hyderabad, Telangana, India\n\nWe aim to respond to all privacy enquiries within 30 days.`,
  },
];

export default function PrivacyPage() {
  return (
    <div style={{ background: '#f2f0eb' }} className="min-h-screen px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="text-sm font-semibold no-underline mb-8 inline-block" style={{ color: '#00754A' }}>
          ← Back to Home
        </Link>

        <div className="bg-white rounded-[16px] p-10 md:p-14 mb-6" style={{ boxShadow: '0px 4px 24px rgba(0,0,0,0.08)' }}>
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-4 text-[11px] font-bold uppercase tracking-[0.08em]"
            style={{ background: 'rgba(0,117,74,0.08)', color: '#006241', border: '1px solid rgba(0,117,74,0.15)' }}>
            Legal Document
          </div>
          <h1 className="text-3xl font-extrabold tracking-[-0.02em] mb-2" style={{ color: '#141413' }}>Privacy Policy</h1>
          <p className="text-sm" style={{ color: '#696969' }}>Last updated: 5 May 2026 &nbsp;·&nbsp; Effective: 1 January 2025</p>
        </div>

        {/* TOC */}
        <div className="bg-white rounded-[12px] p-7 mb-6" style={{ boxShadow: '0px 2px 8px rgba(0,0,0,0.06)' }}>
          <h2 className="text-sm font-bold uppercase tracking-[0.08em] mb-4" style={{ color: '#696969' }}>Table of Contents</h2>
          <ol className="flex flex-col gap-1.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#s${s.id}`} className="text-sm no-underline hover:underline" style={{ color: '#006241' }}>
                  {s.id}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </div>

        <div className="bg-white rounded-[16px] p-10 md:p-14" style={{ boxShadow: '0px 4px 24px rgba(0,0,0,0.08)' }}>
          <div className="flex flex-col gap-10">
            {SECTIONS.map((s) => (
              <section key={s.id} id={`s${s.id}`} className="pb-10 border-b last:border-0" style={{ borderColor: '#edebe9' }}>
                <h2 className="text-base font-bold mb-4" style={{ color: '#141413' }}>
                  <span style={{ color: '#00754A' }}>{s.id}.</span> {s.title}
                </h2>

                {s.body && (
                  <p className="text-sm leading-relaxed whitespace-pre-line mb-4" style={{ color: '#696969' }}>{s.body}</p>
                )}

                {s.items && (
                  <div className="flex flex-col gap-4 mt-2">
                    {s.items.map((item) => (
                      <div key={item.subtitle} className="rounded-[10px] p-5" style={{ background: '#fafaf9', border: '1px solid #edebe9' }}>
                        <p className="text-sm font-semibold mb-1.5" style={{ color: '#141413' }}>{item.subtitle}</p>
                        <p className="text-sm leading-relaxed" style={{ color: '#696969' }}>{item.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                {s.list && (
                  <ul className="flex flex-col gap-2 mt-2">
                    {s.list.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm leading-relaxed" style={{ color: '#696969' }}>
                        <span className="mt-[3px] flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: 'rgba(0,117,74,0.1)', color: '#006241' }}>✓</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                )}

                {'footer' in s && s.footer && (
                  <p className="text-sm leading-relaxed mt-4" style={{ color: '#696969' }}>{s.footer}</p>
                )}
              </section>
            ))}
          </div>

          <div className="mt-8 rounded-[12px] p-6 text-center" style={{ background: 'rgba(0,117,74,0.06)', border: '1px solid rgba(0,117,74,0.15)' }}>
            <p className="text-sm font-semibold mb-1" style={{ color: '#141413' }}>Privacy questions?</p>
            <p className="text-sm mb-4" style={{ color: '#696969' }}>Contact our privacy team — we respond within 30 days.</p>
            <a href="mailto:privacy@instarishta.me" className="btn-brand" style={{ display: 'inline-flex' }}>
              privacy@instarishta.me
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
